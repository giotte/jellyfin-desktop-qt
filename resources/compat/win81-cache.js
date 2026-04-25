(function() {
  'use strict';

  function installCache() {
    if (typeof ApiClient === 'undefined' || typeof ApiClient.getItems !== 'function') {
      setTimeout(installCache, 200);
      return;
    }
    if (ApiClient.__jmpCacheInstalled) return;

    var _original = ApiClient.getItems;
    ApiClient.__jmpCache         = {};
    ApiClient.__jmpCacheInstalled = true;
    ApiClient.__jmpOriginal      = _original;
    ApiClient.__jmpBusting       = false;

    ApiClient.getItems = function(userId, params) {
      // If busting mode is active, add a timestamp to bypass HTTP cache
      var callParams = params;
      if (ApiClient.__jmpBusting) {
        callParams = {};
        var k;
        for (k in params) {
          if (Object.prototype.hasOwnProperty.call(params, k)) {
            callParams[k] = params[k];
          }
        }
        callParams._jmp = Date.now();
      }

      var key = userId + '|' + JSON.stringify(
        Object.keys(params).sort().reduce(function(acc, k) {
          acc[k] = params[k]; return acc;
        }, {})
      );

      if (ApiClient.__jmpCache[key]) {
        return Promise.resolve(ApiClient.__jmpCache[key]);
      }

      var fn = ApiClient.__jmpOriginal;
      return fn.call(this, userId, callParams).then(function(result) {
        ApiClient.__jmpCache[key] = result;
        return result;
      });
    };

    window.__jmpClearCache = function() {
      // Extract the current section's ParentId from the URL
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
        // No topParentId in URL — fall back to clearing everything
        ApiClient.__jmpCache = {};
        console.log('[JMP] Cache cleared (all entries — no topParentId found)');
      }

      // Busting mode for HTTP cache
      ApiClient.__jmpBusting = true;
      setTimeout(function() {
        ApiClient.__jmpBusting = false;
      }, 600);
    };
  }

  installCache();
})();