// Win 8.1 Refresh Button
// Injects a floating refresh button into the Jellyfin toolbar.
// Clicking it:
//   1. Clears the JMP session cache
//   2. Reloads the active tab via selectedIndex round-trip

(function () {
  'use strict';

  var BTN_ID     = 'jmp-refresh-btn';
  var SPINNER_MS = 1200; // how long to show the spinning state
  var RETRY_MS   = 100;  // how often to retry finding .headerRight

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getTabsEl() {
    return document.querySelector('.emby-tabs');
  }

  function getActiveIndex() {
    var page = document.querySelector('.pageTabContent.is-active');
    return page ? parseInt(page.getAttribute('data-index'), 10) : -1;
  }

  function getOtherIndex(current) {
    var buttons = document.querySelectorAll('.emby-tab-button');
    for (var i = 0; i < buttons.length; i++) {
      var idx = parseInt(buttons[i].getAttribute('data-index'), 10);
      if (!isNaN(idx) && idx !== current) return idx;
    }
    return -1;
  }

  // ── Core refresh sequence ────────────────────────────────────────────────────

  function doRefresh() {
    var tabsEl  = getTabsEl();
    var current = getActiveIndex();
    var other   = getOtherIndex(current);

    if (typeof window.__jmpClearCache === 'function') {
      window.__jmpClearCache();
    }

    if (!tabsEl || current < 0 || other < 0) return;

    tabsEl.selectedIndex(other);
    setTimeout(function () {
      tabsEl.selectedIndex(current);
    }, 50);
  }

  // ── Button state helpers ─────────────────────────────────────────────────────

  function setSpinning(btn, on) {
    if (on) {
      btn.classList.add('jmp-refresh-spinning');
      btn.setAttribute('disabled', 'disabled');
    } else {
      btn.classList.remove('jmp-refresh-spinning');
      btn.removeAttribute('disabled');
    }
  }

  // ── Button creation ──────────────────────────────────────────────────────────

  function createButton() {
    var btn = document.createElement('button');
    btn.id        = BTN_ID;
    btn.title     = 'Refresh';
    btn.innerHTML = '&#x21BB;'; // ↻

    btn.addEventListener('click', function () {
      setSpinning(btn, true);
      doRefresh();
      setTimeout(function () {
        setSpinning(btn, false);
      }, SPINNER_MS);
    });

    return btn;
  }

  // ── Injection with retry ─────────────────────────────────────────────────────
  // .headerRight is rendered by the Jellyfin SPA after the page JS runs,
  // so we poll until it exists before inserting the button.

  function injectButton() {
    // If button already exists and is inside .headerRight, nothing to do
    var existing = document.getElementById(BTN_ID);
    var target   = document.querySelector('.headerRight');

    if (existing && target && target.contains(existing)) return;

    if (!target) {
      // .headerRight not ready yet — retry
      setTimeout(injectButton, RETRY_MS);
      return;
    }

    // Remove stale button from wherever it ended up (e.g. body fallback)
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    target.appendChild(createButton());
  }

  // ── SPA navigation observer ──────────────────────────────────────────────────
  // Jellyfin swaps header content on navigation, which removes our button.
  // Watch for that and re-inject.

  function startObserver() {
    var observer = new MutationObserver(function () {
      var btn    = document.getElementById(BTN_ID);
      var target = document.querySelector('.headerRight');

      // Re-inject if button is gone, or if it exists but not inside headerRight
      if (!btn || (target && !target.contains(btn))) {
        injectButton();
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── Entry point ──────────────────────────────────────────────────────────────

  function init() {
    injectButton();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
