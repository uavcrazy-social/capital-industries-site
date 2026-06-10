(function () {
  "use strict";

  /**
   * Public Supabase project URL and anon key.
   * Replace placeholders after creating the Supabase project.
   * The anon key is safe in static frontend code when RLS is enabled.
   */
  window.CAPITAL_SUPABASE_URL = "https://raogugmrnogzursigbha.supabase.co";
  window.CAPITAL_SUPABASE_ANON_KEY = "sb_publishable_Mgg-uscQv8MUo8bmIREQzg_XqSz2pwL";

  var readyResolve;
  var readyPromise = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  window.CapitalAuth = {
    configured: false,
    USERNAME_PATTERN: /^[A-Za-z0-9_]{3,16}$/,
    ready: function () {
      return readyPromise;
    },
    markReady: function () {
      if (readyResolve) {
        readyResolve();
        readyResolve = null;
      }
    },
    accountRedirectUrl: function () {
      return window.location.origin + "/account/";
    },
    isLoggedIn: function () {
      return Promise.resolve(false);
    },
    getSessionUser: function () {
      return Promise.resolve(null);
    },
    getProfile: function () {
      return Promise.resolve(null);
    },
    hasCompleteProfile: function () {
      return Promise.resolve(false);
    },
    getMinecraftUsername: function () {
      return Promise.resolve("");
    },
    signInWithGoogle: function () {
      return Promise.reject(new Error("Account services are still loading."));
    },
    signInWithDiscord: function () {
      return Promise.reject(new Error("Account services are still loading."));
    },
    signOut: function () {
      return Promise.resolve();
    },
    upsertProfile: function () {
      return Promise.reject(new Error("Account services are still loading."));
    },
    normalizeUsername: function (username) {
      const trimmed = String(username || "").trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) {
        throw new Error("Username must be 3-16 letters, numbers, or underscores.");
      }
      return trimmed;
    },
    onAuthStateChange: function () {
      return { data: { subscription: { unsubscribe: function () {} } } };
    }
  };
}());
