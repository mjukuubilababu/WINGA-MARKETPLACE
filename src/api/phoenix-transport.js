(() => {
  let library;
  function loadSocket() {
    if (window.Phoenix?.Socket) return Promise.resolve(window.Phoenix.Socket);
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const finish = error => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve(window.Phoenix.Socket);
      };
      const timer = setTimeout(() => finish(new Error("Phoenix client unavailable.")), 10000);
      script.src = "/vendor/phoenix.min.js?v=1.8.15";
      script.onload = () => finish(window.Phoenix?.Socket ? null : new Error("Phoenix client unavailable."));
      script.onerror = () => finish(new Error("Phoenix client unavailable."));
      document.head.appendChild(script);
    }).catch(error => { library = null; throw error; });
    return library;
  }

  function canaryUrl(config, session, location = window.location) {
    if (config?.phoenixTransportEnabled !== true || !session?.username
      || (config.phoenixAllUsers !== true
        && (!Array.isArray(config.phoenixCanaryUsers) || !config.phoenixCanaryUsers.includes(session.username)))) return "";
    try {
      const url = new URL(config.phoenixTransportUrl);
      const local = ["localhost", "127.0.0.1"].includes(location?.hostname)
        && ["localhost", "127.0.0.1"].includes(url.hostname);
      if ((url.protocol !== "wss:" && !(local && url.protocol === "ws:"))
        || url.username || url.password || url.search || url.hash || url.pathname !== "/socket") return "";
      return url.href;
    } catch { return ""; }
  }

  function textPayload(payload) {
    const fields = new Set(["clientMessageId", "receiverId", "message", "messageType", "productId", "productName", "productItems", "replyToMessageId"]);
    if (!payload || Object.keys(payload).some(key => !fields.has(key)) || !payload.clientMessageId
      || (payload.messageType && payload.messageType !== "text") || payload.productId || payload.productName
      || payload.replyToMessageId || (payload.productItems && (!Array.isArray(payload.productItems) || payload.productItems.length))) return null;
    return { clientMessageId: payload.clientMessageId, receiverId: payload.receiverId, message: payload.message };
  }

  function createPhoenixTransport(deps) {
    const later = deps.setTimeout || setTimeout, cancel = deps.clearTimeout || clearTimeout;
    const now = deps.now || Date.now, random = deps.random || Math.random;
    let closed = false, epoch = 0, socket = null, channel = null, timer = null, deadline = null;
    let joined = false, receiving = false, attempts = 0, expiresAt = 0;
    let joinWhenOpen = null;
    let reconnectStarted=null,everJoined=false,resumeAttempt=null,resumeTimer=null;
    const metric=(name,value)=>{try{globalThis.WingaConversationExperience?.record(name,value);}catch{}};
    const pending = new Set();
    const report = (state, phase) => { try { deps.onState?.({transport: "phoenix", state, phase}); } catch {} };
    const failure = (code = "transport_unavailable", status = 503) => Object.assign(
      new Error("Conversation transport request was not confirmed."), { code, status, retryable: status >= 500 });
    const current = generation => !closed && epoch === generation && deps.isCurrent();
    const isReady = () => current(epoch) && joined && now() < expiresAt && channel?.canPush() === true;
    function reset() {
      epoch++;
      joined = false;
      expiresAt = 0;
      receiving = false;
      cancel(timer); cancel(deadline);cancel(resumeTimer);resumeTimer=null;
      timer = deadline = null;
      for (const reject of [...pending]) reject(failure("outcome_unknown"));
      pending.clear();
      const old = channel;
      channel = null;
      joinWhenOpen = null;
      socket?.disconnect();
      old?.leave(1);
    }
    function close() { closed = true; reset(); }
    function retry(generation, error) {
      if (!current(generation)) return;
      if(resumeAttempt!==null){metric('transport-resume-failed',now()-resumeAttempt);resumeAttempt=null;}
      if(everJoined && reconnectStarted===null){reconnectStarted=now();metric('transport-reconnect',0);}
      if ([401, 403, 404].includes(error?.status)) { close(); return; }
      reset();
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) * (0.8 + random() * 0.4);
      timer = later(start, delay);
    }
    function command(event, payload, generation = epoch) {
      return new Promise((resolve, reject) => {
        if (!current(generation) || !isReady() || pending.size >= 8) return reject(failure());
        let done = false, timeout;
        const finish = (error, result) => {
          if (done) return;
          done = true; cancel(timeout); pending.delete(abort);
          if (error) reject(error);
          else if (!current(generation)) reject(failure("outcome_unknown"));
          else resolve(result);
        };
        const abort = error => finish(error);
        pending.add(abort);
        timeout = later(() => finish(failure("outcome_unknown")), 8000);
        try {
          channel.push(event, payload, 8000)
            .receive("ok", result => finish(null, result))
            .receive("error", result => finish(failure(result?.code === "rejected" ? "message_rejected" : "outcome_unknown",
              result?.code === "rejected" ? 409 : 503)))
            .receive("timeout", () => finish(failure("outcome_unknown")));
        } catch { finish(failure("outcome_unknown")); }
      });
    }
    async function start() {
      if (closed || !deps.isCurrent()) { close(); return; }
      reset();
      const generation = epoch;
      if(everJoined&&reconnectStarted!==null)resumeAttempt=now();
      deadline = later(() => retry(generation), 15000);
      let phase = "library";
      try {
        const Socket = await (deps.loadSocket || loadSocket)();
        if (!current(generation)) return;
        phase = "ticket";
        const ticket = await deps.fetchTicket();
        if (!current(generation)) return;
        if (ticket?.version !== 1 || typeof ticket.ticket !== "string" || ticket.ticket.length > 2048
          || !Number.isSafeInteger(ticket.expiresAt) || ticket.expiresAt <= now() + 1000) throw failure();
        phase = "socket";
        if (!socket) {
          socket = new Socket(deps.url, { params: {}, timeout: 8000, heartbeatIntervalMs: 20000 });
          socket.onOpen(() => {
            if (closed || !deps.isCurrent()) { close(); return; }
            if (joinWhenOpen) joinWhenOpen();
            else start(); // Browser resume requires a fresh scoped ticket.
          });
          socket.onClose(() => { report("unavailable", "socket_closed"); retry(epoch); });
          socket.onError(() => { report("unavailable", "socket_error"); retry(epoch); });
        }
        phase = "channel";
        channel = socket.channel("device", { ticket: ticket.ticket });
        channel.onError(() => { report("unavailable", "channel_error"); retry(generation); });
        channel.onClose(() => { report("unavailable", "channel_closed"); retry(generation); });
        channel.on("events", async batch => {
          if (!current(generation) || !joined) return;
          if (receiving) { retry(generation); return; }
          receiving = true;
          try {
            const persisted = await deps.onEvents(batch, ids => command("events.ack", { eventIds: ids }, generation));
            if (persisted !== true) throw failure();
            if(current(generation) && resumeAttempt!==null){
              metric('transport-resume-confirmed',now()-resumeAttempt);resumeAttempt=null;reconnectStarted=null;cancel(resumeTimer);resumeTimer=null;
            }
          } catch (error) {
            retry(generation, error);
          }
          finally { if (current(generation)) receiving = false; }
        });
        phase = "join";
        // Join only on an open socket: the SDK must never buffer an old ticket.
        joinWhenOpen = () => {
          if (!current(generation)) return;
          joinWhenOpen = null;
          channel.join(8000).receive("ok", principal => {
            if (!current(generation)) return;
            if (principal?.deviceId !== deps.deviceId || principal?.securityMode !== "legacy-plaintext"
              || principal?.expiresAt !== ticket.expiresAt) { retry(generation,{status:401}); return; }
            cancel(deadline); deadline = null;
            joined = true; attempts = 0; expiresAt = ticket.expiresAt;
            everJoined=true;
            if(resumeAttempt!==null)resumeTimer=later(()=>{
              if(current(generation)&&resumeAttempt!==null){metric('transport-resume-pending',now()-resumeAttempt);resumeAttempt=null;reconnectStarted=null;}
            },15000);
            report("ready", "joined");
            const ttl = ticket.expiresAt - now();
            timer = later(start, Math.max(100, ttl - Math.min(30000, ttl / 2)));
          }).receive("error", () => retry(generation, { status: 401 }))
            .receive("timeout", () => retry(generation));
        };
        phase = "connect";
        socket.connect();
      } catch (error) { report("unavailable", phase); retry(generation, error); }
    }
    start();
    return {
      close,
      isReady,
      async sendMessage(payload) {
        const body = textPayload(payload);
        if (!body || !isReady()) return null;
        const result = await command("message.send", body);
        const message = result?.message;
        if (result?.accepted !== true || !message?.id || message.senderId !== deps.owner
          || message.receiverId !== body.receiverId || !/^[1-9][0-9]{0,18}$/.test(message.conversationSequence)) {
          throw failure("outcome_unknown");
        }
        return message;
      }
    };
  }
  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.phoenix = { createPhoenixTransport, canaryUrl, textPayload };
})();
