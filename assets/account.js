const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const EDIT_MODAL_CLOSE_DELAY_MS = 190;
let initialAccountLoad = true;
let refreshInFlight = null;
let editModalEl = null;
let editModalBusy = false;
let editModalCloseTimer = 0;
let editModalBound = false;

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

  closeEditModal(true);
}

async function renderSignedIn(user, profile, options) {
  const needsSetup = Boolean(options && options.needsSetup);

  finishAccountLoading();
  setPanelHidden("auth-panel", true);
  setPanelHidden("account-session-panel", false);

  setText("account-summary", "Signed in as " + (profile?.minecraft_username || "Account"));
  setText("account-linked-username", profile?.minecraft_username || "—");

  const editUsernameButton = byId("edit-username-button");

  if (editUsernameButton) {
    editUsernameButton.hidden = needsSetup;
  }

  await renderAccountDetails(user);

  if (!needsSetup && profile) {
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

function setEditModalStatus(message, type) {
  setStatus("edit-username-status", message, type);
}

function updateEditSubmitState() {
  const input = byId("edit-username-input");
  const confirmed = byId("edit-username-confirmed");
  const submit = byId("edit-username-submit");
  const preview = byId("edit-username-preview");
  const username = input ? input.value.trim() : "";
  const valid = USERNAME_PATTERN.test(username);

  if (preview) {
    preview.textContent = username || "this username";
  }

  if (submit) {
    submit.disabled = editModalBusy || !valid || !(confirmed && confirmed.checked);
  }
}

function ensureEditModal() {
  if (editModalEl) {
    return editModalEl;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    '<div aria-hidden="true" aria-labelledby="edit-username-title" aria-modal="true" class="store-modal username-edit-modal" hidden id="edit-username-modal" role="dialog">' +
      '<div class="store-modal-backdrop" data-modal-dismiss=""></div>' +
      '<div class="store-modal-card" role="document">' +
      '<button aria-label="Close username dialog" class="store-modal-close" data-modal-dismiss="" type="button">×</button>' +
      '<div class="store-modal-header">' +
      '<h2 class="store-modal-title" id="edit-username-title">Change username</h2>' +
      '<p class="store-modal-subtitle">Enter your exact current Minecraft Java username.</p>' +
      "</div>" +
      '<form class="account-form" id="edit-username-form" novalidate>' +
      '<label class="store-label" for="edit-username-input">Minecraft Java username</label>' +
      '<input autocomplete="username" class="store-input" id="edit-username-input" maxlength="16" name="minecraftUsername" required type="text"/>' +
      '<label class="confirm-check" for="edit-username-confirmed">' +
      '<input id="edit-username-confirmed" type="checkbox"/>' +
      "<span>" +
      'I confirm <strong id="edit-username-preview">this username</strong> is my current in-game name.' +
      "</span>" +
      "</label>" +
      '<p aria-live="polite" class="account-status" id="edit-username-status"></p>' +
      '<div class="store-modal-actions store-modal-actions-single">' +
      '<button class="button button-primary" disabled id="edit-username-submit" type="submit">Save username</button>' +
      "</div>" +
      "</form>" +
      "</div>" +
      "</div>"
  );

  editModalEl = byId("edit-username-modal");
  bindEditModal();
  return editModalEl;
}

function openEditModal(currentUsername) {
  const modal = ensureEditModal();

  if (!modal || editModalBusy) {
    return;
  }

  const input = byId("edit-username-input");
  const confirmed = byId("edit-username-confirmed");

  window.clearTimeout(editModalCloseTimer);
  setEditModalStatus("");

  if (input) {
    input.value = currentUsername || "";
  }

  if (confirmed) {
    confirmed.checked = false;
  }

  updateEditSubmitState();

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  window.requestAnimationFrame(function () {
    modal.classList.add("is-open");
  });

  window.setTimeout(function () {
    if (input) {
      input.focus();
      input.select();
    }
  }, 90);
}

function closeEditModal(force) {
  const modal = editModalEl || byId("edit-username-modal");

  if (!modal || editModalBusy && !force) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  editModalCloseTimer = window.setTimeout(function () {
    modal.hidden = true;
    setEditModalStatus("");
  }, EDIT_MODAL_CLOSE_DELAY_MS);
}

function bindEditModal() {
  if (editModalBound) {
    return;
  }

  editModalBound = true;

  const modal = ensureEditModal();
  const form = byId("edit-username-form");
  const input = byId("edit-username-input");
  const confirmed = byId("edit-username-confirmed");

  if (input) {
    input.addEventListener("input", function () {
      if (confirmed) {
        confirmed.checked = false;
      }
      updateEditSubmitState();
    });
  }

  if (confirmed) {
    confirmed.addEventListener("change", updateEditSubmitState);
  }

  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target && event.target.hasAttribute("data-modal-dismiss")) {
        closeEditModal(false);
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    const visibleModal = editModalEl || byId("edit-username-modal");

    if (event.key === "Escape" && visibleModal && !visibleModal.hidden) {
      closeEditModal(false);
    }
  });

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setEditModalStatus("");
      editModalBusy = true;
      setBusy(form, true);
      updateEditSubmitState();

      try {
        await window.CapitalAuth.upsertProfile(
          byId("edit-username-input").value.trim(),
          Boolean(byId("edit-username-confirmed").checked)
        );
        closeEditModal(true);
        await refreshAccountView();
      } catch (error) {
        setEditModalStatus(error.message || "Could not save username.", "error");
      } finally {
        editModalBusy = false;
        setBusy(form, false);
        updateEditSubmitState();
      }
    });
  }

  updateEditSubmitState();
}

function bindUsernameEdit() {
  const editUsernameButton = byId("edit-username-button");

  if (editUsernameButton) {
    editUsernameButton.addEventListener("click", function () {
      openEditModal(byId("account-linked-username")?.textContent?.trim() || "");
    });
  }
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

  bindUsernameEdit();

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
