(function () {
  "use strict";

  if (window.__jmpWin81IconsLoaded) return;
  window.__jmpWin81IconsLoaded = true;

  var DEBUG_PREFIX = "[win81-icons]";
  var processedAttr = "data-jmp-icon-patched";
  var forcedAttr = "data-jmp-icon-forced";
  var reasonAttr = "data-jmp-icon-reason";
  var labelAttr = "data-jmp-icon-label";
  var textClass = "jmp-icon-text";
  var hostClass = "jmp-icon-host";
  var forcedClass = "jmp-icon-forced";
  var scanScheduled = false;

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(DEBUG_PREFIX);
      console.log.apply(console, args);
    } catch (e) {}
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .replace(/\u00a0/g, " ")
      .replace(/[_\-\s]+/g, "")
      .toLowerCase();
  }

  function getText(node) {
    try {
      return String(node && node.textContent || "").trim();
    } catch (e) {
      return "";
    }
  }

  function looksLikeMaterialIconNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.classList && node.classList.contains("material-icons")) return true;

    var cls = node.className || "";
    if (typeof cls === "string" && cls.indexOf("material-icons") !== -1) return true;

    if (node.classList) {
      if (node.classList.contains("cardImageIcon")) return true;
      if (node.classList.contains("cardOverlayButtonIcon")) return true;
      if (node.classList.contains("navMenuOptionIcon")) return true;
      if (node.classList.contains("listItemIcon")) return true;
      if (node.classList.contains("md-icon")) return true;
    }

    return node.tagName === "I" || node.tagName === "SPAN";
  }

  var iconMap = {
    playarrow:    { label: "Play" },
    playall:      { label: "Play" },
    pause:        { label: "Pause" },
    stop:         { label: "Stop" },
    close:        { label: "Close" },
    menu:         { label: "Menu" },
    morevert:     { label: "More" },
    check:        { label: "OK" },
    favorite:     { label: "Fav" },
    chevronright: { label: ">" },
    chevronleft:  { label: "<" },
    movie:        { label: "Movie" },
    tv:           { label: "TV" },
    videolibrary: { label: "Video" },
    home:         { label: "Home" },
    storage:      { label: "Store" },
    settings:     { label: "Set" },
    exittoapp:    { label: "Exit" },
    arrowback:    { label: "Back" },
    groups:       { label: "Grp" },
    musicnote:    { label: "Music" },
    cast:         { label: "Cast" },
    search:       { label: "Find" },
    person:       { label: "User" },
    shuffle:      { label: "Mix" },
    viewcomfy:    { label: "Grid" },
    sortbyalpha:  { label: "Sort" },
    filteralt:    { label: "Filt" },
    add:          { label: "+" },
    fastforward:  { label: ">>" },
    fastrewind:   { label: "<<" }
  };

  function getIconInfo(node) {
    if (!node) return null;

    if (node.classList) {
      for (var i = 0; i < node.classList.length; i++) {
        var cls = node.classList[i];
        var key = normalize(cls);
        if (iconMap[key]) {
          return { icon: iconMap[key], reason: "class=" + cls };
        }
      }
    }

    var aria = normalize(node.getAttribute && node.getAttribute("aria-label"));
    if (aria && iconMap[aria]) {
      return { icon: iconMap[aria], reason: "aria-label=" + aria };
    }

    var title = normalize(node.getAttribute && node.getAttribute("title"));
    if (title && iconMap[title]) {
      return { icon: iconMap[title], reason: "title=" + title };
    }

    var text = normalize(getText(node));
    if (text && iconMap[text]) {
      return { icon: iconMap[text], reason: "text=" + text };
    }

    return null;
  }

  function ensureTextSpan(node, label) {
    var textNode = node.querySelector("." + textClass);
    if (!textNode) {
      textNode = document.createElement("span");
      textNode.className = textClass;
      textNode.setAttribute("aria-hidden", "true");
      node.appendChild(textNode);
    }

    while (node.firstChild) {
      if (node.firstChild === textNode) break;
      node.removeChild(node.firstChild);
    }
    while (textNode.nextSibling) {
      node.removeChild(textNode.nextSibling);
    }

    textNode.textContent = label;
  }

  function patchNode(node) {
    if (!looksLikeMaterialIconNode(node)) return false;
    if (node.hasAttribute(processedAttr)) return false;

    var info = getIconInfo(node);
    node.setAttribute(processedAttr, "1");
    node.classList.add(hostClass);

    if (!info) return true;

    ensureTextSpan(node, info.icon.label);
    node.setAttribute(forcedAttr, "1");
    node.setAttribute(reasonAttr, info.reason);
    node.setAttribute(labelAttr, info.icon.label);
    node.classList.add(forcedClass);

    return true;
  }

  function collectNodes(root) {
    var out = [];
    var seen = [];

    function add(node) {
      if (!node || node.nodeType !== 1) return;
      if (seen.indexOf(node) !== -1) return;
      seen.push(node);
      if (looksLikeMaterialIconNode(node)) out.push(node);
    }

    add(root);

    var scope = root && root.querySelectorAll ? root : document;
    try {
      var found = scope.querySelectorAll(
        ".material-icons, i.material-icons, .cardImageIcon, .cardOverlayButtonIcon, .navMenuOptionIcon, .listItemIcon, .md-icon"
      );
      for (var i = 0; i < found.length; i++) add(found[i]);
    } catch (e) {}

    return out;
  }

  function patchIcons(root, reason) {
    var nodes = collectNodes(root || document);
    var matched = 0;
    var forced = 0;

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.hasAttribute(processedAttr)) continue;

      var info = getIconInfo(node);
      var ok = patchNode(node);
      if (!ok) continue;

      matched++;
      if (info) forced++;
    }

    log("patchIcons matched=" + matched + " forced=" + forced + " reason=" + reason);
  }

  function schedulePatch(reason) {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(function () {
      scanScheduled = false;
      patchIcons(document, reason);
    }, 75);
  }

  function observeAddedNodesOnly() {
    var observer = new MutationObserver(function (mutations) {
      var shouldScan = false;

      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== "childList" || !m.addedNodes || !m.addedNodes.length) continue;

        for (var j = 0; j < m.addedNodes.length; j++) {
          var node = m.addedNodes[j];
          if (!node || node.nodeType !== 1) continue;

          if (looksLikeMaterialIconNode(node)) {
            shouldScan = true;
            break;
          }

          if (node.querySelector &&
              node.querySelector(".material-icons, i.material-icons, .cardImageIcon, .cardOverlayButtonIcon, .navMenuOptionIcon, .listItemIcon, .md-icon")) {
            shouldScan = true;
            break;
          }
        }

        if (shouldScan) break;
      }

      if (shouldScan) schedulePatch("mutation-childlist");
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    patchIcons(document, "initial");
    setTimeout(function () { patchIcons(document, "timeout-250"); }, 250);
    setTimeout(function () { patchIcons(document, "timeout-1000"); }, 1000);
    setTimeout(function () { patchIcons(document, "timeout-2500"); }, 2500);
    setTimeout(function () { patchIcons(document, "timeout-5000"); }, 5000);

    observeAddedNodesOnly();
    log("init complete");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();