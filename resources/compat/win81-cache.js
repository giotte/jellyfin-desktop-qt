(function() {
  'use strict';

  function installCache() {
    if (typeof ApiClient === 'undefined' || typeof ApiClient.getItems !== 'function') {
      setTimeout(installCache, 200);
      return;
    }
    if (ApiClient.__jmpCacheInstalled) return;

    var _original = ApiClient.getItems;
    ApiClient.__jmpCache = {};
    ApiClient.__jmpCacheInstalled = true;

    ApiClient.getItems = function(userId, params) {
      var key = userId + '|' + JSON.stringify(
        Object.keys(params).sort().reduce(function(acc, k) {
          acc[k] = params[k]; return acc;
        }, {})
      );

      if (ApiClient.__jmpCache[key]) {
        return Promise.resolve(ApiClient.__jmpCache[key]);
      }

      return _original.call(this, userId, params).then(function(result) {
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