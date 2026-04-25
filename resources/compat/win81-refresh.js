// Win 8.1 Refresh Button (JMP)
// Injects a refresh button into .headerRight in the Jellyfin toolbar.
// Clicking it:
//   1. Clears the JMP session cache for the current section
//   2. Records the current section (topParentId) and active tab index
//   3. Navigates to Home (away from the section)
//   4. Navigates back to the original section
//   5. Waits for the refreshed tab-0 Movies request to complete
//   6. Restores the saved tab
//
// This version uses request-based synchronization rather than DOM child-count
// heuristics so repeated refreshes are not fooled by stale DOM.

(function () {
  'use strict';

  var BTN_ID   = 'jmp-refresh-btn';
  var RETRY_MS = 100;

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

  function nowMs() {
    return Date.now();
  }

  function makeRefreshTrace() {
    return {
      id: nowMs(),
      t0: nowMs()
    };
  }

  function tlog(trace) {
    var args = Array.prototype.slice.call(arguments, 1);
    var dt = nowMs() - trace.t0;
    args.unshift('[JMP refresh #' + trace.id + ' +' + dt + 'ms]');
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

  function getDomSnapshot() {
    var activeBtn = document.querySelector('.emby-tab-button-active');
    var activeIdx = activeBtn ? activeBtn.getAttribute('data-index') : null;
    var activeText = activeBtn ? normalizeText(activeBtn.textContent) : null;

    var activePage = document.querySelector('.pageTabContent.is-active');
    var activePageIdx = activePage ? activePage.getAttribute('data-index') : null;

    var container = getItemsContainer();
    var childCount = container && container.children ? container.children.length : 0;
    var itemCount = container ? container.querySelectorAll('.card, .itemAction, .listItem').length : 0;

    return {
      hash: window.location.hash || '',
      title: document.title || '',
      activeIdx: activeIdx,
      activeText: activeText,
      activePageIdx: activePageIdx,
      hasContainer: !!container,
      childCount: childCount,
      itemCount: itemCount
    };
  }

  function logSnapshot(trace, label) {
    tlog(trace, label, getDomSnapshot());
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

    return {
      currentLink: currentLink,
      otherLink: otherLink
    };
  }

  function waitFor(fn, opts) {
    opts = opts || {};
    var interval = opts.interval || 25;
    var timeout  = opts.timeout  || 4000;
    var start    = Date.now();

    return new Promise(function (resolve, reject) {
      var timer = setInterval(function () {
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
    return waitFor(function () {
      var tabs = document.querySelector('.emby-tabs');
      var buttons = document.querySelectorAll('.emby-tab-button[data-index]');
      return (tabs && buttons.length) ? { tabs: tabs, buttons: buttons } : null;
    }, { name: 'waitForBackPageTabs', interval: 25, timeout: 5000 });
  }

  function includesItemType(value, wanted) {
    if (!value) return false;
    return String(value).toLowerCase().split(',').indexOf(String(wanted).toLowerCase()) !== -1;
  }

  function isMatchingTrackedRequest(evt, topParentId, includeItemType) {
    if (!evt || evt.kind !== 'getItems') return false;

    var p = evt.finalParams || {};
    var parentId = p.ParentId || p.parentId || '';
    var includeTypes = p.IncludeItemTypes || p.includeItemTypes || '';
    var hasJmp = p._jmp != null;

    if (String(parentId) !== String(topParentId)) return false;
    if (!includesItemType(includeTypes, includeItemType)) return false;
    if (!hasJmp) return false;

    return true;
  }

  function waitForTrackedRequest(topParentId, includeItemType, trace) {
    return waitFor(function () {
      var tracker = window.__jmpReq;
      if (!tracker || !tracker.events || !tracker.events.length) return null;

      var events = tracker.events;
      var i;
      for (i = events.length - 1; i >= 0; i--) {
        if (isMatchingTrackedRequest(events[i], topParentId, includeItemType)) {
          return events[i];
        }
      }
      return null;
    }, { name: 'waitForTrackedRequest(' + includeItemType + ')', interval: 25, timeout: 8000 }).then(function(evt) {
      tlog(trace, 'tracked request seen for', includeItemType, evt);
      return evt;
    });
  }

  function waitForTrackedRequestDone(reqId, trace) {
    return waitFor(function () {
      var tracker = window.__jmpReq;
      if (!tracker || !tracker.events) return null;

      var events = tracker.events;
      var i;
      for (i = events.length - 1; i >= 0; i--) {
        if (events[i].id === reqId && events[i].done) {
          return events[i];
        }
      }
      return null;
    }, { name: 'waitForTrackedRequestDone(' + reqId + ')', interval: 25, timeout: 12000 }).then(function(evt) {
      tlog(trace, 'tracked request done', evt);
      return evt;
    });
  }

  function restoreSavedTab(savedTabIndex, trace) {
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var maxMs = 3000;
      var tries = 0;

      var timer = setInterval(function () {
        tries++;

        var activeBtn = document.querySelector('.emby-tab-button-active');
        var activeIdx = activeBtn ? activeBtn.getAttribute('data-index') : null;

        if (String(savedTabIndex) === String(activeIdx)) {
          clearInterval(timer);
          tlog(trace, 'saved tab active:', savedTabIndex, 'after', tries, 'tries');
          logSnapshot(trace, 'restoreSavedTab:resolved');
          resolve();
          return;
        }

        var tabBtn = document.querySelector('.emby-tab-button[data-index="' + savedTabIndex + '"]');
        if (tabBtn) {
          tabBtn.click();
          tlog(trace, 'clicking saved tab button[data-index=' + savedTabIndex + '], current active:', activeIdx, 'try:', tries);
        } else {
          var tabs = document.querySelector('.emby-tabs');
          if (tabs && typeof tabs.selectedIndex === 'function') {
            try {
              tabs.selectedIndex(savedTabIndex);
              tlog(trace, 'selectedIndex(' + savedTabIndex + '), current active:', activeIdx, 'try:', tries);
            } catch (e) {
              tlog(trace, 'selectedIndex threw:', e);
            }
          }
        }

        if (Date.now() - start > maxMs) {
          clearInterval(timer);
          logSnapshot(trace, 'restoreSavedTab:timeout');
          reject(new Error('restoreSavedTab timeout; active=' + activeIdx));
        }
      }, 60);
    });
  }

  // ── Core refresh sequence ────────────────────────────────────────────────────

  function doRefresh() {
    var trace = makeRefreshTrace();
    var topParentId = getHashParam('topParentId');
    var savedTabIndex = getActiveTabIndex();

    tlog(trace, 'START — topParentId:', topParentId, 'savedTabIndex:', savedTabIndex);
    logSnapshot(trace, 'initial');

    if (!topParentId) {
      tlog(trace, 'ABORT: no topParentId in hash');
      return;
    }

    if (typeof window.__jmpClearCache === 'function') {
      window.__jmpClearCache();
      tlog(trace, '__jmpClearCache() called');
    } else {
      tlog(trace, 'WARNING: __jmpClearCache missing');
    }

    var links = findSectionLinks(topParentId);
    tlog(trace, 'currentLink:', links.currentLink ? links.currentLink.href : 'NOT FOUND');
    tlog(trace, 'otherLink (Home):', links.otherLink ? links.otherLink.href : 'NOT FOUND');

    if (!links.currentLink) {
      tlog(trace, 'ABORT: currentLink missing');
      return;
    }

    if (!links.otherLink) {
      tlog(trace, 'ABORT: Home link not found');
      return;
    }

    tlog(trace, 'navigating to Home');
    links.otherLink.click();
    logSnapshot(trace, 'after-home-click');

    setTimeout(function () {
      tlog(trace, 'navigating back to section');
      links.currentLink.click();
      logSnapshot(trace, 'after-back-click');

      waitForBackPageTabs()
        .then(function () {
          tlog(trace, 'back page tabs ready');
          logSnapshot(trace, 'back-page-tabs-ready');

          if (savedTabIndex === 0) {
            tlog(trace, 'savedTabIndex is 0; no restore needed');
            return null;
          }

          // Wait for the actual refreshed Movies (tab 0) request, not DOM children.
          return waitForTrackedRequest(topParentId, 'Movie', trace)
            .then(function(evt) {
              return waitForTrackedRequestDone(evt.id, trace);
            })
            .then(function(evt) {
              tlog(trace, 'movies refresh request completed; restoring saved tab', savedTabIndex, evt);
              logSnapshot(trace, 'before-restore-saved-tab');
              return restoreSavedTab(savedTabIndex, trace);
            });
        })
        .then(function () {
          tlog(trace, 'DONE');
          logSnapshot(trace, 'final');
        })
        .catch(function (err) {
          tlog(trace, 'ERROR:', err && err.message ? err.message : err);
          logSnapshot(trace, 'error');
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

  window.__jmpTestRefresh = doRefresh;

})();