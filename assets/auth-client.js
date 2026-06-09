import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const url = String(window.CAPITAL_SUPABASE_URL || "").trim();
const anonKey = String(window.CAPITAL_SUPABASE_ANON_KEY || "").trim();
const isConfigured =
  url &&
  anonKey &&
  url.indexOf("REPLACE_WITH_") === -1 &&
  anonKey.indexOf("REPLACE_WITH_") === -1;

let supabase = null;
let readyResolve;
const readyPromise = new Promise(function (resolve) {
  readyResolve = resolve;
});

function accountRedirectUrl() {
  return window.location.origin + "/account/";
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

  if (!user) {
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

async function boot() {
  if (!isConfigured) {
    window.CapitalAuth = {
      configured: false,
      USERNAME_PATTERN: USERNAME_PATTERN,
      ready: function () {
        return readyPromise;
      },
      lookupMinecraftUsername: lookupMinecraftUsername
    };
    readyResolve();
    return;
  }

  supabase = createClient(url, anonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  await supabase.auth.getSession();

  window.CapitalAuth = {
    configured: true,
    USERNAME_PATTERN: USERNAME_PATTERN,
    ready: function () {
      return readyPromise;
    },
    signInWithGoogle: function () {
      return signInWithOAuth("google");
    },
    signInWithDiscord: function () {
      return signInWithOAuth("discord");
    },
    signOut: signOut,
    getSession: getSession,
    getSessionUser: getSessionUser,
    getProfile: getProfile,
    upsertProfile: upsertProfile,
    lookupMinecraftUsername: lookupMinecraftUsername,
    hasCompleteProfile: hasCompleteProfile,
    getMinecraftUsername: getMinecraftUsername,
    isLoggedIn: isLoggedIn,
    onAuthStateChange: onAuthStateChange,
    accountRedirectUrl: accountRedirectUrl
  };

  readyResolve();
}

boot().catch(function (error) {
  console.error(error);
  window.CapitalAuth = {
    configured: false,
    USERNAME_PATTERN: USERNAME_PATTERN,
    ready: function () {
      return readyPromise;
    },
    lookupMinecraftUsername: lookupMinecraftUsername
  };
  readyResolve();
});
