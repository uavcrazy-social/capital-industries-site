(function () {
  "use strict";

  var USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
  var MIN_PASSWORD_LENGTH = 12;
  var MAX_PASSWORD_LENGTH = 128;
  var API_UNAVAILABLE_MESSAGE = "Account request failed. Try again later or contact Discord support.";
  var API_BASE = String(window.CAPITAL_INDUSTRIES_ACCOUNT_API_BASE || "").replace(/\/$/, "");

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var element = byId(id);

    if (element) {
      element.textContent = text;
    }
  }

  function setBusy(form, busy) {
    var controls = form ? form.querySelectorAll("button, input") : [];

    controls.forEach(function (control) {
      control.disabled = busy;
      control.setAttribute("aria-busy", busy ? "true" : "false");
    });
  }

  function getInputValue(form, name, trim) {
    var input = form ? form.elements[name] : null;
    var value = input ? String(input.value || "") : "";

    return trim === false ? value : value.trim();
  }

  function validateUsername(username) {
    return USERNAME_PATTERN.test(username);
  }

  function validatePassword(password) {
    return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
  }

  function setApiWarning(visible) {
    var warning = byId("account-service-warning");

    if (warning) {
      warning.hidden = !visible;
    }
  }

  function isJsonResponse(response) {
    var contentType = response.headers.get("content-type") || "";
    return contentType.toLowerCase().indexOf("application/json") !== -1;
  }

  function getApiUrl(path) {
    return API_BASE + path;
  }

  async function requestJson(path, options) {
    var response;
    var payload;

    try {
      response = await fetch(getApiUrl(path), Object.assign({
        credentials: API_BASE ? "include" : "same-origin",
        headers: {
          "Content-Type": "application/json"
        }
      }, options || {}));
    } catch (error) {
      throw new Error(API_UNAVAILABLE_MESSAGE);
    }

    if (!isJsonResponse(response)) {
      throw new Error(API_UNAVAILABLE_MESSAGE);
    }

    payload = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 405) {
        throw new Error(API_UNAVAILABLE_MESSAGE);
      }

      throw new Error(payload.error || payload.message || "Unable to complete request.");
    }

    return payload;
  }

  function showTab(name) {
    var registerForm = byId("register-form");
    var loginForm = byId("login-form");
    var registerTab = byId("register-tab");
    var loginTab = byId("login-tab");
    var registerActive = name === "register";

    if (registerForm) {
      registerForm.hidden = !registerActive;
    }

    if (loginForm) {
      loginForm.hidden = registerActive;
    }

    if (registerTab) {
      registerTab.classList.toggle("is-active", registerActive);
      registerTab.setAttribute("aria-selected", registerActive ? "true" : "false");
    }

    if (loginTab) {
      loginTab.classList.toggle("is-active", !registerActive);
      loginTab.setAttribute("aria-selected", registerActive ? "false" : "true");
    }
  }

  function renderSignedOut() {
    var sessionPanel = byId("account-session-panel");
    var authPanel = byId("auth-panel");

    if (sessionPanel) {
      sessionPanel.hidden = true;
    }

    if (authPanel) {
      authPanel.hidden = false;
    }
  }

  function renderSignedIn(account) {
    var sessionPanel = byId("account-session-panel");
    var authPanel = byId("auth-panel");
    var usernameInput = byId("profile-minecraft-username");
    var confirmedInput = byId("profile-username-confirmed");

    if (sessionPanel) {
      sessionPanel.hidden = false;
    }

    if (authPanel) {
      authPanel.hidden = true;
    }

    setText("account-display-name", account.minecraftUsername || "Account");
    setText(
      "account-summary",
      "Created " + new Date(account.createdAt).toLocaleDateString() + "."
    );

    if (usernameInput) {
      usernameInput.value = account.minecraftUsername || "";
    }

    if (confirmedInput) {
      confirmedInput.checked = Boolean(account.usernameConfirmed);
    }
  }

  async function refreshSession(options) {
    var silent = Boolean(options && options.silent);

    try {
      var payload = await requestJson("/api/auth/me", { method: "GET", headers: {} });

      setApiWarning(false);

      if (payload.account) {
        renderSignedIn(payload.account);
        return;
      }

      renderSignedOut();
    } catch (error) {
      if (!silent) {
        setApiWarning(error.message === API_UNAVAILABLE_MESSAGE);
      }
      renderSignedOut();
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var username = getInputValue(form, "minecraftUsername");
    var password = getInputValue(form, "password", false);
    var passwordConfirm = getInputValue(form, "passwordConfirm", false);
    var confirmed = Boolean(byId("register-username-confirmed") && byId("register-username-confirmed").checked);

    setText("register-status", "");

    if (!validateUsername(username)) {
      setText("register-status", "Use a valid Java username: 3-16 letters, numbers, or underscores.");
      return;
    }

    if (!validatePassword(password)) {
      setText("register-status", "Use a password between 12 and 128 characters.");
      return;
    }

    if (password !== passwordConfirm) {
      setText("register-status", "Passwords do not match.");
      return;
    }

    if (!confirmed) {
      setText("register-status", "Confirm the username is your current in-game name.");
      return;
    }

    try {
      setBusy(form, true);
      await requestJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          minecraftUsername: username,
          password: password,
          usernameConfirmed: true
        })
      });
      form.reset();
      await refreshSession();
    } catch (error) {
      setApiWarning(error.message === API_UNAVAILABLE_MESSAGE);
      setText("register-status", error.message);
    } finally {
      setBusy(form, false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var username = getInputValue(form, "minecraftUsername");
    var password = getInputValue(form, "password", false);

    setText("login-status", "");

    if (!validateUsername(username) || !password) {
      setText("login-status", "Enter your username and password.");
      return;
    }

    try {
      setBusy(form, true);
      await requestJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          minecraftUsername: username,
          password: password
        })
      });
      form.reset();
      await refreshSession();
    } catch (error) {
      setApiWarning(error.message === API_UNAVAILABLE_MESSAGE);
      setText("login-status", error.message);
    } finally {
      setBusy(form, false);
    }
  }

  async function handleProfile(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var username = getInputValue(form, "minecraftUsername");
    var confirmed = Boolean(byId("profile-username-confirmed") && byId("profile-username-confirmed").checked);

    setText("profile-status", "");

    if (!validateUsername(username)) {
      setText("profile-status", "Use a valid Java username: 3-16 letters, numbers, or underscores.");
      return;
    }

    if (!confirmed) {
      setText("profile-status", "Confirm the username before saving.");
      return;
    }

    try {
      setBusy(form, true);
      await requestJson("/api/account/profile", {
        method: "PUT",
        body: JSON.stringify({
          minecraftUsername: username,
          usernameConfirmed: confirmed
        })
      });
      setText("profile-status", "Username saved.");
      await refreshSession();
    } catch (error) {
      setApiWarning(error.message === API_UNAVAILABLE_MESSAGE);
      setText("profile-status", error.message);
    } finally {
      setBusy(form, false);
    }
  }

  async function handlePassword(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var currentPassword = getInputValue(form, "currentPassword", false);
    var newPassword = getInputValue(form, "newPassword", false);

    setText("password-status", "");

    if (!currentPassword || !validatePassword(newPassword)) {
      setText("password-status", "Enter your current password and a new 12-128 character password.");
      return;
    }

    try {
      setBusy(form, true);
      await requestJson("/api/account/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: currentPassword,
          newPassword: newPassword
        })
      });
      form.reset();
      setText("password-status", "Password changed.");
    } catch (error) {
      setApiWarning(error.message === API_UNAVAILABLE_MESSAGE);
      setText("password-status", error.message);
    } finally {
      setBusy(form, false);
    }
  }

  async function handleLogout() {
    try {
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
    } catch (error) {
    }

    renderSignedOut();
  }

  function bindEvents() {
    var tabs = document.querySelectorAll("[data-account-tab]");
    var registerForm = byId("register-form");
    var loginForm = byId("login-form");
    var profileForm = byId("profile-form");
    var passwordForm = byId("password-form");
    var logoutButton = byId("logout-button");

    tabs.forEach(function (button) {
      button.addEventListener("click", function () {
        showTab(button.getAttribute("data-account-tab"));
      });
    });

    if (registerForm) {
      registerForm.addEventListener("submit", handleRegister);
    }

    if (loginForm) {
      loginForm.addEventListener("submit", handleLogin);
    }

    if (profileForm) {
      profileForm.addEventListener("submit", handleProfile);
    }

    if (passwordForm) {
      passwordForm.addEventListener("submit", handlePassword);
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", handleLogout);
    }
  }

  bindEvents();
  refreshSession({ silent: true });
}());
