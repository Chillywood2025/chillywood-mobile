import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import {
  createOwnedAudioSession,
  retryRetiredAndroidAudioSessions,
  type OwnedAudioRoute,
  type OwnedAudioSession,
} from "../_lib/livekit/ownedAudioSession";

type Owner = { key: string; lease: OwnedAudioSession; retired: boolean };
const ROUTE_UNAVAILABLE = "Audio output controls are unavailable. The call remains connected.";

export function useLegacyAndroidAudioRoute({ active, identity, video }: {
  active: boolean; identity: string; video: boolean;
}) {
  const enabled = Platform.OS === "android" && active && !!identity;
  const ownerRef = useRef<Owner | null>(null);
  // Each committed lifecycle captures its own holder. A callback retained by
  // an old render must never stop the current ref's replacement owner.
  const binding = useMemo(() => ({ owner: null as Owner | null, enabled, identity, video }), [enabled, identity, video]);
  const [receipt, setReceipt] = useState<OwnedAudioRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const owns = useCallback((owner: Owner) => (
    !owner.retired && ownerRef.current === owner && owner.key === identity && enabled
  ), [enabled, identity]);
  const retire = useCallback((owner: Owner) => {
    owner.retired = true;
    return owner.lease.stop();
  }, []);

  useLayoutEffect(() => {
    const previous = ownerRef.current;
    if (previous && (!enabled || previous.key !== identity)) {
      previous.retired = true;
      ownerRef.current = null;
      void previous.lease.stop().catch(() => undefined);
    }
  }, [enabled, identity]);

  useEffect(() => {
    setReceipt(null);
    setError(null);
    setManualError(null);
    if (!binding.enabled) return;
    const owner: Owner = {
      key: binding.identity, lease: createOwnedAudioSession(binding.video ? "speaker" : "earpiece"), retired: false,
    };
    ownerRef.current = owner;
    binding.owner = owner;
    const routeSubscription = owner.lease.observe((next) => {
      if (owns(owner)) { setReceipt(next); setError(null); }
    }, () => {
      if (owns(owner)) { setReceipt(null); setError(ROUTE_UNAVAILABLE); }
    });
    void owner.lease.start().then(() => owner.lease.readRoute()).then((next) => {
      if (!owns(owner)) return;
      setReceipt(next);
      if (!next.supported) setError(ROUTE_UNAVAILABLE);
    }).catch(() => {
      if (owns(owner)) setError(ROUTE_UNAVAILABLE);
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !owns(owner)) return;
      void owner.lease.readRoute().then((next) => {
        if (owns(owner)) { setReceipt(next); setError(null); }
      }).catch(() => { if (owns(owner)) { setReceipt(null); setError(ROUTE_UNAVAILABLE); } });
    });
    return () => {
      owner.retired = true;
      if (ownerRef.current === owner) ownerRef.current = null;
      subscription.remove();
      routeSubscription.remove();
      void owner.lease.stop().catch(() => undefined);
    };
  }, [binding, enabled, identity, owns, video]);

  const setSpeaker = useCallback(async (speaker: boolean) => {
    const owner = ownerRef.current;
    if (!owner || !owns(owner)) return false;
    try {
      const next = await owner.lease.select(speaker ? "speaker" : "earpiece");
      if (!owns(owner)) return false;
      setReceipt(next);
      setError(null);
      setManualError(null);
      return true;
    } catch {
      if (owns(owner)) setManualError("The audio output could not be changed. The call remains connected.");
      return false;
    }
  }, [owns]);

  const stop = useCallback(async () => {
    const owner = binding.owner;
    if (owner) await retire(owner);
    await retryRetiredAndroidAudioSessions();
  }, [binding, retire]);

  const confirmed = enabled && ownerRef.current && !ownerRef.current.retired
    && receipt?.owner === ownerRef.current.lease.owner ? receipt : null;
  return {
    setSpeaker,
    stop,
    // This is a two-way toggle, so never label a default/headset fallback as
    // a receiver on hardware where no earpiece is actually available.
    canSetSpeaker: !!confirmed?.supported
      && confirmed.available.includes("speaker") && confirmed.available.includes("earpiece"),
    speakerEnabled: confirmed?.selected === "speaker",
    error: manualError ?? error,
  };
}
