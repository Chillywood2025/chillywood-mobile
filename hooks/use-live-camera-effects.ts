import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { ConnectionState, RoomEvent, Track, type LocalVideoTrack, type Room } from "livekit-client";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

import NativeCameraEffects from "../modules/chillywood-camera-effects";
import { createCommunicationMediaStream } from "../_lib/communication";
import { OwnedLiveCameraSwitch } from "../_lib/livekit/ownedCameraSwitch";
import {
  CameraEffectsController, cameraEffectsInternalBuild, type CameraEffectsSnapshot, type CameraEffectsTrack,
} from "../_lib/livekit/cameraEffectsController";

export type LiveCameraEffectsControls = CameraEffectsSnapshot & {
  select: (effect: string, intensity: number) => void;
  switchCamera: () => Promise<boolean>;
};
export type LiveCameraEffectsProps = {
  cameraEffectId?: string;
  cameraEffectIntensity?: number;
  onCameraEffectsControls?: (controls: LiveCameraEffectsControls) => void;
};

/** Mounted by the existing room owner; no secondary camera capture or publisher. */
export function useLiveCameraEffects({
  room, allowed, cameraEffectId = "off", cameraEffectIntensity = 0.5, onCameraEffectsControls,
}: LiveCameraEffectsProps & { room: Room; allowed: boolean }) {
  const current = useRef({ allowed, cameraEffectId, cameraEffectIntensity, onCameraEffectsControls });
  current.current = { allowed, cameraEffectId, cameraEffectIntensity, onCameraEffectsControls };
  const refresh = useRef<(() => void) | null>(null);

  useEffect(() => {
    const runtime = Constants.expoConfig?.extra?.runtime;
    const controller = new CameraEffectsController(NativeCameraEffects,
      cameraEffectsInternalBuild(Platform.OS, Updates.channel, runtime), Platform.OS);
    let lastSnapshot = "";
    let stopped = false;
    let appState = AppState.currentState;
    let switchOwner: LocalVideoTrack | null = null;
    let switchBinding: OwnedLiveCameraSwitch | null = null;
    const authorized = () => {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      return !stopped && current.current.allowed && appState === "active" && room.state === ConnectionState.Connected
        && room.localParticipant.permissions?.canPublish === true && publication?.isMuted === false;
    };
    const notify = () => {
      const snapshot = controller.snapshot();
      // Frame counters are diagnostics, not a reason to rerender the entire player.
      const signature = JSON.stringify({ ...snapshot, processedFrames: snapshot.processedFrames > 0 });
      if (signature === lastSnapshot) return;
      lastSnapshot = signature;
      current.current.onCameraEffectsControls?.({ ...snapshot,
        select: (effect, intensity) => { controller.select(effect, intensity); notify(); },
        switchCamera: async () => {
          const result = controller.switchCamera();
          notify();
          const succeeded = await result;
          if (!stopped) sync();
          return succeeded;
        },
      });
    };
    const sync = () => {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const allowedNow = authorized();
      const owner = publication?.track as LocalVideoTrack | undefined;
      if ((owner ?? null) !== switchOwner) {
        switchBinding?.cancel();
        switchOwner = owner ?? null;
        switchBinding = owner && typeof owner.replaceTrack === "function" ? new OwnedLiveCameraSwitch(owner,
          (facingMode, captureSettings) => createCommunicationMediaStream({ audio: false, video: true, facingMode, captureSettings }),
          () => authorized() && room.localParticipant.getTrackPublication(Track.Source.Camera)?.track === owner) : null;
      }
      const track = publication?.track?.mediaStreamTrack as CameraEffectsTrack | undefined;
      controller.bind(track ?? null, allowedNow, switchBinding);
      controller.select(current.current.cameraEffectId, current.current.cameraEffectIntensity);
      notify();
    };
    refresh.current = sync;
    const events = [RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ConnectionStateChanged,
      RoomEvent.ParticipantPermissionsChanged] as const;
    events.forEach((event) => room.on(event, sync));
    const appStateSubscription = AppState.addEventListener("change", (state) => { appState = state; sync(); });
    // Handles SDK track replacement and native first-frame/fallback acknowledgments.
    const timer = setInterval(sync, 500);
    sync();
    return () => {
      stopped = true;
      refresh.current = null;
      clearInterval(timer);
      appStateSubscription.remove();
      events.forEach((event) => room.off(event, sync));
      controller.dispose();
      notify();
    };
  }, [room]);

  useEffect(() => { refresh.current?.(); }, [allowed, cameraEffectId, cameraEffectIntensity]);
}
