(function() {
  'use strict';

  function installCache() {
    if (typeof ApiClient === 'undefined' || typeof ApiClient.getItems !== 'function') {
      setTimeout(installCache, 200);
      return;
    }
    if (ApiClient.__jmpCacheInstalled) return;

    var _original = ApiClient.getItems;
    ApiClient.__jmpCache          = {};
    ApiClient.__jmpCacheInstalled = true;
    ApiClient.__jmpOriginal       = _original;
    ApiClient.__jmpBusting        = false;

    function cloneParams(params) {
      var out = {};
      var k;
      params = params || {};
      for (k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) {
          out[k] = params[k];
        }
      }
      return out;
    }

    function normalizeParams(params) {
      var src = cloneParams(params);
      var out = {};
      Object.keys(src).sort().forEach(function(k) {
        out[k] = src[k];
      });
      return out;
    }

    function ensureReqTracker() {
      if (!window.__jmpReq) {
        window.__jmpReq = {
          nextId: 1,
          events: [],
          maxEvents: 200,
          push: function(evt) {
            this.events.push(evt);
            if (this.events.length > this.maxEvents) {
              this.events.splice(0, this.events.length - this.maxEvents);
            }
          }
        };
      }
      return window.__jmpReq;
    }

    ApiClient.getItems = function(userId, params) {
      var originalParams = cloneParams(params || {});
      var callParams = cloneParams(originalParams);

      if (ApiClient.__jmpBusting) {
        callParams._jmp = Date.now();
      }

      var cacheKey = userId + '|' + JSON.stringify(
        Object.keys(originalParams).sort().reduce(function(acc, k) {
          acc[k] = originalParams[k];
          return acc;
        }, {})
      );

      var tracker = ensureReqTracker();
      var reqId = tracker.nextId++;
      var startedAt = Date.now();

      var meta = {
        id: reqId,
        kind: 'getItems',
        userId: userId,
        originalParams: normalizeParams(originalParams),
        finalParams: normalizeParams(callParams),
        cacheKey: cacheKey,
        startedAt: startedAt,
        done: false,
        fromCache: false,
        ok: null
      };

      if (ApiClient.__jmpCache[cacheKey]) {
        meta.fromCache = true;
        meta.done = true;
        meta.ok = true;
        meta.endedAt = Date.now();
        tracker.push(meta);
        return Promise.resolve(ApiClient.__jmpCache[cacheKey]);
      }

      tracker.push(meta);

      var fn = ApiClient.__jmpOriginal;
      return fn.call(this, userId, callParams).then(function(result) {
        ApiClient.__jmpCache[cacheKey] = result;

        meta.done = true;
        meta.ok = true;
        meta.endedAt = Date.now();
        meta.resultCount = result && result.Items && result.Items.length || 0;

        return result;
      }, function(err) {
        meta.done = true;
        meta.ok = false;
        meta.endedAt = Date.now();
        meta.error = err && err.message ? err.message : String(err);
        throw err;
      });
    };

    window.__jmpClearCache = function() {
      var match = window.location.href.match(/topParentId=([a-f0-9]+)/i);
      if (match) {
        var parentId = match[1];
        var deleted = 0;
        Object.keys(ApiClient.__jmpCache).forEach(function(key) {
          if (key.indexOf(parentId) !== -1) {
            delete ApiClient.__jmpCache[key];
            deleted++;
          }
        });
        console.log('[JMP] Cache cleared for ParentId ' + parentId + ' (' + deleted + ' entries)');
      } else {
        ApiClient.__jmpCache = {};
        console.log('[JMP] Cache cleared (all entries — no topParentId found)');
      }

      ApiClient.__jmpBusting = true;
      setTimeout(function() {
        ApiClient.__jmpBusting = false;
      }, 600);
    };
  }

  installCache();
})();