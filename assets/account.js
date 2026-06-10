const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const MODAL_CLOSE_DELAY_MS = 190;
let setupModalBusy = false;
let setupCloseTimer = 0;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const element = byId(id);

  if (element) {
    element.textContent = text;
  }
}

function setStatus(id, message, type) {
  const element = byId(id);

  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("is-error", "is-success");

  if (type === "error") {
    element.classList.add("is-error");
  }

  if (type === "success") {
    element.classList.add("is-success");
  }
}

function setPanelHidden(id, hidden) {
  const panel = byId(id);

  if (panel) {
    panel.hidden = hidden;
  }
}

function setBusy(form, busy) {
  if (!form) {
    return;
  }

  form.querySelectorAll("button, input").forEach(function (control) {
    control.disabled = busy;
    control.setAttribute("aria-busy", busy ? "true" : "false");
  });
}

function providerLabel(user) {
  const provider = user?.app_metadata?.provider || "oauth";

  if (provider === "google") {
    return "Google";
  }

  if (provider === "discord") {
    return "Discord";
  }

  return "OAuth";
}

function getSetupModal() {
  return byId("username-setup-modal");
}

function openUsernameSetupModal() {
  const modal = getSetupModal();

  if (!modal || setupModalBusy) {
    return;
  }

  window.clearTimeout(setupCloseTimer);
  setStatus("setup-modal-status", "");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  window.requestAnimationFrame(function () {
    modal.classList.add("is-open");
  });

  window.setTimeout(function () {
    const input = byId("setup-username");
    if (input) {
      input.focus();
    }
  }, 90);
}

function closeUsernameSetupModal(force) {
  const modal = getSetupModal();

  if (!modal || setupModalBusy && !force) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  setupCloseTimer = window.setTimeout(function () {
    modal.hidden = true;
    setStatus("setup-modal-status", "");
  }, MODAL_CLOSE_DELAY_MS);
}

async function renderSignedOut() {
  closeUsernameSetupModal(true);
  setPanelHidden("account-session-panel", true);
  setPanelHidden("auth-panel", false);
}

async function renderSignedIn(user, profile, options) {
  const needsSetup = Boolean(options && options.needsSetup);

  setPanelHidden("auth-panel", true);
  setPanelHidden("account-session-panel", false);

  setText("account-display-name", profile?.minecraft_username || "Account");
  setText("account-summary", "Connected with " + providerLabel(user));
  setText("account-linked-username", profile?.minecraft_username || "—");

  const profileForm = byId("profile-form");
  const profileSection = byId("profile-manage-section");

  if (profileForm) {
    profileForm.hidden = needsSetup;
  }

  if (profileSection) {
    profileSection.hidden = needsSetup;
  }

  if (!needsSetup && profile) {
    const usernameInput = byId("profile-minecraft-username");
    const confirmedInput = byId("profile-username-confirmed");

    if (usernameInput) {
      usernameInput.value = profile.minecraft_username || "";
    }

    if (confirmedInput) {
      confirmedInput.checked = Boolean(profile.username_confirmed);
    }

    updateProfileSubmitState();
    closeUsernameSetupModal(true);
    return;
  }

  openUsernameSetupModal();
}

function showCheckoutNotice() {
  const notice = byId("account-checkout-notice");
  const params = new URLSearchParams(window.location.search);

  if (!notice) {
    return;
  }

  const needsAccount = params.get("reason") === "checkout";

  notice.hidden = !needsAccount;

  if (needsAccount && params.get("setup") === "1") {
    notice.innerHTML =
      "<strong>Link your Minecraft username to buy ranks.</strong> Use the setup popup to confirm your in-game name, then return to the store.";
  }
}

async function refreshAccountView() {
  const warning = byId("account-service-warning");

  showCheckoutNotice();

  if (!window.CapitalAuth || typeof window.CapitalAuth.ready !== "function") {
    if (warning) {
      warning.hidden = false;
      warning.textContent = "Account services failed to load. Refresh the page.";
    }
    await renderSignedOut();
    return;
  }

  await window.CapitalAuth.ready();

  if (!window.CapitalAuth.configured) {
    if (warning) {
      warning.hidden = false;
      warning.textContent =
        "Supabase is not configured yet. Set CAPITAL_SUPABASE_URL and CAPITAL_SUPABASE_ANON_KEY in assets/supabase-config.js.";
    }
    await renderSignedOut();
    return;
  }

  if (warning) {
    warning.hidden = true;
  }

  const user = await window.CapitalAuth.getSessionUser();

  if (!user) {
    await renderSignedOut();
    return;
  }

  const profile = await window.CapitalAuth.getProfile();
  const complete = await window.CapitalAuth.hasCompleteProfile();
  const forceSetup = new URLSearchParams(window.location.search).get("setup") === "1";

  await renderSignedIn(user, profile, {
    needsSetup: !complete || forceSetup
  });
}

function updateSetupSubmitState() {
  const input = byId("setup-username");
  const confirmed = byId("setup-username-confirmed");
  const submit = byId("setup-username-submit");
  const preview = byId("setup-username-preview");
  const username = input ? input.value.trim() : "";
  const valid = USERNAME_PATTERN.test(username);

  if (preview) {
    preview.textContent = username || "this username";
  }

  if (submit) {
    submit.disabled = setupModalBusy || !valid || !(confirmed && confirmed.checked);
  }
}

function updateProfileSubmitState() {
  const input = byId("profile-minecraft-username");
  const confirmed = byId("profile-username-confirmed");
  const submit = byId("profile-submit");
  const preview = byId("profile-username-preview");
  const username = input ? input.value.trim() : "";
  const valid = USERNAME_PATTERN.test(username);

  if (preview) {
    preview.textContent = username || "this username";
  }

  if (submit) {
    submit.disabled = !valid || !(confirmed && confirmed.checked);
  }
}

function bindSetupModalForm() {
  const form = byId("username-setup-form");
  const input = byId("setup-username");
  const confirmed = byId("setup-username-confirmed");
  const submit = byId("setup-username-submit");

  if (input) {
    input.addEventListener("input", function () {
      if (confirmed) {
        confirmed.checked = false;
      }
      updateSetupSubmitState();
    });
  }

  if (confirmed) {
    confirmed.addEventListener("change", updateSetupSubmitState);
  }

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus("setup-modal-status", "");
      setupModalBusy = true;
      setBusy(form, true);
      updateSetupSubmitState();

      try {
        await window.CapitalAuth.upsertProfile(
          byId("setup-username").value.trim(),
          Boolean(byId("setup-username-confirmed").checked)
        );

        closeUsernameSetupModal(true);

        const returnUrl = new URLSearchParams(window.location.search).get("return");

        if (returnUrl && returnUrl.charAt(0) === "/" && returnUrl.indexOf("//") !== 0) {
          window.location.href = returnUrl;
          return;
        }

        await refreshAccountView();
        setStatus("profile-status", "In-game username saved.", "success");
      } catch (error) {
        setStatus("setup-modal-status", error.message || "Could not save username.", "error");
      } finally {
        setupModalBusy = false;
        setBusy(form, false);
        updateSetupSubmitState();
      }
    });
  }

  if (submit) {
    submit.addEventListener("click", function () {
      if (form) {
        form.requestSubmit();
      }
    });
  }

  updateSetupSubmitState();
}

function bindProfileForm() {
  const form = byId("profile-form");
  const input = byId("profile-minecraft-username");
  const confirmed = byId("profile-username-confirmed");

  if (input) {
    input.addEventListener("input", function () {
      if (confirmed) {
        confirmed.checked = false;
      }
      updateProfileSubmitState();
    });
  }

  if (confirmed) {
    confirmed.addEventListener("change", updateProfileSubmitState);
  }

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus("profile-status", "");
      setBusy(form, true);

      try {
        await window.CapitalAuth.upsertProfile(
          byId("profile-minecraft-username").value.trim(),
          Boolean(byId("profile-username-confirmed").checked)
        );
        setStatus("profile-status", "Username saved.", "success");
        await refreshAccountView();
      } catch (error) {
        setStatus("profile-status", error.message || "Could not save username.", "error");
      } finally {
        setBusy(form, false);
        updateProfileSubmitState();
      }
    });
  }

  updateProfileSubmitState();
}

async function boot() {
  if (!window.CapitalAuth || typeof window.CapitalAuth.ready !== "function") {
    const warning = byId("account-service-warning");
    if (warning) {
      warning.hidden = false;
      warning.textContent = "Account services failed to load. Refresh the page.";
    }
    return;
  }

  await window.CapitalAuth.ready();

  bindSetupModalForm();
  bindProfileForm();

  const googleButton = byId("google-sign-in");
  const discordButton = byId("discord-sign-in");
  const logoutButton = byId("logout-button");

  if (googleButton) {
    googleButton.addEventListener("click", async function () {
      try {
        await window.CapitalAuth.signInWithGoogle();
      } catch (error) {
        setStatus("auth-status", error.message || "Google sign-in failed.", "error");
      }
    });
  }

  if (discordButton) {
    discordButton.addEventListener("click", async function () {
      try {
        await window.CapitalAuth.signInWithDiscord();
      } catch (error) {
        setStatus("auth-status", error.message || "Discord sign-in failed.", "error");
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
      await window.CapitalAuth.signOut();
      window.location.href = "/account/";
    });
  }

  if (typeof window.CapitalAuth.onAuthStateChange === "function") {
    window.CapitalAuth.onAuthStateChange(function () {
      refreshAccountView();
    });
  }

  await refreshAccountView();
}

boot().catch(function (error) {
  console.error(error);
  const warning = byId("account-service-warning");

  if (warning) {
    warning.hidden = false;
    warning.textContent = error.message || "Account page failed to load.";
  }
});
