import { TrackEvent, type Track } from "livekit-client";
import { useEffect, useState } from "react";

/** Mirror a front-facing self preview, never a rear-facing or remote camera. */
export function useLocalCameraMirror(track: Track | undefined) {
  const readMirror = () => track?.mediaStreamTrack?.getSettings?.().facingMode !== "environment";
  const [mirror, setMirror] = useState(readMirror);

  useEffect(() => {
    const refresh = () => setMirror(track?.mediaStreamTrack?.getSettings?.().facingMode !== "environment");
    refresh();
    track?.on(TrackEvent.Restarted, refresh);
    // Some SDK/native replacements retain the publication without emitting a
    // React hook update. Read the current track rather than cached settings.
    const timer = track ? setInterval(refresh, 500) : null;
    return () => {
      track?.off(TrackEvent.Restarted, refresh);
      if (timer !== null) clearInterval(timer);
    };
  }, [track]);

  return mirror;
}
