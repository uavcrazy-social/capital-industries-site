(function () {
  "use strict";

  function getToken() {
    return String(window.CAPITAL_TEBEX_PUBLIC_TOKEN || "").trim();
  }

  function launchPortal() {
    var token = getToken();

    if (!token) {
      window.open("https://checkout.tebex.io/", "_blank", "noopener,noreferrer");
      return;
    }

    if (!window.Tebex || !window.Tebex.portal) {
      window.open("https://checkout.tebex.io/", "_blank", "noopener,noreferrer");
      return;
    }

    window.Tebex.portal.init({
      token: token,
      theme: "dark",
      colors: [
        { name: "primary", color: "#ff8a18" },
        { name: "secondary", color: "#ffad45" }
      ]
    });

    window.Tebex.portal.launch();
  }

  window.CapitalTebexPortal = {
    launch: launchPortal
  };
}());
