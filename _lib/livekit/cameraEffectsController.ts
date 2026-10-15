import type {
  CameraEffect, CameraEffectsCapabilities, CameraEffectsModule, CameraEffectStatus,
} from "../../modules/chillywood-camera-effects";

export type CameraEffectsTrack = {
  id: string;
  kind: string;
  remote?: boolean;
  enabled: boolean;
  readyState: string;
  _setVideoEffects?: (names: string[] | null) => void;
  getSettings?: () => MediaTrackSettings;
};
export type CameraSwitchBinding = {
  available: () => boolean;
  ownsTrack: (track: CameraEffectsTrack | null) => boolean;
  switchCamera: (facingMode: "user" | "environment", isCurrent: () => boolean) => Promise<CameraEffectsTrack | null>;
  cancel: () => void;
  unavailableReason?: () => string | undefined;
};
export type CameraEffectsSnapshot = CameraEffectStatus & {
  effect: CameraEffect;
  intensity: number;
  capabilities: CameraEffectsCapabilities;
  canSwitchCamera: boolean;
  switchingCamera: boolean;
  facingMode: string | null;
  cameraSwitchReason?: string;
};

export const CAMERA_EFFECTS_UNAVAILABLE: CameraEffectsCapabilities = {
  studioLighting: false, chicagoSkyline: false, depthMode: "subject-parallax",
  reason: "This installed build does not include live camera effects.",
};

export function cameraEffectsInternalBuild(platform: string, channel: unknown, runtime: unknown): boolean {
  if (platform !== "android" && platform !== "ios") return false;
  const config = runtime as { otaGeneration?: { internalOnly?: unknown; channel?: unknown } } | null;
  const expected = `${platform}-internal-v2`;
  // Check the actual native Updates channel as well as the update's declared lane.
  return channel === expected && config?.otaGeneration?.internalOnly === true
    && config.otaGeneration.channel === expected;
}

export function normalizeCameraEffect(value: string): CameraEffect {
  return value === "studio-light" || value === "chicago-skyline" || value === "crimson-aura"
    || value === "neon-edge" || value === "spotlight" ? value : "off";
}

export function cameraEffectIsSupported(effect: CameraEffect, capabilities: CameraEffectsCapabilities): boolean {
  return effect === "off" || ({ "studio-light": capabilities.studioLighting, "chicago-skyline": capabilities.chicagoSkyline,
    "crimson-aura": capabilities.crimsonAura, "neon-edge": capabilities.neonEdge, spotlight: capabilities.spotlight })[effect] === true;
}

export const normalizeEffectIntensity = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5
);

const NATIVE_REASON_COPY: Record<string, string> = {
  app_in_background: "Effects are paused while the app is in the background.",
  invalid_configuration: "This effect could not be configured. Choose Off and try again.",
  vision_or_gpu_unavailable: "This device does not support the required camera processing.",
  webrtc_not_ready: "The live camera is not ready yet.",
  device_under_pressure: "Effects are paused to keep your device and live video running smoothly.",
  face_not_found: "Move your face into view. Natural camera is continuing.",
  person_not_found: "Move into view. Natural camera is continuing.",
  person_mask_unavailable: "Finding the subject. Natural camera is continuing.",
  frame_processing_failed: "The effect paused after a processing error. Natural camera is continuing.",
  vision_processing_failed: "Subject detection is unavailable. Natural camera is continuing.",
  vision_request_failed: "Subject detection is unavailable. Natural camera is continuing.",
  inference_budget_exceeded: "Subject detection is too slow right now. Natural camera is continuing.",
  render_budget_exceeded: "The effect is paused to preserve live video performance.",
  output_buffers_busy: "The effect is paused while video processing catches up.",
  skyline_resources_unavailable: "The skyline could not be prepared. Natural camera is continuing.",
  unsupported_frame_buffer: "This camera format does not support live effects.",
  unsupported_frame_layout: "This camera layout does not support live effects.",
  waiting_for_camera_frames: "Waiting for fresh camera frames.",
  waiting_for_fresh_subject: "Finding your face or subject. Natural camera is continuing.",
};

export const cameraEffectReasonCopy = (reason?: string): string | undefined => (
  reason ? NATIVE_REASON_COPY[reason] ?? (/^[a-z_]+$/.test(reason)
    ? "This effect is temporarily unavailable. Natural camera is continuing." : reason) : undefined
);

/** Owns only an existing, authorized local camera. It never captures or publishes. */
export class CameraEffectsController {
  private track: CameraEffectsTrack | null = null;
  private attached: CameraEffectsTrack | null = null;
  private effect: CameraEffect = "off";
  private intensity = 0.5;
  private allowed = false;
  private disposed = false;
  private switching = false;
  private generation = 0;
  private failure: string | null = null;
  private switchBinding: CameraSwitchBinding | null = null;
  readonly capabilities: CameraEffectsCapabilities;

  constructor(private readonly native: CameraEffectsModule | null, private readonly internalBuild: boolean,
    private readonly platform: string = "android") {
    try {
      const capabilities = internalBuild && native ? native.capabilities() : {
        ...CAMERA_EFFECTS_UNAVAILABLE,
        reason: internalBuild ? CAMERA_EFFECTS_UNAVAILABLE.reason : "Live effects are limited to internal test builds.",
      };
      this.capabilities = { ...capabilities, reason: cameraEffectReasonCopy(capabilities.reason) };
    } catch {
      this.capabilities = { ...CAMERA_EFFECTS_UNAVAILABLE };
    }
  }

  private usable(track = this.track): track is CameraEffectsTrack {
    return !this.disposed && this.allowed && !!track && track.kind === "video"
      && track.remote !== true && track.enabled && track.readyState === "live";
  }

  private detach() {
    const attached = this.attached;
    this.attached = null;
    if (!attached) return;
    // Native release invalidates queued inference before the asynchronous WebRTC detach.
    try { this.native?.release(attached.id); } catch { /* Detach still restores natural camera. */ }
    // Null removes Android's processor instead of keeping an empty chain. The
    // pinned empty-chain ownership bug is additionally patched for stale bridge
    // lookups that race provider removal. iOS declares a
    // nonnull array and its empty chain correctly forwards the original frame.
    try { attached._setVideoEffects?.(this.platform === "android" ? null : []); }
    catch { /* An already-ended track needs no restart. */ }
  }

  bind(track: CameraEffectsTrack | null, allowed: boolean, switchBinding: CameraSwitchBinding | null = null) {
    // The owned switch intentionally ends the old raw camera before acquisition.
    // Polling its ended track or its own pending replacement is not revocation.
    if (this.switching && allowed && switchBinding === this.switchBinding && switchBinding?.ownsTrack(track)) return;
    const next = allowed && track?.enabled && track.readyState === "live" && track.remote !== true ? track : null;
    if (next !== this.track || this.allowed !== allowed || switchBinding !== this.switchBinding) {
      this.generation += 1;
      this.switchBinding?.cancel();
      this.switching = false;
      this.detach();
      this.track = next;
      this.allowed = allowed;
      this.switchBinding = switchBinding;
      this.failure = null;
      this.apply();
    }
  }

  select(effect: string, intensity = this.intensity) {
    const next = normalizeCameraEffect(effect);
    const nextIntensity = normalizeEffectIntensity(intensity);
    if (next === this.effect && nextIntensity === this.intensity && !this.failure) return;
    this.effect = next;
    this.intensity = nextIntensity;
    this.failure = null;
    this.apply();
  }

  private apply() {
    const track = this.track;
    if (!this.usable(track) || this.switching || this.effect === "off" || this.intensity === 0) {
      this.detach();
      return;
    }
    const supported = cameraEffectIsSupported(this.effect, this.capabilities);
    if (!supported || !this.native || !track._setVideoEffects) {
      this.detach();
      return;
    }
    try {
      // Set before configure so partial registration is also cleaned up on failure.
      this.attached = track;
      const { processorName } = this.native.configure(track.id, this.effect, this.intensity);
      if (!processorName) throw new Error("Native processor registration failed.");
      track._setVideoEffects([processorName]);
    } catch {
      this.failure = "The camera effect could not start. Your natural camera is still on.";
      this.detach();
    }
  }

  snapshot(): CameraEffectsSnapshot {
    const track = this.track;
    const usable = this.usable(track);
    let status: CameraEffectStatus = { state: "off", processedFrames: 0 };
    if (this.failure) status = { state: "error", processedFrames: 0, reason: this.failure };
    else if (this.effect !== "off" && this.intensity > 0) {
      if (!usable) status = { state: "unavailable", processedFrames: 0, reason: "Start your authorized camera to use live effects." };
      else if (!this.attached) status = { state: "unavailable", processedFrames: 0, reason: this.capabilities.reason ?? "This effect is unavailable on this device." };
      else {
        try { status = this.native?.status(this.attached.id) ?? status; }
        catch { status = { state: "error", processedFrames: 0, reason: "Effect status is unavailable. Natural camera restored." }; this.detach(); }
        // A registered processor is not proof that any frame has been processed.
        if (status.state === "active" && !(status.processedFrames > 0)) status = { ...status, state: "starting" };
      }
    }
    return { ...status, reason: cameraEffectReasonCopy(status.reason), effect: this.effect, intensity: this.intensity, capabilities: this.capabilities,
      canSwitchCamera: this.internalBuild && usable && this.switchBinding?.available() === true,
      cameraSwitchReason: this.switchBinding?.unavailableReason?.(),
      switchingCamera: this.switching, facingMode: usable ? track.getSettings?.().facingMode ?? null : null };
  }

  async switchCamera(): Promise<boolean> {
    const track = this.track;
    const binding = this.switchBinding;
    if (!this.internalBuild || !this.usable(track) || !binding?.available() || this.switching) return false;
    const generation = this.generation;
    const previousFacing = track.getSettings?.().facingMode;
    const facingMode = previousFacing === "environment" ? "user" : "environment";
    this.switching = true;
    this.failure = null;
    this.detach(); // Old-camera masks must never be reused on the new camera.
    try {
      const isCurrent = () => generation === this.generation && this.switchBinding === binding && this.allowed && !this.disposed;
      const replacement = await binding.switchCamera(facingMode, isCurrent);
      if (!isCurrent()) return false;
      if (!replacement || replacement.getSettings?.().facingMode !== facingMode) {
        this.failure = "Camera switch failed. Turn the camera off and on to try again.";
        return false;
      }
      this.track = replacement;
      return true;
    } catch {
      if (generation === this.generation) this.failure = "Could not confirm the camera switch. Check your preview before continuing.";
      return false;
    } finally {
      if (generation === this.generation && this.switchBinding === binding) {
        this.switching = false;
        this.apply();
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.allowed = false;
    this.generation += 1;
    this.switchBinding?.cancel();
    this.switchBinding = null;
    this.detach();
    this.track = null;
  }
}
