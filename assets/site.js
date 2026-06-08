(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var prefetched = new Set();
  var ticking = false;

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

  function updateParallax() {
    if (prefersReducedMotion) {
      return;
    }

    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(function () {
      var y = Math.round(window.scrollY * -0.16);
      document.documentElement.style.setProperty("--parallax-y", y + "px");
      ticking = false;
    });
  }

  function initializeRevealAnimations() {
    var elements = document.querySelectorAll("[data-reveal]");

    if (prefersReducedMotion || !window.IntersectionObserver) {
      elements.forEach(function (element) {
        element.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    elements.forEach(function (element) {
      observer.observe(element);
    });
  }

  function isInternalNavigationLink(anchor) {
    if (!anchor || !anchor.href) {
      return false;
    }

    if (anchor.target || anchor.hasAttribute("download")) {
      return false;
    }

    var url = new URL(anchor.href, window.location.href);
    return url.origin === window.location.origin && url.pathname !== window.location.pathname;
  }

  function prefetch(url) {
    if (prefetched.has(url)) {
      return;
    }

    prefetched.add(url);
    var link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    document.head.appendChild(link);
  }

  function initializeNavigationEnhancements() {
    var anchors = document.querySelectorAll("a[href]");

    anchors.forEach(function (anchor) {
      anchor.addEventListener("mouseenter", function () {
        if (isInternalNavigationLink(anchor)) {
          prefetch(anchor.href);
        }
      });

      anchor.addEventListener("focus", function () {
        if (isInternalNavigationLink(anchor)) {
          prefetch(anchor.href);
        }
      });

      anchor.addEventListener("click", function (event) {
        if (prefersReducedMotion || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }

        if (!isInternalNavigationLink(anchor)) {
          return;
        }

        event.preventDefault();
        document.body.classList.add("is-leaving");
        window.setTimeout(function () {
          window.location.href = anchor.href;
        }, 140);
      });
    });

    window.addEventListener("pageshow", function () {
      document.body.classList.remove("is-leaving");
    });
  }

  initializeCopyButtons();
  initializeDownloadChecks();
  initializeRevealAnimations();
  initializeNavigationEnhancements();
  updateParallax();
  window.addEventListener("scroll", updateParallax, { passive: true });
}());
