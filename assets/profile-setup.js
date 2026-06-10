const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const MODAL_CLOSE_DELAY_MS = 190;

let modalEl = null;
let modalBusy = false;
let closeTimer = 0;
let bound = false;

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message, type) {
  const element = byId("setup-modal-status");

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

function setBusy(form, busy) {
  if (!form) {
    return;
  }

  form.querySelectorAll("button, input").forEach(function (control) {
    control.disabled = busy;
    control.setAttribute("aria-busy", busy ? "true" : "false");
  });
}

function updateSubmitState() {
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
    submit.disabled = modalBusy || !valid || !(confirmed && confirmed.checked);
  }
}

function ensureModal() {
  if (modalEl) {
    return modalEl;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    '<div aria-hidden="true" aria-labelledby="username-setup-title" aria-modal="true" class="store-modal username-setup-modal" hidden id="username-setup-modal" role="dialog">' +
      '<div class="store-modal-backdrop"></div>' +
      '<div class="store-modal-card" role="document">' +
      '<div class="store-modal-header">' +
      '<p class="eyebrow">Welcome</p>' +
      '<h2 class="store-modal-title" id="username-setup-title">You\'re logged in</h2>' +
      '<p class="store-modal-subtitle">' +
      "Please enter your exact current <strong>Minecraft Java username</strong>. " +
      "You only need to do this once. You can change it later from " +
      "<strong>Account → Manage account</strong>." +
      "</p>" +
      "</div>" +
      '<form class="account-form" id="username-setup-form" novalidate>' +
      '<label class="store-label" for="setup-username">Minecraft Java username</label>' +
      '<input autocomplete="username" class="store-input" id="setup-username" maxlength="16" name="minecraftUsername" placeholder="Example: Steve" required type="text"/>' +
      '<label class="confirm-check" for="setup-username-confirmed">' +
      '<input id="setup-username-confirmed" type="checkbox"/>' +
      "<span>" +
      'I confirm <strong id="setup-username-preview">this username</strong> is my current in-game name. ' +
      "If it is wrong, ranks may not apply correctly." +
      "</span>" +
      "</label>" +
      '<p aria-live="polite" class="account-status" id="setup-modal-status"></p>' +
      '<div class="store-modal-actions store-modal-actions-single">' +
      '<button class="button button-primary" disabled id="setup-username-submit" type="submit">Save and continue</button>' +
      "</div>" +
      "</form>" +
      "</div>" +
      "</div>"
  );

  modalEl = byId("username-setup-modal");
  bindModalForm();
  return modalEl;
}

function openModal() {
  const modal = ensureModal();

  if (!modal || modalBusy) {
    return;
  }

  window.clearTimeout(closeTimer);
  setStatus("");
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

function closeModal(force) {
  const modal = modalEl || byId("username-setup-modal");

  if (!modal || modalBusy && !force) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  closeTimer = window.setTimeout(function () {
    modal.hidden = true;
    setStatus("");
  }, MODAL_CLOSE_DELAY_MS);
}

function bindModalForm() {
  if (bound) {
    return;
  }

  bound = true;

  const form = byId("username-setup-form");
  const input = byId("setup-username");
  const confirmed = byId("setup-username-confirmed");

  if (input) {
    input.addEventListener("input", function () {
      if (confirmed) {
        confirmed.checked = false;
      }
      updateSubmitState();
    });
  }

  if (confirmed) {
    confirmed.addEventListener("change", updateSubmitState);
  }

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus("");
      modalBusy = true;
      setBusy(form, true);
      updateSubmitState();

      try {
        await window.CapitalAuth.upsertProfile(
          byId("setup-username").value.trim(),
          Boolean(byId("setup-username-confirmed").checked)
        );

        closeModal(true);

        const returnUrl = new URLSearchParams(window.location.search).get("return");

        if (returnUrl && returnUrl.charAt(0) === "/" && returnUrl.indexOf("//") !== 0) {
          window.location.href = returnUrl;
          return;
        }

        window.dispatchEvent(new CustomEvent("capital:username-setup-complete"));
      } catch (error) {
        setStatus(error.message || "Could not save username.", "error");
      } finally {
        modalBusy = false;
        setBusy(form, false);
        updateSubmitState();
      }
    });
  }

  updateSubmitState();
}

async function refreshPrompt() {
  const auth = window.CapitalAuth;

  if (!auth || typeof auth.ready !== "function") {
    return;
  }

  await auth.ready();

  if (!auth.configured || !(await auth.isLoggedIn())) {
    closeModal(true);
    return;
  }

  try {
    if (await auth.hasCompleteProfile()) {
      closeModal(true);
      return;
    }
  } catch (error) {
    console.error(error);
    return;
  }

  openModal();
}

window.CapitalProfileSetup = {
  refresh: refreshPrompt,
  open: openModal,
  close: closeModal
};

async function boot() {
  if (!window.CapitalAuth || typeof window.CapitalAuth.ready !== "function") {
    return;
  }

  await window.CapitalAuth.ready();

  window.addEventListener("capital:username-setup-required", function () {
    refreshPrompt().catch(console.error);
  });

  if (typeof window.CapitalAuth.onAuthStateChange === "function") {
    window.CapitalAuth.onAuthStateChange(function () {
      refreshPrompt().catch(console.error);
    });
  }

  await refreshPrompt();
}

boot().catch(console.error);
