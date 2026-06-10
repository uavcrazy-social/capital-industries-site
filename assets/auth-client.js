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

async function lookupMinecraftUsername(username) {
  const trimmed = String(username || "").trim();

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      username: trimmed,
      error: "Username must be 3-16 letters, numbers, or underscores."
    };
  }

  const response = await fetch(
    "https://api.mojang.com/users/profiles/minecraft/" + encodeURIComponent(trimmed),
    {
      method: "GET",
      headers: { Accept: "application/json" }
    }
  );

  if (response.status === 204 || response.status === 404) {
    return {
      valid: false,
      username: trimmed,
      error: "That Minecraft username was not found."
    };
  }

  if (!response.ok) {
    throw new Error("Mojang lookup failed.");
  }

  const profile = await response.json();
  return {
    valid: true,
    username: profile.name || trimmed,
    uuid: profile.id || null
  };
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

async function upsertProfile(minecraftUsername, usernameConfirmed) {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Continue with Google or Discord to access your account.");
  }

  const lookup = await lookupMinecraftUsername(minecraftUsername);

  if (!lookup.valid) {
    throw new Error(lookup.error || "Minecraft username is not valid.");
  }

  if (!usernameConfirmed) {
    throw new Error("Confirm that the Minecraft username is your current in-game name.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      minecraft_username: lookup.username,
      username_confirmed: true,
      updated_at: new Date().toISOString()
    })
    .select("id, minecraft_username, username_confirmed, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function signInWithOAuth(provider) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
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
  auth.accountRedirectUrl = accountRedirectUrl;
  auth.lookupMinecraftUsername = lookupMinecraftUsername;
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
}

function assignOfflineApi(message) {
  const auth = window.CapitalAuth;
  const errorMessage = message || "Supabase is not configured.";

  auth.configured = false;
  auth.USERNAME_PATTERN = USERNAME_PATTERN;
  auth.lookupMinecraftUsername = lookupMinecraftUsername;
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
    assignOfflineApi("Supabase is not configured.");
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
  } catch (error) {
    console.error(error);
    assignOfflineApi("Account services failed to load.");
  }

  window.CapitalAuth.markReady();
}

boot();
