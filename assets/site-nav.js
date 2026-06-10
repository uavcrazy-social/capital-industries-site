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

  function closeAccountMenu(menu, toggle) {
    if (!menu || !toggle) {
      return;
    }

    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
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

  function buildAccountDropdown(profile) {
    const wrap = document.createElement("div");
    wrap.className = "nav-account-wrap";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-link nav-account-toggle";
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML =
      '<img alt="" class="nav-icon" src="/assets/icons/community.svg"/> Account';

    const menu = document.createElement("div");
    menu.className = "nav-account-menu";
    menu.hidden = true;

    const username = profile && profile.minecraft_username ? profile.minecraft_username : "Account";
    const meta = document.createElement("p");
    meta.className = "nav-account-menu-meta";
    meta.textContent = username;

    const manage = document.createElement("a");
    manage.href = "/account/";
    manage.textContent = "Manage account";

    const store = document.createElement("a");
    store.href = "/store/";
    store.textContent = "Buy ranks";

    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "nav-account-signout";
    signOut.textContent = "Sign out";

    menu.append(meta, manage, store, signOut);
    wrap.append(toggle, menu);

    toggle.addEventListener("click", function () {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      menu.hidden = open;
    });

    signOut.addEventListener("click", async function () {
      if (window.CapitalAuth && window.CapitalAuth.signOut) {
        await window.CapitalAuth.signOut();
      }
      window.location.href = "/account/";
    });

    document.addEventListener("click", function (event) {
      if (!wrap.contains(event.target)) {
        closeAccountMenu(menu, toggle);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeAccountMenu(menu, toggle);
      }
    });

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
    const dropdown = buildAccountDropdown(profile);

    if (getNavKey() === "account") {
      const toggle = dropdown.querySelector(".nav-account-toggle");
      if (toggle) {
        toggle.classList.add("nav-link-active");
      }
    }

    slot.appendChild(dropdown);
  }

  function boot() {
    setActiveNavLink();
    renderLoginFallback();

    const auth = window.CapitalAuth;

    if (!auth || typeof auth.ready !== "function") {
      return;
    }

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
