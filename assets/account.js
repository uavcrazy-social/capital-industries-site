const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

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

function setLookupMessage(elementId, message, type) {
  const element = byId(elementId);

  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("is-valid", "is-invalid");

  if (type === "valid") {
    element.classList.add("is-valid");
  }

  if (type === "invalid") {
    element.classList.add("is-invalid");
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

async function renderSignedOut() {
  setPanelHidden("account-session-panel", true);
  setPanelHidden("onboarding-panel", true);
  setPanelHidden("auth-panel", false);
}

async function renderOnboarding(user) {
  setPanelHidden("auth-panel", true);
  setPanelHidden("account-session-panel", true);
  setPanelHidden("onboarding-panel", false);

  setText(
    "onboarding-summary",
    "Connected with " + providerLabel(user) + ". Link your current Minecraft Java username to buy ranks."
  );
}

async function renderSignedIn(user, profile) {
  setPanelHidden("auth-panel", true);
  setPanelHidden("onboarding-panel", true);
  setPanelHidden("account-session-panel", false);

  setText("account-display-name", profile.minecraft_username || "Account");
  setText("account-summary", "Connected with " + providerLabel(user));
  setText("account-linked-username", profile.minecraft_username || "—");

  const usernameInput = byId("profile-minecraft-username");
  const confirmedInput = byId("profile-username-confirmed");

  if (usernameInput) {
    usernameInput.value = profile.minecraft_username || "";
  }

  if (confirmedInput) {
    confirmedInput.checked = Boolean(profile.username_confirmed);
  }
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
      "<strong>Link your Minecraft username to buy ranks.</strong> Confirm your in-game name below, then return to the store.";
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

  if (!complete || forceSetup) {
    await renderOnboarding(user);
    return;
  }

  await renderSignedIn(user, profile);
}

function bindUsernameLookup(inputId, lookupId, previewId, submitId, confirmedId) {
  const input = byId(inputId);
  const confirmed = byId(confirmedId);
  const submit = byId(submitId);
  let lookupTimer = 0;
  let lookupState = { valid: false };

  function updateSubmit() {
    if (!submit) {
      return;
    }

    submit.disabled =
      !lookupState.valid || !(confirmed && confirmed.checked);
  }

  async function runLookup() {
    const username = input ? input.value.trim() : "";
    lookupState = { valid: false };

    if (byId(previewId)) {
      byId(previewId).textContent = username || "this username";
    }

    if (!USERNAME_PATTERN.test(username)) {
      setLookupMessage(lookupId, "Enter 3-16 letters, numbers, or underscores.", "invalid");
      updateSubmit();
      return;
    }

    setLookupMessage(lookupId, "Checking Mojang...", null);

    try {
      const result = await window.CapitalAuth.lookupMinecraftUsername(username);
      lookupState = result;

      if (result.valid) {
        setLookupMessage(lookupId, "Mojang account found: " + result.username, "valid");
      } else {
        setLookupMessage(lookupId, result.error || "Username not found.", "invalid");
      }
    } catch (error) {
      setLookupMessage(lookupId, error.message || "Lookup failed.", "invalid");
    }

    updateSubmit();
  }

  if (input) {
    input.addEventListener("input", function () {
      if (confirmed) {
        confirmed.checked = false;
      }
      window.clearTimeout(lookupTimer);
      lookupTimer = window.setTimeout(runLookup, 350);
    });
  }

  if (confirmed) {
    confirmed.addEventListener("change", updateSubmit);
  }

  updateSubmit();
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

  bindUsernameLookup(
    "onboarding-username",
    "onboarding-username-lookup",
    "onboarding-username-preview",
    "onboarding-submit",
    "onboarding-username-confirmed"
  );

  bindUsernameLookup(
    "profile-minecraft-username",
    "profile-username-lookup",
    "profile-username-preview",
    "profile-submit",
    "profile-username-confirmed"
  );

  const googleButton = byId("google-sign-in");
  const discordButton = byId("discord-sign-in");
  const logoutButton = byId("logout-button");
  const onboardingForm = byId("onboarding-form");
  const profileForm = byId("profile-form");

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

  if (onboardingForm) {
    onboardingForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus("onboarding-status", "");
      setBusy(onboardingForm, true);

      try {
        await window.CapitalAuth.upsertProfile(
          byId("onboarding-username").value.trim(),
          Boolean(byId("onboarding-username-confirmed").checked)
        );

        const returnUrl = new URLSearchParams(window.location.search).get("return");

        if (returnUrl && returnUrl.charAt(0) === "/" && returnUrl.indexOf("//") !== 0) {
          window.location.href = returnUrl;
          return;
        }

        window.location.href = "/account/";
      } catch (error) {
        setStatus("onboarding-status", error.message || "Could not save username.", "error");
      } finally {
        setBusy(onboardingForm, false);
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus("profile-status", "");
      setBusy(profileForm, true);

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
        setBusy(profileForm, false);
      }
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
