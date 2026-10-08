(() => {
  function createPerformanceModule(deps = {}) {
    const getNow = typeof deps.getNow === "function"
      ? deps.getNow
      : () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
    const isProductionRuntime = typeof deps.isProductionRuntime === "function"
      ? deps.isProductionRuntime
      : () => {
        const hostname = String(globalThis?.location?.hostname || "").trim().toLowerCase();
        return Boolean(hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1");
      };

    function isExperienceMetricDebugEnabled() {
      const queryDebugEnabled = /(?:[?&](?:winga_debug_perf|debugPerf)=1)(?:&|$)/i.test(String(window.location?.search || ""));
      if (isProductionRuntime()) {
        return queryDebugEnabled;
      }
      try {
        if (window.localStorage?.getItem("winga_debug_perf") === "true") {
          return true;
        }
      } catch (_error) {
        // Ignore debug storage access failures.
      }
      return queryDebugEnabled;
    }

    function getPerformanceNowSafe() {
      return getNow();
    }

    function safePerformanceMark(name = "") {
      const safeName = String(name || "").trim();
      if (!safeName || typeof performance?.mark !== "function") {
        return;
      }
      try {
        performance.mark(safeName);
      } catch (_error) {
        // Ignore mark collisions or unsupported browsers.
      }
    }

    function safePerformanceMeasure(name = "", startMark = "", endMark = "") {
      const safeName = String(name || "").trim();
      const safeStart = String(startMark || "").trim();
      const safeEnd = String(endMark || "").trim();
      if (!safeName || !safeStart || !safeEnd || typeof performance?.measure !== "function") {
        return null;
      }
      try {
        performance.measure(safeName, safeStart, safeEnd);
        const entries = typeof performance.getEntriesByName === "function"
          ? performance.getEntriesByName(safeName)
          : [];
        return entries.length ? Number(entries[entries.length - 1]?.duration || 0) : null;
      } catch (_error) {
        return null;
      }
    }

    function createExperienceFingerprint(value = "") {
      const source = String(value || "").trim();
      if (!source) {
        return "";
      }
      let hash = 0;
      for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
      }
      return Math.abs(hash).toString(36).slice(0, 8);
    }

    function createMetricWindowStore(windows = {}, options = {}) {
      const limit = Math.max(1, Number(options.limit || 24) || 24);

      function record(metric, value) {
        const safeMetric = String(metric || "").trim();
        const numericValue = Number(value);
        if (!safeMetric || !Number.isFinite(numericValue)) {
          return [];
        }
        const windowValues = Array.isArray(windows[safeMetric])
          ? windows[safeMetric]
          : (windows[safeMetric] = []);
        windowValues.push(Math.round(numericValue));
        while (windowValues.length > limit) {
          windowValues.shift();
        }
        return windowValues;
      }

      function summarize(metric) {
        const values = Array.isArray(windows?.[metric])
          ? windows[metric].filter((value) => Number.isFinite(Number(value)))
          : [];
        if (!values.length) {
          return {
            count: 0,
            average: 0,
            max: 0,
            latest: 0
          };
        }
        const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
        return {
          count: values.length,
          average: Math.round(total / values.length),
          max: Math.max(...values),
          latest: Number(values[values.length - 1] || 0)
        };
      }

      function reset() {
        Object.keys(windows).forEach((key) => {
          windows[key] = [];
        });
      }

      return {
        record,
        summarize,
        reset
      };
    }

    return {
      isExperienceMetricDebugEnabled,
      getPerformanceNowSafe,
      safePerformanceMark,
      safePerformanceMeasure,
      createExperienceFingerprint,
      createMetricWindowStore
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.monitoring = window.WingaModules.monitoring || {};
  window.WingaModules.monitoring.createPerformanceModule = createPerformanceModule;
  const experienceNames=Object.freeze(['open-shell','open-recent','send-confirmed','send-failed','send-pending','retry-confirmed','retry-failed','sync-confirmed','sync-failed',
    'offline-confirmed','offline-failed','transport-reconnect','transport-resume-confirmed','transport-resume-failed','transport-resume-pending']);
  const experienceWindows={};
  const experience=createPerformanceModule({}).createMetricWindowStore(experienceWindows,{limit:128});
  const buckets=new Map();let connection=null,owner='',runId=null,timer=null,generation=0,inflight=null;
  function resetExperience(){experience.reset();buckets.clear();runId=null;}
  function currentOwner(){const session=connection?.getSession?.();return session?.username&&session?.sessionId?JSON.stringify([session.username,session.sessionId,session.token||'']):'';}
  function syncOwner(){const next=currentOwner();if(next!==owner){resetExperience();owner=next;}return next;}
  async function flushExperience(){
    const session=syncOwner(),version=generation;
    if(!session||!runId||!buckets.size||inflight)return;
    const payload={version:1,runId,buckets:[...buckets.values()].map(row=>({...row}))};
    inflight=Promise.resolve().then(()=>{if(version===generation&&session===currentOwner())return connection.request(payload);}).catch(()=>{});
    try{await inflight;}finally{inflight=null;}
  }
  function scheduleExperience(){
    clearTimeout(timer);
    if(typeof window.setTimeout!=='function')return;
    timer=window.setTimeout(async()=>{try{await flushExperience();}finally{scheduleExperience();}},30000);
  }
  window.WingaConversationExperience=Object.freeze({
    record(name,value){
      if(!experienceNames.includes(name)||!Number.isFinite(value)||value<0||value>300000)return;
      if(connection)syncOwner();experience.record(name,value);
      if(!owner)return;
      runId ||= globalThis.crypto?.randomUUID?.();if(!runId)return;
      const time=Date.now(),hour=new Date(Math.floor(time/3600000)*3600000).toISOString();
      for(const [key,row] of buckets)if(Date.parse(row.hour)<time-24*3600000)buckets.delete(key);
      const key=hour+'|'+name,row=buckets.get(key)||{hour,name,count:0,totalDurationMs:0,maxDurationMs:0};
      if(row.count>=1e9)return;row.count++;row.totalDurationMs+=Math.round(value);row.maxDurationMs=Math.max(row.maxDurationMs,Math.round(value));buckets.set(key,row);
    },
    snapshot(){return {privacy:'aggregate-only',scope:'browser-process-local',metrics:experienceNames.map(name=>({name,...experience.summarize(name)}))};},
    reset:resetExperience,
    connect(options){generation++;connection=options;syncOwner();scheduleExperience();},
    flush:flushExperience
  });
})();
