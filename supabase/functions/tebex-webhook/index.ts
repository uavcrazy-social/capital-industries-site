import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const PACKAGE_RANK_MAP: Record<string, string> = {
  "7490093": "member",
  "7490099": "premium",
  "7490104": "elite"
};

const RANK_PACKAGE_NAMES: Record<string, string> = {
  member: "Member",
  premium: "Premium",
  elite: "Elite"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function sha256Hex(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const buffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeSignature(signature: string): string {
  const trimmed = signature.trim();
  const prefixMatch = trimmed.match(/(?:sha256=|signature=)([a-f0-9]+)/i);

  if (prefixMatch) {
    return prefixMatch[1].toLowerCase();
  }

  return trimmed.toLowerCase();
}

function timingSafeEqualHex(left: string, right: string): boolean {
  const a = normalizeSignature(left);
  const b = normalizeSignature(right);

  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

async function verifyTebexSignature(
  rawBody: string,
  webhookSecret: string,
  providedSignature: string | null
): Promise<boolean> {
  if (!providedSignature) {
    return false;
  }

  const bodyHash = await sha256Hex(rawBody);
  const expectedSignature = await hmacSha256Hex(webhookSecret, bodyHash);

  return timingSafeEqualHex(expectedSignature, providedSignature);
}

function mapRankFromProduct(product: Record<string, unknown>): string {
  const id = String(product.id || "");
  if (PACKAGE_RANK_MAP[id]) {
    return PACKAGE_RANK_MAP[id];
  }

  const name = String(product.name || "").toLowerCase();
  if (name.includes("elite")) return "elite";
  if (name.includes("premium")) return "premium";
  if (name.includes("member")) return "member";
  return "";
}

function parseCustom(subject: Record<string, unknown>): Record<string, unknown> {
  const custom = subject.custom;

  if (custom && typeof custom === "object") {
    return custom as Record<string, unknown>;
  }

  return {};
}

function getMinecraftUsername(subject: Record<string, unknown>): string {
  const customer = (subject.customer || {}) as Record<string, unknown>;
  const customerUsername = (customer.username || {}) as Record<string, unknown>;

  return String(customerUsername.username || "").trim();
}

async function resolveUserId(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>,
  minecraftUsername: string
): Promise<string | null> {
  const custom = parseCustom(subject);
  const customUserId = String(custom.supabase_user_id || "").trim();

  if (customUserId) {
    return customUserId;
  }

  if (!minecraftUsername) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("minecraft_username", minecraftUsername)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve profile", error);
  }

  return data?.id || null;
}

async function insertPurchaseEvent(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>,
  eventType: string,
  status: string
): Promise<void> {
  const transactionId = String(subject.transaction_id || subject.id || crypto.randomUUID()).trim();
  const minecraftUsername = getMinecraftUsername(subject) || "unknown";
  const userId = await resolveUserId(supabase, subject, minecraftUsername);
  const pricePaid = (subject.price_paid || subject.price || {}) as Record<string, unknown>;
  const amount = Number(pricePaid.amount || 0);
  const currency = String(pricePaid.currency || "USD");

  const { error } = await supabase.from("purchases").insert({
    user_id: userId,
    minecraft_username: minecraftUsername,
    tebex_transaction_id: `${transactionId}:${eventType}:${Date.now()}`,
    event_type: eventType,
    status,
    amount,
    currency,
    purchased_at: String(subject.settled_at || subject.created_at || new Date().toISOString()),
    raw_payload: subject
  });

  if (error) {
    console.error("Failed to insert purchase event", error);
  }
}

async function handlePaymentCompleted(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>
): Promise<void> {
  const transactionId = String(subject.transaction_id || "").trim();
  if (!transactionId) {
    return;
  }

  const minecraftUsername = getMinecraftUsername(subject);
  const userId = await resolveUserId(supabase, subject, minecraftUsername);
  const products = Array.isArray(subject.products) ? subject.products : [];
  const primaryProduct = (products[0] || {}) as Record<string, unknown>;
  const rankKey = mapRankFromProduct(primaryProduct);
  const pricePaid = (subject.price_paid || subject.price || {}) as Record<string, unknown>;
  const amount = Number(pricePaid.amount || 0);
  const currency = String(pricePaid.currency || "USD");
  const recurringRef = String(subject.recurring_payment_reference || "").trim() || null;
  const statusText = String((subject.status as Record<string, unknown>)?.description || "Complete");
  const isRecurring = String(subject.payment_sequence || "") !== "oneoff";
  const expiresAt = primaryProduct.expires_at ? String(primaryProduct.expires_at) : null;

  const { data: existingPurchase } = await supabase
    .from("purchases")
    .select("id")
    .eq("tebex_transaction_id", transactionId)
    .maybeSingle();

  if (existingPurchase) {
    return;
  }

  let subscriptionId: string | null = null;

  if (rankKey && (isRecurring || recurringRef)) {
    if (userId) {
      await supabase
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId)
        .eq("status", "active");
    }

    if (minecraftUsername) {
      await supabase
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .ilike("minecraft_username", minecraftUsername)
        .eq("status", "active");
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        minecraft_username: minecraftUsername || "unknown",
        rank_key: rankKey,
        tebex_transaction_id: transactionId,
        tebex_recurring_reference: recurringRef,
        status: "active",
        package_name: String(primaryProduct.name || RANK_PACKAGE_NAMES[rankKey] || rankKey),
        price_amount: amount,
        price_currency: currency,
        current_period_end: expiresAt,
        updated_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (subscriptionError) {
      console.error("Failed to insert subscription", subscriptionError);
    } else {
      subscriptionId = subscription?.id || null;
    }
  }

  const { error: purchaseError } = await supabase.from("purchases").insert({
    user_id: userId,
    subscription_id: subscriptionId,
    minecraft_username: minecraftUsername || "unknown",
    rank_key: rankKey || null,
    tebex_transaction_id: transactionId,
    event_type: "payment.completed",
    status: statusText,
    amount,
    currency,
    purchased_at: String(subject.settled_at || subject.created_at || new Date().toISOString()),
    raw_payload: subject
  });

  if (purchaseError) {
    console.error("Failed to insert purchase", purchaseError);
  }
}

async function handlePaymentRefunded(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>
): Promise<void> {
  const transactionId = String(subject.transaction_id || "").trim();
  if (!transactionId) {
    return;
  }

  await supabase
    .from("subscriptions")
    .update({
      status: "refunded",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("tebex_transaction_id", transactionId);

  await insertPurchaseEvent(supabase, subject, "payment.refunded", "Refunded");
}

async function handlePaymentDeclined(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>
): Promise<void> {
  await insertPurchaseEvent(supabase, subject, "payment.declined", "Declined");
}

async function handleRecurringEnded(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>,
  eventType: string
): Promise<void> {
  const recurringRef = String(subject.reference || subject.recurring_payment_reference || "").trim();

  if (recurringRef) {
    await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("tebex_recurring_reference", recurringRef)
      .eq("status", "active");
  }

  await insertPurchaseEvent(supabase, subject, eventType, "Canceled");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await request.text();
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const type = String(payload.type || "");

  // Tebex endpoint validation only requires echoing the webhook id.
  // This is intentionally before Supabase DB config checks so validation can work
  // even before all database-write secrets are configured.
  if (type === "validation.webhook") {
    return jsonResponse({ id: payload.id });
  }

  const webhookSecret = Deno.env.get("TEBEX_WEBHOOK_SECRET");
  const signature = request.headers.get("X-Signature") || request.headers.get("x-signature");

  if (!webhookSecret) {
    console.error("TEBEX_WEBHOOK_SECRET is not configured");
    return jsonResponse({ error: "Webhook secret not configured" }, 500);
  }

  const validSignature = await verifyTebexSignature(rawBody, webhookSecret, signature);
  if (!validSignature) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  const subject = (payload.subject || {}) as Record<string, unknown>;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    if (type === "payment.completed") {
      await handlePaymentCompleted(supabase, subject);
    } else if (type === "payment.refunded") {
      await handlePaymentRefunded(supabase, subject);
    } else if (type === "payment.declined") {
      await handlePaymentDeclined(supabase, subject);
    } else if (type === "recurring-payment.ended") {
      await handleRecurringEnded(supabase, subject, type);
    } else {
      await insertPurchaseEvent(supabase, subject, type, "Received");
    }
  } catch (error) {
    console.error("Webhook processing failed", error);
    return jsonResponse({ error: "Webhook processing failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
