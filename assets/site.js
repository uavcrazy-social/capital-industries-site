(function () {
  "use strict";

  function setText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  function initializeCopyButtons() {
    var buttons = document.querySelectorAll("[data-copy-value]");
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var value = button.getAttribute("data-copy-value");
        var original = button.getAttribute("data-original-text") || button.textContent;
        button.setAttribute("data-original-text", original);

        if (!value) {
          return;
        }

        if (!navigator.clipboard) {
          setText(button, "Copy unavailable");
          window.setTimeout(function () { setText(button, original); }, 1600);
          return;
        }

        navigator.clipboard.writeText(value).then(function () {
          setText(button, "Copied");
          window.setTimeout(function () { setText(button, original); }, 1600);
        }).catch(function () {
          setText(button, "Copy failed");
          window.setTimeout(function () { setText(button, original); }, 1600);
        });
      });
    });
  }

  function initializeDownloadChecks() {
    var links = document.querySelectorAll("[data-check-download]");
    links.forEach(function (link) {
      var url = link.getAttribute("href");
      var unavailableText = link.getAttribute("data-unavailable-text") || "Coming Soon";

      if (!url) {
        return;
      }

      fetch(url, { method: "HEAD", cache: "no-store" }).then(function (response) {
        if (!response.ok) {
          throw new Error("Download missing");
        }
      }).catch(function () {
        link.classList.add("button-disabled");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("data-original-href", url);
        link.removeAttribute("href");
        setText(link, unavailableText);
      });
    });
  }

  initializeCopyButtons();
  initializeDownloadChecks();
}());
