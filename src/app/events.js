(() => {
  function createAppEventsModule(deps = {}) {
    const {
      createAbortController = () => (typeof AbortController !== "undefined" ? new AbortController() : null),
      reportDuplicate = () => {},
      captureError = () => {}
    } = deps;
    const registry = new Map();

    function getRegistrationKey(target, type, key = "") {
      if (key) {
        return String(key);
      }
      const targetName = target === window
        ? "window"
        : (target === document ? "document" : (target?.id || target?.dataset?.eventScope || "target"));
      return `${targetName}:${String(type || "")}`;
    }

    function resolveTarget(target) {
      return typeof target === "function" ? target() : target;
    }

    function normalizeOptions(options, abortController) {
      if (!abortController) {
        return options;
      }
      if (options === true || options === false || options == null) {
        return {
          capture: Boolean(options),
          signal: abortController.signal
        };
      }
      return {
        ...(options || {}),
        signal: options?.signal || abortController.signal
      };
    }

    function register({ target, type, handler, options = undefined, key = "" } = {}) {
      const resolvedTarget = resolveTarget(target);
      if (!resolvedTarget?.addEventListener || typeof handler !== "function" || !type) {
        return null;
      }
      const registryKey = getRegistrationKey(resolvedTarget, type, key);
      if (registry.has(registryKey)) {
        reportDuplicate(registryKey);
        return registry.get(registryKey);
      }
      const abortController = createAbortController();
      const listenerOptions = normalizeOptions(options, abortController);
      try {
        resolvedTarget.addEventListener(type, handler, listenerOptions);
      } catch (error) {
        captureError("app_event_register_failed", error, {
          type,
          key: registryKey
        });
        return null;
      }
      const entry = {
        key: registryKey,
        target: resolvedTarget,
        type,
        handler,
        options,
        abortController,
        cleanup() {
          if (abortController) {
            abortController.abort();
          } else {
            resolvedTarget.removeEventListener(type, handler, options);
          }
          registry.delete(registryKey);
        }
      };
      registry.set(registryKey, entry);
      return entry;
    }

    function registerMany(registrations = []) {
      return (Array.isArray(registrations) ? registrations : [])
        .map((registration) => register(registration))
        .filter(Boolean);
    }

    function unregister(key = "") {
      const registryKey = String(key || "");
      const entry = registry.get(registryKey);
      if (!entry) {
        return false;
      }
      entry.cleanup();
      return true;
    }

    function unregisterAll() {
      Array.from(registry.values()).forEach((entry) => entry.cleanup());
    }

    return {
      register,
      registerMany,
      unregister,
      unregisterAll,
      getRegisteredKeys: () => Array.from(registry.keys())
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.app = window.WingaModules.app || {};
  window.WingaModules.app.createAppEventsModule = createAppEventsModule;
})();
