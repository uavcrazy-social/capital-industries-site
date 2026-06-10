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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function mapRankFromProduct(product: Record<string, unknown>) {
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

function parseCustom(subject: Record<string, unknown>) {
  const custom = subject.custom;

  if (custom && typeof custom === "object") {
    return custom as Record<string, unknown>;
  }

  return {};
}

async function resolveUserId(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>,
  minecraftUsername: string
) {
  const custom = parseCustom(subject);
  const customUserId = String(custom.supabase_user_id || "").trim();

  if (customUserId) {
    return customUserId;
  }

  if (!minecraftUsername) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .ilike("minecraft_username", minecraftUsername)
    .maybeSingle();

  return data?.id || null;
}

async function handlePaymentCompleted(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>
) {
  const transactionId = String(subject.transaction_id || "").trim();
  if (!transactionId) {
    return;
  }

  const customer = (subject.customer || {}) as Record<string, unknown>;
  const customerUsername = (customer.username || {}) as Record<string, unknown>;
  const minecraftUsername = String(customerUsername.username || "").trim();
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
      console.error(subscriptionError);
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
    console.error(purchaseError);
  }
}

async function handlePaymentRefunded(
  supabase: ReturnType<typeof createClient>,
  subject: Record<string, unknown>
) {
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

  await supabase.from("purchases").insert({
    user_id: null,
    minecraft_username: String(
      ((subject.customer as Record<string, unknown>)?.username as Record<string, unknown>)?.username || "unknown"
    ),
    tebex_transaction_id: transactionId + ":refund:" + Date.now(),
    event_type: "payment.refunded",
    status: "Refunded",
    raw_payload: subject
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  const rawBody = await request.text();
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const webhookSecret = Deno.env.get("TEBEX_WEBHOOK_SECRET");
  const signature = request.headers.get("X-Signature") || request.headers.get("x-signature");

  if (webhookSecret && signature) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    if (expected !== signature && signature !== expected) {
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  }

  const type = String(payload.type || "");
  const subject = (payload.subject || {}) as Record<string, unknown>;

  if (type === "validation.webhook") {
    return jsonResponse({ id: payload.id });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    if (type === "payment.completed") {
      await handlePaymentCompleted(supabase, subject);
    }

    if (type === "payment.refunded" || type === "payment.declined") {
      await handlePaymentRefunded(supabase, subject);
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Webhook processing failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
