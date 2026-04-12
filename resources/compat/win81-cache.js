(function() {
  'use strict';

  function installCache() {
    if (typeof ApiClient === 'undefined' || typeof ApiClient.getItems !== 'function') {
      setTimeout(installCache, 200);
      return;
    }
    if (ApiClient.__jmpCacheInstalled) return;

    var _original = ApiClient.getItems;
    ApiClient.__jmpCache        = {};
    ApiClient.__jmpCacheInstalled = true;
    ApiClient.__jmpOriginal     = _original; // exposed for HTTP cache-busting

    ApiClient.getItems = function(userId, params) {
      // __jmpOriginal may be temporarily replaced by the refresh script;
      // always call through it so cache-busting is honoured.
      var fn = ApiClient.__jmpOriginal || _original;

      var key = userId + '|' + JSON.stringify(
        Object.keys(params).sort().reduce(function(acc, k) {
          acc[k] = params[k]; return acc;
        }, {})
      );

      if (ApiClient.__jmpCache[key]) {
        return Promise.resolve(ApiClient.__jmpCache[key]);
      }

      return fn.call(this, userId, params).then(function(result) {
        ApiClient.__jmpCache[key] = result;
        return result;
      });
    };

    window.__jmpClearCache = function() {
      ApiClient.__jmpCache = {};
      console.log('[JMP] Cache cleared');
    };
  }

  installCache();
})();
