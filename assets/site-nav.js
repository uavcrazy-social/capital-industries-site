(function () {
  "use strict";

  function getNavKey() {
    const path = window.location.pathname.replace(/\/$/, "") || "/";

    if (path === "/download" || path.startsWith("/download/")) {
      return "play";
    }

    if (path === "/store" || path.startsWith("/store/")) {
      return "store";
    }

    if (path === "/account" || path.startsWith("/account/")) {
      return "account";
    }

    return "";
  }

  function setActiveNavLink() {
    const activeKey = getNavKey();

    document.querySelectorAll("[data-nav-key]").forEach(function (link) {
      const isActive = link.getAttribute("data-nav-key") === activeKey;
      link.classList.toggle("nav-link-active", isActive);
    });
  }

  function buildLoginButton() {
    const link = document.createElement("a");
    link.className = "nav-link nav-login-button";
    const path = window.location.pathname;

    if (path === "/store" || path.startsWith("/store/")) {
      link.href =
        "/account/?return=" + encodeURIComponent("/store/") + "&reason=checkout";
    } else {
      link.href = "/account/";
    }

    link.textContent = "Login";
    return link;
  }

  function buildAccountState(profile) {
    const wrap = document.createElement("div");
    wrap.className = "nav-account-inline";

    const username = document.createElement("span");
    username.className = "nav-auth-name";
    username.textContent =
      profile && profile.minecraft_username
        ? profile.minecraft_username
        : "Set username";

    const separator = document.createElement("span");
    separator.className = "nav-auth-separator";
    separator.textContent = "/";

    const accountLink = document.createElement("a");
    accountLink.className = "nav-link nav-account-link";
    accountLink.href = "/account/";
    accountLink.textContent = "Account";

    if (getNavKey() === "account") {
      accountLink.classList.add("nav-link-active");
    }

    wrap.append(username, separator, accountLink);
    return wrap;
  }

  function renderLoginFallback() {
    const slot = document.getElementById("nav-account-slot");

    if (!slot) {
      return;
    }

    slot.innerHTML = "";
    slot.appendChild(buildLoginButton());
  }

  async function renderAccountSlot() {
    const slot = document.getElementById("nav-account-slot");

    if (!slot) {
      return;
    }

    const auth = window.CapitalAuth;

    if (!auth || typeof auth.ready !== "function") {
      renderLoginFallback();
      return;
    }

    await auth.ready();

    slot.innerHTML = "";

    if (!auth.configured) {
      slot.appendChild(buildLoginButton());
      return;
    }

    const loggedIn = await auth.isLoggedIn();

    if (!loggedIn) {
      slot.appendChild(buildLoginButton());
      return;
    }

    const profile = await auth.getProfile();
    slot.appendChild(buildAccountState(profile));
  }

  function clearNavAccountSlot() {
    const slot = document.getElementById("nav-account-slot");

    if (slot) {
      slot.innerHTML = "";
    }
  }

  function boot() {
    setActiveNavLink();

    const auth = window.CapitalAuth;

    if (!auth || typeof auth.ready !== "function") {
      renderLoginFallback();
      return;
    }

    clearNavAccountSlot();

    auth.ready().then(function () {
      return renderAccountSlot();
    }).catch(function (error) {
      console.error(error);
      renderLoginFallback();
    });

    if (typeof auth.onAuthStateChange === "function") {
      auth.onAuthStateChange(function () {
        renderAccountSlot().catch(function (error) {
          console.error(error);
          renderLoginFallback();
        });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}());
