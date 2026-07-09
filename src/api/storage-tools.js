(() => {
  function createStorageTools(deps = {}) {
    const getStorage = typeof deps.getStorage === "function" ? deps.getStorage : () => localStorage;

    function safeStorageGet(key) {
      try {
        return getStorage().getItem(key);
      } catch (_error) {
        return null;
      }
    }

    function safeStorageSet(key, value) {
      try {
        getStorage().setItem(key, value);
        return true;
      } catch (_error) {
        return false;
      }
    }

    function setStorageOrThrow(key, value, label = "data za Winga") {
      try {
        getStorage().setItem(key, value);
        return true;
      } catch (error) {
        const quotaExceeded = error?.name === "QuotaExceededError"
          || error?.code === 22
          || error?.code === 1014
          || /quota|storage|space/i.test(String(error?.message || ""));
        if (quotaExceeded) {
          throw new Error(`${label} zimezidi nafasi ya browser/simu. Punguza idadi au ukubwa wa picha kisha ujaribu tena.`);
        }
        throw new Error(`Imeshindikana kuhifadhi ${label} kwenye browser hii. Jaribu tena au fungua app upya.`);
      }
    }

    function safeStorageRemove(key) {
      try {
        getStorage().removeItem(key);
      } catch (_error) {
        // Ignore storage removal failures and continue with in-memory flow.
      }
    }

    function readStoredJson(key, fallbackValue) {
      const raw = safeStorageGet(key);
      if (!raw) {
        return fallbackValue;
      }
      try {
        return JSON.parse(raw);
      } catch (_error) {
        return fallbackValue;
      }
    }

    return {
      safeStorageGet,
      safeStorageSet,
      setStorageOrThrow,
      safeStorageRemove,
      readStoredJson
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.storageTools = window.WingaModules.api.storageTools || {};
  window.WingaModules.api.storageTools.createStorageTools = createStorageTools;
})();
