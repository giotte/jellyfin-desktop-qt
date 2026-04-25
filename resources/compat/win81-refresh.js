// Win 8.1 Refresh Button (JMP)
// Injects a refresh button into .headerRight in the Jellyfin toolbar.
// Clicking it:
//   1. Clears the JMP session cache
//   2. Navigates to Home, then back to the current section (topParentId)
//   3. Hides the items container to suppress tab-0 flash
//   4. Forces the previously active tab back and waits for content
//   5. Restores visibility once the saved tab content is in place

(function () {
  'use strict';

  var BTN_ID     = 'jmp-refresh-btn';
  var SPINNER_MS = 1200; // how long to show the spinning state
  var RETRY_MS   = 100;  // how often to retry finding .headerRight

  // Prevent double-load
  if (window.__jmpWin81RefreshLoaded) {
    return;
  }
  window.__jmpWin81RefreshLoaded = true;

  // ── Shared helpers ──────────────────────────────────────────────────────────

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

  function getItemsContainer() {
    return document.querySelector('[is="emby-itemscontainer"]');
  }

  function hideItemsContainer() {
    var c = getItemsContainer();
    if (!c) return;
    c.style.visibility = 'hidden';
    c.style.pointerEvents = 'none';
    c.setAttribute('data-jmp-hidden', '1');
    log('items container hidden');
  }

  function showItemsContainer() {
    var c = getItemsContainer();
    if (!c) return;
    c.style.visibility = '';
    c.style.pointerEvents = '';
    c.removeAttribute('data-jmp-hidden');
    log('items container shown');
  }

  function findSectionLinks(topParentId) {
    var allLinks = Array.prototype.slice.call(document.querySelectorAll('a[href]'));

    // Links that represent specific library sections (have topParentId in href)
    var sectionLinks = allLinks.filter(function(a) {
      return a.href && a.href.indexOf('topParentId=') !== -1;
    });

    // Current section link matches the active topParentId
    var currentLink = sectionLinks.find(function(a) {
      return a.href.indexOf(topParentId) !== -1;
    });

    // Away link: explicit "Home" link (by visible text)
    var homeCandidates = allLinks.filter(function(a) {
      return normalizeText(a.textContent) === 'home';
    });

    var otherLink = homeCandidates[0] || null;

    return {
      allLinks: allLinks,
      sectionLinks: sectionLinks,
      currentLink: currentLink,
      otherLink: otherLink,
      homeCandidates: homeCandidates
    };
  }

  function waitFor(fn, opts) {
    opts = opts || {};
    var interval = opts.interval || 25;
    var timeout = opts.timeout || 4000;
    var start = Date.now();

    return new Promise(function(resolve, reject) {
      var timer = setInterval(function() {
        var val = null;

        try {
          val = fn();
        } catch (e) {}

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

  function waitForBackPageTabs() {
    return waitFor(function() {
      var tabs = document.querySelector('.emby-tabs');
      var buttons = document.querySelectorAll('.emby-tab-button[data-index]');
      return (tabs && typeof tabs.selectedIndex === 'function' && buttons.length) ? {
        tabs: tabs,
        buttons: buttons
      } : null;
    }, { name: 'waitForBackPageTabs', interval: 25, timeout: 5000 });
  }

  function waitForTabZeroActive() {
    return waitFor(function() {
      var activeBtn = document.querySelector('.emby-tab-button-active');
      if (!activeBtn) return null;
      var idx = activeBtn.getAttribute('data-index');
      return idx === '0' ? activeBtn : null;
    }, { name: 'waitForTabZeroActive', interval: 25, timeout: 3000 });
  }

  function forceTabUntilActive(savedTabIndex) {
    return new Promise(function(resolve, reject) {
      var start = Date.now();
      var maxMs = 3000;
      var tries = 0;

      var timer = setInterval(function() {
        tries++;

        var tabs = document.querySelector('.emby-tabs');
        var activeBtn = document.querySelector('.emby-tab-button-active');
        var activeIdx = activeBtn ? activeBtn.getAttribute('data-index') : null;

        if (String(savedTabIndex) === String(activeIdx)) {
          clearInterval(timer);
          log('saved tab is active now:', savedTabIndex, 'after tries:', tries);
          resolve();
          return;
        }

        if (tabs && typeof tabs.selectedIndex === 'function') {
          try {
            tabs.selectedIndex(savedTabIndex);
            log('forcing selectedIndex(' + savedTabIndex + '), current active:', activeIdx, 'try:', tries);
          } catch (e) {
            log('selectedIndex threw:', e);
          }
        }

        if (Date.now() - start > maxMs) {
          clearInterval(timer);
          reject(new Error('forceTabUntilActive timeout; active=' + activeIdx));
        }
      }, 40);
    });
  }

  function waitForSavedTabContent(savedTabIndex) {
    return waitFor(function() {
      var activeBtn = document.querySelector('.emby-tab-button-active');
      var activeIdx = activeBtn ? activeBtn.getAttribute('data-index') : null;
      var container = getItemsContainer();
      var hasKids = !!(container && container.children && container.children.length > 0);
      return (String(activeIdx) === String(savedTabIndex) && hasKids) ? true : null;
    }, { name: 'waitForSavedTabContent', interval: 50, timeout: 4000 });
  }

  // ── Core refresh sequence (replaces old doRefresh) ──────────────────────────

  function doRefresh() {
    var hash = window.location.hash;
    var topParentId = getHashParam('topParentId');
    var savedTabIndex = getActiveTabIndex();

    log('START');
    log('hash:', hash);
    log('topParentId:', topParentId);
    log('savedTabIndex:', savedTabIndex);

    if (!topParentId) {
      log('ABORT: no topParentId in hash');
      return;
    }

    if (typeof window.__jmpClearCache === 'function') {
      window.__jmpClearCache();
      log('__jmpClearCache() called');
    } else {
      log('WARNING: __jmpClearCache missing');
    }

    var links = findSectionLinks(topParentId);

    log('currentLink:', links.currentLink ? links.currentLink.href : 'NOT FOUND');
    log('homeCandidates:', links.homeCandidates.map(function(a) {
      return {
        text: normalizeText(a.textContent),
        href: a.href
      };
    }));
    log('otherLink(Home):', links.otherLink ? links.otherLink.href : 'NOT FOUND');

    if (!links.currentLink) {
      log('ABORT: currentLink missing');
      return;
    }

    if (!links.otherLink) {
      log('ABORT: Home link not found');
      return;
    }

    hideItemsContainer();

    log('clicking away to Home:', links.otherLink.href);
    links.otherLink.click();

    setTimeout(function() {
      Promise.resolve().then(function() {
        return (async function() {
          try {
            log('clicking back:', links.currentLink.href);
            links.currentLink.click();

            await waitForBackPageTabs();
            log('back page tabs detected');

            await waitForTabZeroActive();
            log('tab 0 became active; now forcing saved tab');

            await forceTabUntilActive(savedTabIndex);
            await waitForSavedTabContent(savedTabIndex);

            showItemsContainer();
            log('DONE');
          } catch (err) {
            log('ERROR:', err && err.message ? err.message : err);
            showItemsContainer();
          }
        })();
      });
    }, 50);
  }

  // ── Button state helpers (unchanged) ────────────────────────────────────────

  function setSpinning(btn, on) {
    if (on) {
      btn.classList.add('jmp-refresh-spinning');
      btn.setAttribute('disabled', 'disabled');
    } else {
      btn.classList.remove('jmp-refresh-spinning');
      btn.removeAttribute('disabled');
    }
  }

  // ── Button creation (unchanged structural UI) ───────────────────────────────

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

  // ── Injection with retry (unchanged) ────────────────────────────────────────

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

  // ── SPA navigation observer (unchanged) ─────────────────────────────────────

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

  // ── Entry point (unchanged behavior) ────────────────────────────────────────

  function init() {
    injectButton();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Optional: expose for manual testing from DevTools
  window.__jmpTestRefresh2 = doRefresh;

})();