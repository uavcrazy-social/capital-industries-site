const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
let supabase = null;

function accountRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const returnPath = params.get("return");
  const reason = params.get("reason");
  const setup = params.get("setup");
  const redirectParams = new URLSearchParams();

  if (returnPath && returnPath.charAt(0) === "/" && returnPath.indexOf("//") !== 0) {
    redirectParams.set("return", returnPath);
  }

  if (reason) {
    redirectParams.set("reason", reason);
  }

  if (setup === "1") {
    redirectParams.set("setup", "1");
  }

  const query = redirectParams.toString();
  return window.location.origin + "/account/" + (query ? "?" + query : "");
}

function normalizeUsername(username) {
  const trimmed = String(username || "").trim();

  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error("Username must be 3-16 letters, numbers, or underscores.");
  }

  return trimmed;
}

async function getSession() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

async function getSessionUser() {
  const session = await getSession();
  return session ? session.user : null;
}

async function getProfile() {
  const user = await getSessionUser();

  if (!user || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, minecraft_username, username_confirmed, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function friendlyProfileError(error) {
  const message = String(error?.message || error || "");

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error("Could not reach account services. Check your connection and try again.");
  }

  if (error?.code === "42501" || /row-level security|permission denied/i.test(message)) {
    return new Error("Could not save username right now. Please try again later.");
  }

  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    return new Error("This Minecraft username is already linked to another account.");
  }

  return error instanceof Error ? error : new Error(message || "Could not save username.");
}

async function isUsernameAvailable(username) {
  const user = await getSessionUser();

  if (!user || !supabase) {
    return false;
  }

  const normalized = normalizeUsername(username);
  const { data, error } = await supabase.rpc("is_minecraft_username_available", {
    p_username: normalized
  });

  if (error) {
    if (error.code === "42883") {
      return true;
    }
    throw friendlyProfileError(error);
  }

  return Boolean(data);
}

async function upsertProfile(minecraftUsername, usernameConfirmed) {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Continue with Google or Discord to access your account.");
  }

  const username = normalizeUsername(minecraftUsername);

  if (!usernameConfirmed) {
    throw new Error("Confirm that the Minecraft username is your current in-game name.");
  }

  const available = await isUsernameAvailable(username);

  if (!available) {
    throw new Error("This Minecraft username is already linked to another account.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        minecraft_username: username,
        username_confirmed: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    )
    .select("id, minecraft_username, username_confirmed, updated_at")
    .single();

  if (error) {
    throw friendlyProfileError(error);
  }

  return data;
}

async function signInWithOAuth(provider) {
  if (!supabase) {
    throw new Error("Account sign-in is temporarily unavailable.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: provider,
    options: {
      redirectTo: accountRedirectUrl()
    }
  });

  if (error) {
    throw error;
  }
}

async function signOut() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

async function hasCompleteProfile() {
  const profile = await getProfile();
  return Boolean(
    profile &&
    profile.minecraft_username &&
    profile.username_confirmed
  );
}

async function getMinecraftUsername() {
  const profile = await getProfile();
  return profile ? profile.minecraft_username || "" : "";
}

async function isLoggedIn() {
  return Boolean(await getSessionUser());
}

async function getActiveSubscription() {
  const user = await getSessionUser();

  if (!user || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, rank_key, status, package_name, price_amount, price_currency, started_at, current_period_end, canceled_at, minecraft_username, tebex_recurring_reference"
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return null;
    }
    throw error;
  }

  return data;
}

async function getPurchaseHistory(limit) {
  const user = await getSessionUser();
  const maxRows = limit || 25;

  if (!user || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, rank_key, status, event_type, amount, currency, purchased_at, minecraft_username, tebex_transaction_id"
    )
    .eq("user_id", user.id)
    .order("purchased_at", { ascending: false })
    .limit(maxRows);

  if (error) {
    if (error.code === "42P01") {
      return [];
    }
    throw error;
  }

  return data || [];
}

function getConnectedProviders(user) {
  if (!user) {
    return [];
  }

  const providers = new Set();

  if (Array.isArray(user.identities)) {
    user.identities.forEach(function (identity) {
      if (identity && identity.provider) {
        providers.add(identity.provider);
      }
    });
  }

  if (user.app_metadata && user.app_metadata.provider) {
    providers.add(user.app_metadata.provider);
  }

  if (Array.isArray(user.app_metadata && user.app_metadata.providers)) {
    user.app_metadata.providers.forEach(function (provider) {
      providers.add(provider);
    });
  }

  return Array.from(providers);
}

async function notifyUsernameSetupIfNeeded() {
  if (!supabase) {
    return;
  }

  try {
    const user = await getSessionUser();

    if (!user) {
      return;
    }

    if (await hasCompleteProfile()) {
      return;
    }

    window.dispatchEvent(new CustomEvent("capital:username-setup-required"));
  } catch (error) {
    console.error(error);
  }
}

function onAuthStateChange(callback) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe: function () {} } } };
  }

  return supabase.auth.onAuthStateChange(callback);
}

function assignLiveApi() {
  const auth = window.CapitalAuth;

  auth.configured = true;
  auth.USERNAME_PATTERN = USERNAME_PATTERN;
  auth.normalizeUsername = normalizeUsername;
  auth.accountRedirectUrl = accountRedirectUrl;
  auth.onAuthStateChange = onAuthStateChange;
  auth.signInWithGoogle = function () {
    return signInWithOAuth("google");
  };
  auth.signInWithDiscord = function () {
    return signInWithOAuth("discord");
  };
  auth.signOut = signOut;
  auth.getSession = getSession;
  auth.getSessionUser = getSessionUser;
  auth.getProfile = getProfile;
  auth.upsertProfile = upsertProfile;
  auth.hasCompleteProfile = hasCompleteProfile;
  auth.getMinecraftUsername = getMinecraftUsername;
  auth.isLoggedIn = isLoggedIn;
  auth.isUsernameAvailable = isUsernameAvailable;
  auth.getActiveSubscription = getActiveSubscription;
  auth.getPurchaseHistory = getPurchaseHistory;
  auth.getConnectedProviders = getConnectedProviders;
}

function assignOfflineApi(message) {
  const auth = window.CapitalAuth;
  const errorMessage = message || "Account services are temporarily unavailable.";

  auth.configured = false;
  auth.USERNAME_PATTERN = USERNAME_PATTERN;
  auth.normalizeUsername = normalizeUsername;
  auth.accountRedirectUrl = accountRedirectUrl;
  auth.isLoggedIn = async function () {
    return false;
  };
  auth.getSessionUser = async function () {
    return null;
  };
  auth.getProfile = async function () {
    return null;
  };
  auth.hasCompleteProfile = async function () {
    return false;
  };
  auth.getMinecraftUsername = async function () {
    return "";
  };
  auth.signInWithGoogle = function () {
    return Promise.reject(new Error(errorMessage));
  };
  auth.signInWithDiscord = function () {
    return Promise.reject(new Error(errorMessage));
  };
  auth.signOut = async function () {};
  auth.upsertProfile = function () {
    return Promise.reject(new Error(errorMessage));
  };
  auth.onAuthStateChange = function () {
    return { data: { subscription: { unsubscribe: function () {} } } };
  };
  auth.isUsernameAvailable = async function () {
    return false;
  };
  auth.getActiveSubscription = async function () {
    return null;
  };
  auth.getPurchaseHistory = async function () {
    return [];
  };
  auth.getConnectedProviders = function () {
    return [];
  };
}

async function boot() {
  const url = String(window.CAPITAL_SUPABASE_URL || "").trim();
  const anonKey = String(window.CAPITAL_SUPABASE_ANON_KEY || "").trim();
  const isConfigured =
    url &&
    anonKey &&
    url.indexOf("REPLACE_WITH_") === -1 &&
    anonKey.indexOf("REPLACE_WITH_") === -1;

  if (!isConfigured) {
    assignOfflineApi("Account services are temporarily unavailable.");
    window.CapitalAuth.markReady();
    return;
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.8");

    supabase = createClient(url, anonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true
      }
    });

    await supabase.auth.getSession();
    assignLiveApi();
    await notifyUsernameSetupIfNeeded();

    supabase.auth.onAuthStateChange(function (event) {
      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED"
      ) {
        notifyUsernameSetupIfNeeded();
      }
    });
  } catch (error) {
    console.error(error);
    assignOfflineApi("Account services failed to load.");
  }

  window.CapitalAuth.markReady();
}

boot();
