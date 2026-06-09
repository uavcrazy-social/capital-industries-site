(function () {
  "use strict";

  /**
   * Fill these from Tebex Control Panel.
   * Public token and package IDs are public identifiers. Do not put a private
   * key, secret key, webhook secret, or API secret in this browser file.
   */
  var TEBEX_PUBLIC_TOKEN = "REPLACE_WITH_TEBEX_PUBLIC_TOKEN";
  var PACKAGE_IDS = {
    member: "REPLACE_WITH_MEMBER_PACKAGE_ID",
    premium: "REPLACE_WITH_PREMIUM_PACKAGE_ID",
    elite: "REPLACE_WITH_ELITE_PACKAGE_ID"
  };

  var USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
  var HEADLESS_API_BASE = "https://headless.tebex.io/api";

  function getStatusElement() {
    return document.getElementById("checkout-status");
  }

  function setStatus(message) {
    var status = getStatusElement();

    if (status) {
      status.textContent = message;
    }
  }

  function getUsername() {
    var input = document.getElementById("minecraft-username");

    if (!input) {
      return "";
    }

    return input.value.trim();
  }

  function getCheckoutUrl(path) {
    return HEADLESS_API_BASE + path;
  }

  function getReturnUrl(state) {
    var url = new URL(window.location.href);
    url.searchParams.set("checkout", state);
    return url.toString();
  }

  function unwrapTebexPayload(payload) {
    if (payload && payload.data) {
      return payload.data;
    }

    return payload;
  }

  function assertConfigured() {
    if (!TEBEX_PUBLIC_TOKEN || TEBEX_PUBLIC_TOKEN.indexOf("REPLACE_WITH_") === 0) {
      throw new Error("Tebex public token is not configured.");
    }
  }

  function assertPackageConfigured(packageKey) {
    var packageId = PACKAGE_IDS[packageKey];

    if (!packageId || packageId.indexOf("REPLACE_WITH_") === 0) {
      throw new Error("Tebex package ID is not configured for " + packageKey + ".");
    }

    return packageId;
  }

  function setButtonState(disabled) {
    var buttons = document.querySelectorAll("[data-tebex-package]");

    buttons.forEach(function (button) {
      button.disabled = disabled;
      button.setAttribute("aria-busy", disabled ? "true" : "false");
    });
  }

  async function requestJson(url, options) {
    var response = await fetch(url, options);
    var payload = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(
        payload.detail ||
        payload.message ||
        payload.error ||
        "Tebex request failed."
      );
    }

    return unwrapTebexPayload(payload);
  }

  async function createBasket(username) {
    return requestJson(
      getCheckoutUrl("/accounts/" + encodeURIComponent(TEBEX_PUBLIC_TOKEN) + "/baskets"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          complete_url: getReturnUrl("complete"),
          cancel_url: getReturnUrl("cancelled"),
          complete_auto_redirect: true,
          custom: {
            source: "capital-industries-store"
          }
        })
      }
    );
  }

  async function addPackageToBasket(basket, packageId) {
    var basketIdent = basket.ident;
    var body = {
      package_id: String(packageId),
      quantity: 1
    };

    if (basket.username_id) {
      body.variable_data = {
        username_id: String(basket.username_id)
      };
    }

    return requestJson(
      getCheckoutUrl("/baskets/" + encodeURIComponent(basketIdent) + "/packages"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
  }

  async function getBasketAuthUrl(basketIdent) {
    var returnUrl = getReturnUrl("auth-return");
    var data = await requestJson(
      getCheckoutUrl(
        "/accounts/" + encodeURIComponent(TEBEX_PUBLIC_TOKEN) +
        "/baskets/" + encodeURIComponent(basketIdent) +
        "/auth?returnUrl=" + encodeURIComponent(returnUrl)
      ),
      {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (Array.isArray(data) && data.length > 0 && data[0].url) {
      return data[0].url;
    }

    if (data && data.url) {
      return data.url;
    }

    return "";
  }

  function launchCheckout(ident) {
    if (!window.Tebex || !window.Tebex.checkout) {
      throw new Error("Tebex checkout script did not load.");
    }

    window.Tebex.checkout.init({
      ident: ident,
      locale: "en_US",
      theme: "dark",
      colors: [
        {
          name: "primary",
          color: "#ff8a18"
        },
        {
          name: "secondary",
          color: "#ffad45"
        }
      ]
    });

    window.Tebex.checkout.launch();
  }

  async function handleBuyClick(event) {
    var packageKey = event.currentTarget.getAttribute("data-tebex-package");
    var username = getUsername();

    if (!USERNAME_PATTERN.test(username)) {
      setStatus("Enter a valid Java username: 3-16 letters, numbers, or underscores.");
      return;
    }

    try {
      setButtonState(true);
      setStatus("Creating secure Tebex checkout...");

      assertConfigured();
      var packageId = assertPackageConfigured(packageKey);
      var basket = await createBasket(username);

      if (!basket || !basket.ident) {
        throw new Error("Tebex did not return a basket ident.");
      }

      var checkoutBasket = await addPackageToBasket(basket, packageId);
      var checkoutIdent = checkoutBasket.ident || basket.ident;

      setStatus("Opening checkout...");
      launchCheckout(checkoutIdent);
      setStatus("");
    } catch (error) {
      console.error(error);

      if (error.message && error.message.toLowerCase().indexOf("auth") !== -1) {
        try {
          var usernameForRetry = getUsername();
          var retryBasket = await createBasket(usernameForRetry);
          var authUrl = await getBasketAuthUrl(retryBasket.ident);

          if (authUrl) {
            window.location.href = authUrl;
            return;
          }
        } catch (authError) {
          console.error(authError);
        }
      }

      setStatus(error.message || "Unable to open Tebex checkout.");
    } finally {
      setButtonState(false);
    }
  }

  function initializeCheckoutButtons() {
    var buttons = document.querySelectorAll("[data-tebex-package]");

    buttons.forEach(function (button) {
      button.addEventListener("click", handleBuyClick);
    });
  }

  initializeCheckoutButtons();
}());
