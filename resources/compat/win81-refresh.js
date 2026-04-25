// Win 8.1 Refresh Button (JMP)
// Injects a refresh button into .headerRight in the Jellyfin toolbar.
// Clicking it:
//   1. Clears the JMP session cache for the current section
//   2. Records the current section (topParentId) and active tab index
//   3. Navigates to Home (away from the section)
//   4. Navigates back to the original section, then restores the saved tab

(function () {
  'use strict';

  var BTN_ID   = 'jmp-refresh-btn';
  var RETRY_MS = 100; // how often to retry finding .headerRight

  // Prevent double-load
  if (window.__jmpWin81RefreshLoaded) {
    return;
  }
  window.__jmpWin81RefreshLoaded = true;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[JMP refresh]');
    console.log.apply(console, args);
  }

  function normalizeText(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getHashParam(name) {
    var m = window.location.hash.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function getActiveTabIndex() {
    var activeBtn = document.querySelector('.emby-tab-button-active');
    if (activeBtn && activeBtn.getAttribute('data-index') != null) {
      return parseInt(activeBtn.getAttribute('data-index'), 10);
    }
    var activePage = document.querySelector('.pageTabContent.is-active');
    if (activePage && activePage.getAttribute('data-index') != null) {
      return parseInt(activePage.getAttribute('data-index'), 10);
    }
    return 0;
  }

  function findSectionLinks(topParentId) {
    var allLinks = Array.prototype.slice.call(document.querySelectorAll('a[href]'));

    var currentLink = allLinks.filter(function (a) {
      return a.href && a.href.indexOf('topParentId=') !== -1;
    }).find(function (a) {
      return a.href.indexOf(topParentId) !== -1;
    }) || null;

    var otherLink = allLinks.filter(function (a) {
      return normalizeText(a.textContent) === 'home';
    })[0] || null;

    return { currentLink: currentLink, otherLink: otherLink };
  }

  function waitFor(fn, opts) {
    opts = opts || {};
    var interval = opts.interval || 25;
    var timeout  = opts.timeout  || 4000;
    var start    = Date.now();

    return new Promise(function (resolve, reject) {
      var timer = setInterval(function () {
        var val = null;
        try { val = fn(); } catch (e) {}
        if (val) {
          clearInterval(timer);
          resolve(val);
          return;
        }
        if (Date.now() - start >= timeout) {
          clearInterval(timer);
          reject(new Error(opts.name || 'waitFor timeout'));
        }
      }, interval);
    });
  }

  // Wait until .emby-tabs and tab buttons are present on the back page
  function waitForBackPageTabs() {
    return waitFor(function () {
      var tabs    = document.querySelector('.emby-tabs');
      var buttons = document.querySelectorAll('.emby-tab-button[data-index]');
      return (tabs && typeof tabs.selectedIndex === 'function' && buttons.length)
        ? { tabs: tabs, buttons: buttons }
        : null;
    }, { name: 'waitForBackPageTabs', interval: 25, timeout: 5000 });
  }

  // Repeatedly attempt to activate the saved tab until it becomes active
  function forceTabUntilActive(savedTabIndex) {
    return new Promise(function (resolve, reject) {
      var start  = Date.now();
      var maxMs  = 3000;
      var tries  = 0;

      var timer = setInterval(function () {
        tries++;

        var activeBtn = document.querySelector('.emby-tab-button-active');
        var activeIdx = activeBtn ? activeBtn.getAttribute('data-index') : null;

        if (String(savedTabIndex) === String(activeIdx)) {
          clearInterval(timer);
          log('saved tab active:', savedTabIndex, 'after', tries, 'tries');
          resolve();
          return;
        }

        // Try direct button click first (most reliable on old QtWebEngine/Chromium 56),
        // then fall back to the selectedIndex API
        var tabBtn = document.querySelector('.emby-tab-button[data-index="' + savedTabIndex + '"]');
        if (tabBtn) {
          tabBtn.click();
          log('clicking tab button[data-index=' + savedTabIndex + '], current active:', activeIdx, 'try:', tries);
        } else {
          var tabs = document.querySelector('.emby-tabs');
          if (tabs && typeof tabs.selectedIndex === 'function') {
            try {
              tabs.selectedIndex(savedTabIndex);
              log('selectedIndex(' + savedTabIndex + '), current active:', activeIdx, 'try:', tries);
            } catch (e) {
              log('selectedIndex threw:', e);
            }
          }
        }

        if (Date.now() - start > maxMs) {
          clearInterval(timer);
          reject(new Error('forceTabUntilActive timeout; active=' + activeIdx));
        }
      }, 40);
    });
  }

  // ── Core refresh sequence ────────────────────────────────────────────────────

  function doRefresh() {
    var topParentId   = getHashParam('topParentId');
    var savedTabIndex = getActiveTabIndex();

    log('START — topParentId:', topParentId, 'savedTabIndex:', savedTabIndex);

    if (!topParentId) {
      log('ABORT: no topParentId in hash');
      return;
    }

    // 1. Clear our custom cache for the current section
    if (typeof window.__jmpClearCache === 'function') {
      window.__jmpClearCache();
      log('__jmpClearCache() called');
    } else {
      log('WARNING: __jmpClearCache missing');
    }

    // 2. Find the Home link (away destination) and the current section link (back destination)
    var links = findSectionLinks(topParentId);
    log('currentLink:', links.currentLink ? links.currentLink.href : 'NOT FOUND');
    log('otherLink (Home):', links.otherLink ? links.otherLink.href : 'NOT FOUND');

    if (!links.currentLink) {
      log('ABORT: currentLink missing');
      return;
    }
    if (!links.otherLink) {
      log('ABORT: Home link not found');
      return;
    }

    // 3. Navigate away to Home
    log('navigating to Home');
    links.otherLink.click();

    // 4. Navigate back to the original section, then restore the saved tab
    setTimeout(function () {
      log('navigating back to section');
      links.currentLink.click();

      waitForBackPageTabs()
        .then(function () {
          log('back page tabs ready; restoring tab', savedTabIndex);
          return forceTabUntilActive(savedTabIndex);
        })
        .then(function () {
          log('DONE');
        })
        .catch(function (err) {
          log('ERROR:', err && err.message ? err.message : err);
        });
    }, 50);
  }

  // ── Button ───────────────────────────────────────────────────────────────────

  function createButton() {
    var btn = document.createElement('button');
    btn.id        = BTN_ID;
    btn.title     = 'Refresh';
    btn.innerHTML = '&#x21BB;'; // ↻

    btn.addEventListener('click', function () {
      doRefresh();
    });

    return btn;
  }

  // ── Injection with retry ─────────────────────────────────────────────────────

  function injectButton() {
    var existing = document.getElementById(BTN_ID);
    var target   = document.querySelector('.headerRight');

    if (existing && target && target.contains(existing)) return;

    if (!target) {
      setTimeout(injectButton, RETRY_MS);
      return;
    }

    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    target.appendChild(createButton());
    log('refresh button injected');
  }

  // ── SPA navigation observer ──────────────────────────────────────────────────

  function startObserver() {
    var observer = new MutationObserver(function () {
      var btn    = document.getElementById(BTN_ID);
      var target = document.querySelector('.headerRight');

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

  // Expose for manual testing from DevTools
  window.__jmpTestRefresh = doRefresh;

})();