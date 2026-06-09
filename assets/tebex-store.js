(function () {
  "use strict";

  var RANK_PURCHASES_ENABLED = true;

  var TEBEX_PUBLIC_TOKEN = "13bmd-225b100e916451ed82c9e96183f8929d044f437c";
  var PACKAGE_IDS = {
    member: "7490093",
    premium: "7490099",
    elite: "7490104"
  };

  var USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
  var HEADLESS_API_BASE = "https://headless.tebex.io/api";
  var PACKAGE_DISPLAY = {
    member: {
      name: "Member",
      price: "$5.99 / mo"
    },
    premium: {
      name: "Premium",
      price: "$10.99 / mo"
    },
    elite: {
      name: "Elite",
      price: "$20.99 / mo"
    }
  };
  var MODAL_CLOSE_DELAY_MS = 190;
  var pendingPackageKey = "";
  var pendingTrigger = null;
  var checkoutBusy = false;
  var closeTimer = 0;

  function getStatusElement() {
    return document.getElementById("checkout-status");
  }

  function setStatus(message) {
    var status = getStatusElement();

    if (status) {
      status.textContent = message;
    }
  }

  function getModal() {
    return document.getElementById("checkout-identity-modal");
  }

  function getConfirmCheckbox() {
    return document.getElementById("username-confirmed");
  }

  function getContinueButton() {
    return document.getElementById("checkout-continue");
  }

  var linkedUsername = "";

  function waitForAuth() {
    return new Promise(function (resolve) {
      function check() {
        if (window.CapitalAuth && window.CapitalAuth.ready) {
          window.CapitalAuth.ready().then(resolve);
          return;
        }

        window.setTimeout(check, 40);
      }

      check();
    });
  }

  function setAuthNoticeVisible(visible) {
    var notice = document.getElementById("store-auth-notice");

    if (notice) {
      notice.hidden = !visible;
    }
  }

  async function refreshStoreAccess() {
    await waitForAuth();

    if (!window.CapitalAuth || !window.CapitalAuth.configured) {
      setAuthNoticeVisible(true);
      setButtonState(true);
      linkedUsername = "";
      return;
    }

    var loggedIn = await window.CapitalAuth.isLoggedIn();
    var complete = loggedIn && await window.CapitalAuth.hasCompleteProfile();

    linkedUsername = complete ? await window.CapitalAuth.getMinecraftUsername() : "";
    setAuthNoticeVisible(!complete);
    setButtonState(false);
    updateConfirmState();
  }

  function getUsername() {
    return linkedUsername;
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
      button.disabled = disabled || !RANK_PURCHASES_ENABLED;
      button.setAttribute("aria-busy", disabled ? "true" : "false");
    });
  }

  function setModalBusy(disabled) {
    var modal = getModal();
    var dismissers = modal ? modal.querySelectorAll("[data-modal-dismiss]") : [];
    var continueButton = getContinueButton();
    var checkbox = getConfirmCheckbox();

    checkoutBusy = disabled;

    dismissers.forEach(function (button) {
      button.disabled = disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
    });

    if (checkbox) {
      checkbox.disabled = disabled;
    }

    if (continueButton) {
      continueButton.setAttribute("aria-busy", disabled ? "true" : "false");
    }

    updateConfirmState();
  }

  function updateConfirmState() {
    var username = getUsername();
    var checkbox = getConfirmCheckbox();
    var continueButton = getContinueButton();
    var preview = document.getElementById("username-preview");
    var linkedLabel = document.getElementById("checkout-linked-username");
    var validUsername = USERNAME_PATTERN.test(username);
    var confirmed = Boolean(checkbox && checkbox.checked);

    if (preview) {
      preview.textContent = username || "this username";
    }

    if (linkedLabel) {
      linkedLabel.textContent = username || "your player";
    }

    if (checkbox && !validUsername) {
      checkbox.checked = false;
    }

    if (continueButton) {
      continueButton.disabled = checkoutBusy || !validUsername || !confirmed;
    }
  }

  function openUsernameModal(packageKey, trigger) {
    var modal = getModal();
    var checkbox = getConfirmCheckbox();
    var packageName = document.getElementById("checkout-package-name");
    var packagePrice = document.getElementById("checkout-package-price");
    var display = PACKAGE_DISPLAY[packageKey] || { name: "this rank", price: "" };

    if (!modal || !checkbox) {
      setStatus("Checkout dialog could not be opened.");
      return;
    }

    window.clearTimeout(closeTimer);
    pendingPackageKey = packageKey;
    pendingTrigger = trigger || null;

    if (packageName) {
      packageName.textContent = display.name;
    }

    if (packagePrice) {
      packagePrice.textContent = display.price ? "(" + display.price + ")" : "";
    }

    checkbox.checked = false;
    setStatus("");
    setModalBusy(false);

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    window.requestAnimationFrame(function () {
      modal.classList.add("is-open");
    });

    updateConfirmState();
  }

  function closeUsernameModal(force) {
    var modal = getModal();

    if (!modal || checkoutBusy && !force) {
      return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    closeTimer = window.setTimeout(function () {
      modal.hidden = true;
      setStatus("");

      if (pendingTrigger && typeof pendingTrigger.focus === "function") {
        pendingTrigger.focus();
      }
    }, MODAL_CLOSE_DELAY_MS);
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
            source: "capital-industries-store",
            minecraft_username: username,
            username_confirmed_by_buyer: true,
            minecraft_uuid: ""
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

  async function beginCheckout(packageKey, username) {
    try {
      setButtonState(true);
      setModalBusy(true);
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
      closeUsernameModal(true);
    } catch (error) {
      console.error(error);

      if (error.message && error.message.toLowerCase().indexOf("auth") !== -1) {
        try {
          var retryBasket = await createBasket(username);
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
      setModalBusy(false);
      refreshStoreAccess();
    }
  }

  function redirectToAccount(setup) {
    var url = "/account/?return=" + encodeURIComponent("/store/");

    if (setup) {
      url += "&setup=1";
    }

    window.location.href = url;
  }

  async function handleBuyClick(event) {
    if (!RANK_PURCHASES_ENABLED) {
      return;
    }

    await waitForAuth();

    if (!window.CapitalAuth || !window.CapitalAuth.configured) {
      setStatus("Account sign-in is not configured yet.");
      return;
    }

    if (!await window.CapitalAuth.isLoggedIn()) {
      redirectToAccount(false);
      return;
    }

    if (!await window.CapitalAuth.hasCompleteProfile()) {
      redirectToAccount(true);
      return;
    }

    linkedUsername = await window.CapitalAuth.getMinecraftUsername();
    var packageKey = event.currentTarget.getAttribute("data-tebex-package");

    try {
      assertConfigured();
      assertPackageConfigured(packageKey);
      openUsernameModal(packageKey, event.currentTarget);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Checkout is not configured.");
    }
  }

  function handleConfirmClick() {
    var username = getUsername();

    if (!USERNAME_PATTERN.test(username)) {
      setStatus("Link a valid Java username on your account page before checkout.");
      updateConfirmState();
      return;
    }

    if (!getConfirmCheckbox() || !getConfirmCheckbox().checked) {
      setStatus("Confirm the username is your current in-game name before checkout.");
      updateConfirmState();
      return;
    }

    if (!pendingPackageKey) {
      setStatus("Select a rank before continuing.");
      return;
    }

    beginCheckout(pendingPackageKey, username);
  }

  function initializeCheckoutButtons() {
    var buttons = document.querySelectorAll("[data-tebex-package]");
    var modal = getModal();
    var checkbox = getConfirmCheckbox();
    var continueButton = getContinueButton();

    buttons.forEach(function (button) {
      button.addEventListener("click", function (event) {
        handleBuyClick(event);
      });
    });

    if (checkbox) {
      checkbox.addEventListener("change", updateConfirmState);
    }

    if (continueButton) {
      continueButton.addEventListener("click", handleConfirmClick);
    }

    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target && event.target.hasAttribute("data-modal-dismiss")) {
          closeUsernameModal(false);
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      var visibleModal = getModal();

      if (event.key === "Escape" && visibleModal && !visibleModal.hidden) {
        closeUsernameModal(false);
      }
    });

    refreshStoreAccess();
  }

  initializeCheckoutButtons();
}());
