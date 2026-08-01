(function () {
  "use strict";

  var LAUNCHER_BASE = "http://launcher.capitalindustries.net/launcher/";
  var MANIFEST_BASE = "/assets/launcher/";

  function encodeLauncherPath(fileName) {
    return LAUNCHER_BASE + encodeURIComponent(fileName).replace(/%20/g, "%20");
  }

  function parseElectronLatestYml(text) {
    var versionMatch = text.match(/^\s*version:\s*(.+)\s*$/m);
    var pathMatch = text.match(/^\s*path:\s*(.+)\s*$/m);
    var urls = [];
    var urlRe = /^\s*-\s*url:\s*(.+)\s*$/gm;
    var match;

    while ((match = urlRe.exec(text))) {
      urls.push(match[1].trim());
    }

    return {
      version: versionMatch ? versionMatch[1].trim().replace(/^["']|["']$/g, "") : "",
      path: pathMatch ? pathMatch[1].trim().replace(/^["']|["']$/g, "") : "",
      urls: urls
    };
  }

  function pickFile(manifest, preferredExts) {
    var candidates = manifest.urls.slice();

    if (manifest.path) {
      candidates.push(manifest.path);
    }

    var i;
    var j;
    var name;
    var lower;

    for (i = 0; i < preferredExts.length; i += 1) {
      for (j = 0; j < candidates.length; j += 1) {
        name = candidates[j];
        lower = name.toLowerCase();
        if (lower.endsWith(preferredExts[i])) {
          return name;
        }
      }
    }

    return candidates[0] || "";
  }

  function platformLabel(channel, fileName, version) {
    var lower = (fileName || "").toLowerCase();
    var ver = version ? " (" + version + ")" : "";

    if (channel === "windows") {
      return "Windows" + ver;
    }

    if (channel === "mac") {
      return "macOS" + ver;
    }

    if (lower.endsWith(".deb")) {
      return "Linux .deb" + ver;
    }

    if (lower.endsWith(".appimage")) {
      return "Linux AppImage" + ver;
    }

    return "Linux" + ver;
  }

  function setButton(button, fileName, version, channel) {
    if (!button || !fileName) {
      return;
    }

    var href = encodeLauncherPath(fileName);
    var label = platformLabel(channel, fileName, version);
    var icon = button.querySelector(".button-icon");

    button.href = href;
    button.setAttribute("data-launcher-file", fileName);
    button.setAttribute("data-launcher-version", version || "");
    button.removeAttribute("aria-disabled");
    button.classList.remove("button-disabled");

    button.textContent = "";
    if (icon) {
      button.appendChild(icon);
    } else {
      icon = document.createElement("img");
      icon.alt = "";
      icon.className = "button-icon";
      icon.src =
        channel === "windows"
          ? "/assets/icons/download-dark.svg"
          : "/assets/icons/download.svg";
      button.appendChild(icon);
    }

    button.appendChild(document.createTextNode(" " + label));
  }

  function fetchManifest(name) {
    return fetch(MANIFEST_BASE + name, { cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        throw new Error("Missing " + name);
      }
      return response.text();
    });
  }

  function initializeLauncherDownloads() {
    var root = document.querySelector("[data-launcher-downloads]");

    if (!root) {
      return;
    }

    var winBtn = root.querySelector('[data-launcher-channel="windows"]');
    var macBtn = root.querySelector('[data-launcher-channel="mac"]');
    var linuxBtn = root.querySelector('[data-launcher-channel="linux"]');
    var note = document.querySelector("[data-launcher-note]");

    Promise.all([
      fetchManifest("latest.yml"),
      fetchManifest("latest-mac.yml"),
      fetchManifest("latest-linux.yml")
    ])
      .then(function (texts) {
        var win = parseElectronLatestYml(texts[0]);
        var mac = parseElectronLatestYml(texts[1]);
        var linux = parseElectronLatestYml(texts[2]);

        var winFile = pickFile(win, [".exe"]);
        var macFile = pickFile(mac, [".dmg", ".zip"]);
        var linuxFile = pickFile(linux, [".deb", ".appimage"]);

        setButton(winBtn, winFile, win.version, "windows");
        setButton(macBtn, macFile, mac.version, "mac");
        setButton(linuxBtn, linuxFile, linux.version, "linux");

        if (note) {
          note.textContent =
            "mc 1.21.1 neo 21.1.227 · auto-selected from latest launcher manifests";
        }
      })
      .catch(function (error) {
        console.error(error);
        if (note) {
          note.textContent =
            "mc 1.21.1 neo 21.1.227 · using fallback download links (manifest sync unavailable)";
        }
      });
  }

  initializeLauncherDownloads();
})();
