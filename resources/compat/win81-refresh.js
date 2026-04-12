// Win 8.1 Refresh Button
// Injects a floating refresh button into the Jellyfin toolbar.
// Clicking it:
//   1. Temporarily enables cache-busting on ApiClient.getItems (one cycle)
//   2. Clears the JMP session cache
//   3. Reloads the active tab via selectedIndex round-trip

(function () {
  'use strict';

  var BTN_ID     = 'jmp-refresh-btn';
  var SPINNER_MS = 1200; // how long to show the spinning state

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getTabsEl() {
    return document.querySelector('.emby-tabs');
  }

  function getActiveIndex() {
    var page = document.querySelector('.pageTabContent.is-active');
    return page ? parseInt(page.getAttribute('data-index'), 10) : -1;
  }

  function getOtherIndex(current) {
    // find a tab button whose data-index differs from current
    var buttons = document.querySelectorAll('.emby-tab-button');
    for (var i = 0; i < buttons.length; i++) {
      var idx = parseInt(buttons[i].getAttribute('data-index'), 10);
      if (!isNaN(idx) && idx !== current) return idx;
    }
    return -1;
  }

  // ── Cache-busting patch ──────────────────────────────────────────────────────
  // Wraps _original (the real getItems before our session cache) so that
  // for one refresh cycle every outgoing URL gets a unique ?_jmp= timestamp.
  // This forces Chromium's in-memory HTTP cache to treat it as a new request.

  function runWithHttpCacheBust(callback) {
    if (typeof ApiClient === 'undefined' || !ApiClient.__jmpCacheInstalled) {
      // cache script not ready — just run the callback as-is
      callback();
      return;
    }

    // Grab the reference to the real (unwrapped) getItems that win81-cache.js
    // stored. We temporarily replace it with a busting version.
    var savedOriginal = ApiClient.__jmpOriginal;
    if (!savedOriginal) {
      callback();
      return;
    }

    var busting = true;

    ApiClient.__jmpOriginal = function (userId, params) {
      var bustParams = {};
      var k;
      for (k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) {
          bustParams[k] = params[k];
        }
      }
      bustParams._jmp = Date.now();
      return savedOriginal.call(this, userId, bustParams);
    };

    callback();

    // Restore after the tab switch has had time to fire its requests (~600 ms)
    setTimeout(function () {
      if (busting) {
        ApiClient.__jmpOriginal = savedOriginal;
        busting = false;
      }
    }, 600);
  }

  // ── Core refresh sequence ────────────────────────────────────────────────────

  function doRefresh() {
    var tabsEl  = getTabsEl();
    var current = getActiveIndex();
    var other   = getOtherIndex(current);

    // 1. Clear JS-level session cache
    if (typeof window.__jmpClearCache === 'function') {
      window.__jmpClearCache();
    }

    if (!tabsEl || current < 0 || other < 0) return;

    // 2. Perform HTTP cache-bust + tab round-trip
    runWithHttpCacheBust(function () {
      tabsEl.selectedIndex(other);
      setTimeout(function () {
        tabsEl.selectedIndex(current);
      }, 50);
    });
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

  // ── Button injection ─────────────────────────────────────────────────────────

  function injectButton() {
    if (document.getElementById(BTN_ID)) return; // already present

    var btn = document.createElement('button');
    btn.id          = BTN_ID;
    btn.title       = 'Refresh';
    btn.innerHTML   = '&#x21BB;'; // ↻  U+21BB CLOCKWISE OPEN CIRCLE ARROW

    btn.addEventListener('click', function () {
      setSpinning(btn, true);
      doRefresh();
      setTimeout(function () {
        setSpinning(btn, false);
      }, SPINNER_MS);
    });

    // Prefer the right-side header controls area; fall back to body
    var target =
      document.querySelector('.headerRight') ||
      document.querySelector('.skinHeader') ||
      document.querySelector('.headerButtons') ||
      document.body;

    target.appendChild(btn);
  }

  // ── Toolbar observer ─────────────────────────────────────────────────────────
  // The Jellyfin SPA swaps header content on navigation.
  // We watch for DOM changes so the button survives page transitions.

  var _observer = null;

  function startObserver() {
    if (_observer) return;
    _observer = new MutationObserver(function () {
      if (!document.getElementById(BTN_ID)) {
        injectButton();
      }
    });
    _observer.observe(document.documentElement, { childList: true, subtree: true });
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
