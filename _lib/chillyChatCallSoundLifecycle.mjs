const RETIRED = Symbol("retired-call-sound");

/** Owns every sound made by the shared call-sound helper, including pending loads. */
export function createChillyChatCallSoundLifecycle({ drainTimeoutMs = 5_000 } = {}) {
  if (!Number.isFinite(drainTimeoutMs) || drainTimeoutMs <= 0) {
    throw new Error("A finite call-sound cleanup deadline is required.");
  }
  const records = new Set();
  const bySound = new WeakMap();
  const releasedOwners = new WeakSet();
  let fence = null;
  const current = (check) => {
    try { return check() === true; } catch { return false; }
  };
  const failure = () => new Error("Call sound cleanup could not be verified.");

  const dispose = (record) => {
    record.retired = true;
    if (!record.cleanup) {
      record.cleanup = (async () => {
        // Never unload during a pending load/play; its late result could mutate
        // the shared session after the handoff or recreate a disposed sound.
        await record.startup;
        if (!record.loadIssued) {
          records.delete(record);
          return;
        }
        let stopFailed = false;
        try { await record.operations.stop(record.sound); }
        catch { stopFailed = true; }
        // A failed unload remains in records. Expo drops its native key before
        // awaiting unload, so a later unloaded JS status cannot prove disposal.
        await record.operations.unload(record.sound);
        records.delete(record);
        if (stopFailed) throw failure();
      })();
      // A retired startup may have no caller left. Keep failure on the record
      // for a handoff to observe without emitting an unhandled rejection.
      void record.cleanup.catch(() => undefined);
    }
    return record.cleanup;
  };

  const bounded = (task) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(failure()), drainTimeoutMs);
    task.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });

  return {
    play(operations) {
      // Releasing the media fence does not forgive an unfinished old sound.
      if (fence || [...records].some((record) => record.retired)) return Promise.resolve(null);
      let sound;
      try { sound = operations.create(); }
      catch (error) { return Promise.reject(error); }
      const record = { sound, operations, retired: false, loadIssued: false, cleanup: null, startup: null };
      records.add(record);
      bySound.set(sound, record);
      const check = () => { if (record.retired || fence) throw RETIRED; };
      const step = async (operation) => {
        check();
        const value = await operation();
        check();
        return value;
      };
      let startError;
      // Install the record and startup promise before any asynchronous mode or
      // load work. A claim in this turn can retire it before native work begins.
      record.startup = Promise.resolve().then(async () => {
        try {
          await step(() => operations.configure());
          await step(() => {
            record.loadIssued = true;
            return operations.load(sound);
          });
          await step(() => operations.setVolume(sound));
          await step(() => operations.play(sound));
          const started = await step(() => operations.verify(sound, check));
          if (!started) throw new Error("Chi'lly Chat call sound did not start.");
        } catch (error) {
          record.retired = true;
          if (error !== RETIRED) startError = error;
        }
      });
      return record.startup.then(async () => {
        if (record.retired) {
          await dispose(record);
          if (startError) throw startError;
          return null;
        }
        return sound;
      });
    },

    async stop(sound) {
      const record = sound && bySound.get(sound);
      if (!record) return false;
      await dispose(record);
      return true;
    },

    claim(owner, isCurrent) {
      if (!owner || typeof owner !== "object" || typeof isCurrent !== "function"
        || releasedOwners.has(owner) || !current(isCurrent)) {
        return Promise.reject(new Error("This call no longer owns its audio handoff."));
      }
      if (fence?.owner !== owner) {
        if (fence && current(fence.isCurrent)) {
          return Promise.reject(new Error("Another call owns the audio handoff."));
        }
        if (fence) releasedOwners.add(fence.owner);
        // Synchronous: all shared helper callers are fenced before any await.
        fence = { owner, isCurrent, task: null };
      }
      const claimed = fence;
      if (claimed.task) return claimed.task;
      const pending = [...records];
      pending.forEach((record) => { record.retired = true; });
      const task = bounded(Promise.all(pending.map(dispose))).then(() => {
        if (fence !== claimed || !current(claimed.isCurrent)) {
          throw new Error("This call no longer owns its audio handoff.");
        }
      });
      claimed.task = task;
      void task.catch(() => {
        // Retry can observe a late successful disposal. It cannot repeat or
        // forgive an unload failure, whose original promise stays on its record.
        if (claimed.task === task) claimed.task = null;
      });
      return task;
    },

    release(owner) {
      if (fence?.owner !== owner) return;
      releasedOwners.add(owner);
      fence = null;
    },
  };
}
