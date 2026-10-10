/** Notification-only playback qualification; never access or money authority. */
export function notificationPlaybackRecordId(url, baseUrl) {
  try {
    const value = new URL(url); const base = new URL(baseUrl);
    if (value.protocol !== 'https:' || value.origin !== base.origin) return null;
    return value.pathname.match(/^\/functions\/v1\/spectator-playback\/records\/([0-9a-f-]{36})\/index\.m3u8$/i)?.[1] ?? null;
  } catch { return null; }
}

export function createNotificationViewProgress({ begin, complete, now = Date.now }) {
  let disposed = false; let busy = false; let done = false; let viewId = null;
  let played = 0; let previous = null; let nextAttempt = 0;
  const observe = (status, active = true) => {
    if (disposed || done) return;
    const time = now();
    const playing = active && status?.isLoaded === true && status.isPlaying === true && status.isBuffering !== true;
    const position = Number(status?.positionMillis);
    if (!playing || !Number.isFinite(position)) { previous = null; return; }
    if (previous) {
      const wall = time - previous.time; const progress = position - previous.position;
      // Long gaps, seeks, loops and stationary/buffering frames add no time.
      if (wall > 0 && wall <= 2_500 && progress > 0 && progress <= wall * 2.5 + 250) played += Math.min(wall, progress);
    }
    previous = { time, position };
    if (busy || time < nextAttempt) return;
    if (!viewId || played >= 10_000) {
      busy = true; nextAttempt = time + 5_000;
      void (async () => {
        try {
          if (!viewId) {
            const started = await begin();
            if (disposed) return;
            if (typeof started === 'string' && started) viewId = started;
          } else if (await complete(viewId) === true && !disposed) done = true;
        } catch { /* Optional analytics must not interrupt playback. */ }
        finally { busy = false; }
      })();
    }
  };
  return { observe, pause: () => { previous = null; }, dispose: () => { disposed = true; previous = null; } };
}
