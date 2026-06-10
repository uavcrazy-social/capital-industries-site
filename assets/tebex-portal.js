(function () {
  "use strict";

  var PORTAL_ENDPOINT = "https://portal.tebex.io";
  var PORTAL_FALLBACK_URL = "https://portal.tebex.io/";
  var TEBEX_READY_TIMEOUT_MS = 12000;

  function getToken() {
    return String(window.CAPITAL_TEBEX_PUBLIC_TOKEN || "").trim();
  }

  function waitForTebexPortal() {
    return new Promise(function (resolve, reject) {
      var started = Date.now();

      function check() {
        if (window.Tebex && window.Tebex.portal) {
          resolve(window.Tebex.portal);
          return;
        }

        if (Date.now() - started >= TEBEX_READY_TIMEOUT_MS) {
          reject(new Error("Subscription manager failed to load. Please try again."));
          return;
        }

        window.setTimeout(check, 40);
      }

      check();
    });
  }

  function openPortalFallback() {
    var popup = window.open(PORTAL_FALLBACK_URL, "_blank", "noopener,noreferrer");

    if (!popup) {
      window.location.href = PORTAL_FALLBACK_URL;
    }
  }

  function initPortal(portal) {
    var token = getToken();

    if (!token) {
      throw new Error("Subscription manager is temporarily unavailable.");
    }

    portal.init({
      token: token,
      theme: "dark",
      endpoint: PORTAL_ENDPOINT,
      colors: [
        { name: "primary", color: "#ff8a18" },
        { name: "secondary", color: "#ffad45" }
      ]
    });
  }

  async function launchPortal() {
    var token = getToken();

    if (!token) {
      openPortalFallback();
      return { mode: "fallback" };
    }

    try {
      var portal = await waitForTebexPortal();
      initPortal(portal);
      portal.launch();
      return { mode: "portal" };
    } catch (error) {
      console.error(error);
      openPortalFallback();
      return { mode: "fallback", error: error };
    }
  }

  window.CapitalTebexPortal = {
    launch: launchPortal
  };
}());
