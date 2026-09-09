(() => {
  const fail = (code) => Object.assign(new Error(code), { code });

  function createPhotoReelPublisher(deps) {
    let job = null;
    let busy = false;
    const emit = (phase, error = "") => {
      if (job) job.phase = phase;
      deps.onState?.({ phase, error, busy, canCancel: busy && phase !== "publishing" });
    };
    const isCurrent = (operation) => job === operation && deps.canUse()
      && deps.getOwner() === operation.payload.uploadedBy;
    const requireCurrent = (operation) => {
      if (!isCurrent(operation)) throw fail("reel.interrupted");
    };
    const matches = (result, operation) => result?.id === operation.payload.id
      && result.uploadedBy === operation.payload.uploadedBy
      && result.mediaItems?.some(item => item.type === "video" && item.providerId === operation.media?.providerId);

    async function findPublished(operation) {
      const found = await deps.findPublished(operation.payload);
      if (!found) return null;
      if (!matches(found, operation)) throw fail("reel.publishConflict");
      return found;
    }

    async function run(operation) {
      if (busy || job !== operation) return;
      busy = true;
      try {
        requireCurrent(operation);
        if (!operation.file) {
          emit("creating");
          operation.file = await deps.generator.generate(operation.photos, { seconds: 2 });
          operation.file.reelDurationSeconds = operation.photos.length * 2;
          operation.photos = [];
        }
        requireCurrent(operation);
        if (!operation.media) {
          emit("uploading");
          const options = { onState(state) {
            if (job === operation && state.phase === "processing") emit("processing");
          } };
          try {
            operation.media = operation.providerId
              ? await deps.uploader.resume(operation.providerId, options)
              : await deps.uploader.start(operation.file, options);
          } catch (error) {
            if (error?.providerId && error.retryable) operation.providerId = error.providerId;
            throw error;
          }
          if (operation.media?.type !== "video" || operation.media.status !== "ready" || !operation.media.providerId) {
            operation.media = null;
            throw fail("reel.publishFailed");
          }
          operation.payload.mediaItems = [{ ...operation.media, position: 0 }];
        }
        requireCurrent(operation);
        emit("publishing");
        // Reconcile an uncertain response before retrying the same product ID.
        let result = operation.attempted ? await findPublished(operation) : null;
        requireCurrent(operation);
        if (!result) {
          operation.attempted = true;
          try {
            result = await deps.publish(operation.payload);
            if (!matches(result, operation)) throw fail("reel.publishFailed");
          } catch (error) {
            if (!isCurrent(operation)) throw error;
            result = await findPublished(operation).catch(() => null);
            if (!result) throw error;
          }
        }
        if (job !== operation) return;
        const notifyOwner = isCurrent(operation);
        job = null;
        busy = false;
        emit("done");
        if (notifyOwner) deps.onPublished?.(result);
        return result;
      } catch (error) {
        if (job !== operation) return;
        try { deps.onError?.(error, { phase: operation.phase }); } catch (_reportError) { /* Reporting must not block recovery. */ }
        busy = false;
        if (!isCurrent(operation)) {
          job = null;
          emit("error", "reel.interrupted");
          return;
        }
        emit("error", error?.code || "reel.publishFailed");
      } finally {
        if (job === operation) busy = false;
      }
    }

    function start(files) {
      if (busy) return Promise.resolve();
      if (!deps.canUse()) throw fail("reel.accountRequired");
      const photos = deps.validate(files);
      const context = deps.getContext();
      if (!context?.uploadedBy || context.uploadedBy !== deps.getOwner()) throw fail("reel.accountRequired");
      if (!/^\d{10,15}$/.test(context.whatsapp || "")) throw fail("reel.accountRequired");
      deps.uploader.cancel();
      job = {
        photos, file: null, media: null, providerId: "", attempted: false, phase: "creating",
        payload: {
          id: deps.createId(), name: "Reel", price: null, shop: context.uploadedBy,
          whatsapp: context.whatsapp, uploadedBy: context.uploadedBy, category: "reels",
          image: "", images: [], mediaItems: [], imageAspectRatios: [], imageSignature: "",
          fitMode: "contain", status: "approved", likes: 0, views: 0, viewedBy: []
        }
      };
      return run(job);
    }
    function cancel() {
      if (job?.phase === "publishing" && busy) return false;
      job = null;
      busy = false;
      deps.generator.cancel();
      deps.uploader.cancel();
      emit("idle");
      return true;
    }
    return { start, retry: () => job ? run(job) : Promise.resolve(), cancel,
      isBusy: () => busy, canRetry: () => Boolean(job && !busy) };
  }
  window.WingaModules.marketplace.createPhotoReelPublisher = createPhotoReelPublisher;
})();
