(() => {
  function createLifecycleModule(deps = {}) {
    const {
      getState = () => ({}),
      isStaffRole = () => false
    } = deps;

    function getLifecycleState() {
      const state = getState();
      return state && typeof state === "object" ? state : {};
    }

    function beginLifecycleEpoch(kind = "runtime") {
      const state = getLifecycleState();
      const nextEpoch = Number(state.epoch || 0) + 1;
      state.epoch = nextEpoch;
      state.activeKind = String(kind || "runtime");
      return nextEpoch;
    }

    function isLifecycleEpochCurrent(epoch) {
      const state = getLifecycleState();
      return Number(epoch || 0) > 0 && Number(epoch) === Number(state.epoch || 0);
    }

    function getEphemeralLifecycleViewOptions(options = {}) {
      return {
        persist: false,
        syncHistory: false,
        ...options
      };
    }

    function getBootTargetView(session = null) {
      if (isStaffRole(session?.role || "")) {
        return "admin";
      }
      return "home";
    }

    return {
      beginLifecycleEpoch,
      isLifecycleEpochCurrent,
      getEphemeralLifecycleViewOptions,
      getBootTargetView
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.boot = window.WingaModules.boot || {};
  window.WingaModules.boot.createLifecycleModule = createLifecycleModule;
})();
