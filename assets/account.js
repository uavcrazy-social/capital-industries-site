const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
let initialAccountLoad = true;
let refreshInFlight = null;

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

const RANK_LABELS = {
  member: "Member",
  premium: "Premium",
  elite: "Elite"
};

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

function formatProviderName(provider) {
  if (provider === "google") {
    return "Google";
  }

  if (provider === "discord") {
    return "Discord";
  }

  return provider;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function rankLabel(rankKey) {
  return RANK_LABELS[rankKey] || rankKey || "—";
}

async function renderAccountDetails(user) {
  const providers =
    window.CapitalAuth && typeof window.CapitalAuth.getConnectedProviders === "function"
      ? window.CapitalAuth.getConnectedProviders(user)
      : [];

  setText(
    "account-connected-providers",
    providers.length
      ? providers.map(formatProviderName).join(" + ")
      : providerLabel(user)
  );

  let subscription = null;

  try {
    if (typeof window.CapitalAuth.getActiveSubscription === "function") {
      subscription = await window.CapitalAuth.getActiveSubscription();
    }
  } catch (error) {
    console.error(error);
  }

  const subscriptionEmpty = byId("account-subscription-empty");
  const subscriptionDetails = byId("account-subscription-details");

  if (subscription) {
    if (subscriptionEmpty) {
      subscriptionEmpty.hidden = true;
    }

    if (subscriptionDetails) {
      subscriptionDetails.hidden = false;
    }

    const status = subscription.status || "active";
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    setText(
      "account-subscription-rank",
      (subscription.package_name || rankLabel(subscription.rank_key)) + " · " + statusText
    );
    setText(
      "account-subscription-meta",
      "Next renewal: " + formatDate(subscription.current_period_end || subscription.started_at)
    );

    const cancelButton = byId("cancel-subscription-button");
    if (cancelButton) {
      cancelButton.hidden = false;
    }
  } else {
    const cancelButton = byId("cancel-subscription-button");
    if (cancelButton) {
      cancelButton.hidden = true;
    }
    if (subscriptionEmpty) {
      subscriptionEmpty.hidden = false;
    }

    if (subscriptionDetails) {
      subscriptionDetails.hidden = true;
    }
  }
}

async function promptUsernameSetupIfNeeded() {
  if (window.CapitalProfileSetup && typeof window.CapitalProfileSetup.refresh === "function") {
    await window.CapitalProfileSetup.refresh();
  }
}

async function renderSignedOut() {
  finishAccountLoading();
  setPanelHidden("account-session-panel", true);
  setPanelHidden("auth-panel", false);

  if (window.CapitalProfileSetup && typeof window.CapitalProfileSetup.close === "function") {
    window.CapitalProfileSetup.close(true);
  }
}

async function renderSignedIn(user, profile, options) {
  const needsSetup = Boolean(options && options.needsSetup);

  finishAccountLoading();
  setPanelHidden("auth-panel", true);
  setPanelHidden("account-session-panel", false);

  setText("account-summary", "Signed in as " + (profile?.minecraft_username || "Account"));
  setText("account-linked-username", profile?.minecraft_username || "—");

  const profileForm = byId("profile-form");
  const profileSection = byId("profile-manage-section");
  const changeUsernameButton = byId("change-username-button");

  if (profileForm) {
    profileForm.hidden = true;
  }

  if (profileSection) {
    profileSection.hidden = needsSetup;
  }

  if (changeUsernameButton) {
    changeUsernameButton.hidden = needsSetup;
    changeUsernameButton.textContent = "Change username";
  }

  await renderAccountDetails(user);

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
    return;
  }

  await promptUsernameSetupIfNeeded();
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

function setAccountLoading(loading) {
  const loadingPanel = byId("account-loading-panel");

  if (loadingPanel) {
    loadingPanel.hidden = !loading;
    loadingPanel.setAttribute("aria-busy", loading ? "true" : "false");
  }
}

function finishAccountLoading() {
  setAccountLoading(false);
  initialAccountLoad = false;
}

async function refreshAccountView() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = refreshAccountViewInner().finally(function () {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function refreshAccountViewInner() {
  const warning = byId("account-service-warning");

  if (initialAccountLoad) {
    setPanelHidden("auth-panel", true);
    setPanelHidden("account-session-panel", true);
    setAccountLoading(true);
  }

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
        "Account sign-in is temporarily unavailable. Please try again later.";
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

function bindProfileForm() {
  const form = byId("profile-form");
  const input = byId("profile-minecraft-username");
  const confirmed = byId("profile-username-confirmed");
  const changeUsernameButton = byId("change-username-button");

  if (changeUsernameButton && form) {
    changeUsernameButton.addEventListener("click", function () {
      form.hidden = !form.hidden;
      changeUsernameButton.textContent = form.hidden ? "Change username" : "Hide username form";
    });
  }

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

  bindProfileForm();

  const cancelSubscriptionButton = byId("cancel-subscription-button");

  if (cancelSubscriptionButton) {
    cancelSubscriptionButton.addEventListener("click", async function () {
      setStatus("cancel-subscription-status", "");
      cancelSubscriptionButton.disabled = true;
      cancelSubscriptionButton.setAttribute("aria-busy", "true");

      try {
        if (!window.CapitalTebexPortal || typeof window.CapitalTebexPortal.launch !== "function") {
          throw new Error("Subscription manager is temporarily unavailable.");
        }

        const result = await window.CapitalTebexPortal.launch();

        if (result && result.mode === "fallback") {
          setStatus(
            "cancel-subscription-status",
            "Opened the subscription manager in a new tab. Sign in with the same email you used at checkout.",
            "success"
          );
        }
      } catch (error) {
        setStatus(
          "cancel-subscription-status",
          error.message || "Could not open the subscription manager.",
          "error"
        );
      } finally {
        cancelSubscriptionButton.disabled = false;
        cancelSubscriptionButton.setAttribute("aria-busy", "false");
      }
    });
  }

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

  window.addEventListener("capital:username-setup-complete", function () {
    refreshAccountView();
  });

  window.addEventListener("capital:subscription-updated", function () {
    refreshAccountView();
  });

  window.addEventListener("storage", function (event) {
    if (event.key === "capital:subscription-updated") {
      refreshAccountView();
    }
  });

  window.addEventListener("pageshow", function () {
    refreshAccountView();
  });

  await refreshAccountView();
  scrollToSubscriptionManage();
}

function scrollToSubscriptionManage() {
  if (window.location.hash !== "#subscription-manage") {
    return;
  }

  const target = byId("subscription-manage");

  if (target) {
    window.requestAnimationFrame(function () {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

boot().catch(function (error) {
  console.error(error);
  finishAccountLoading();
  const warning = byId("account-service-warning");

  if (warning) {
    warning.hidden = false;
    warning.textContent = error.message || "Account page failed to load.";
  }
});
