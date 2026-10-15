import { TrackEvent, type LocalVideoTrack } from "livekit-client";
import { reserveCommunicationCapture, retryRetiredCommunicationCaptures } from "../communicationCaptureRetirement";
import type { createCommunicationMediaStream } from "../communication";
import type { CameraEffectsTrack, CameraSwitchBinding } from "./cameraEffectsController";

type Operation = {
  old: MediaStreamTrack;
  next: MediaStreamTrack | null;
  reservation: ReturnType<typeof reserveCommunicationCapture>;
  cleanup?: Promise<void>;
};

/** One video-only replacement on the existing published LiveKit owner. */
export class OwnedLiveCameraSwitch implements CameraSwitchBinding {
  private operation: Operation | null = null;
  private failure: string | undefined;

  constructor(private readonly owner: LocalVideoTrack,
    private readonly capture: (facingMode: "user" | "environment", settings: MediaTrackSettings) => ReturnType<typeof createCommunicationMediaStream>,
    private readonly isOwnerCurrent: () => boolean,
    // Capture authority can disappear temporarily during signal reconnect or
    // backgrounding without replacing this publication. Cleanup must still
    // reflect that its owned source was stopped, but never affect a successor.
    private readonly isOwnerRetained: () => boolean = isOwnerCurrent) {}

  available() {
    // Primary simulcast encodings share one sender and are supported. Additional
    // backup-codec tracks have independent capture owners; do not partially flip.
    return this.isOwnerCurrent() && !!this.owner.sender && this.owner.sender.transport?.state !== "closed"
      && !this.owner.isUpstreamPaused && this.owner.simulcastCodecs.size === 0 && !this.operation;
  }

  unavailableReason() {
    if (this.failure && (this.owner.isMuted || this.owner.mediaStreamTrack.readyState !== "live")) return this.failure;
    return this.owner.simulcastCodecs.size > 0
      ? "Camera switching is unavailable while additional video codecs are publishing." : undefined;
  }

  ownsTrack(track: CameraEffectsTrack | null) {
    return !!this.operation && (track === this.operation.old || track === this.operation.next);
  }

  cancel() {
    // A not-yet-resolved native acquisition remains recorded; received() stops
    // it later even if the hook and room owner have already disappeared.
    if (this.operation) void this.retire(this.operation);
  }

  private retire(op: Operation): Promise<void> {
    op.reservation.retire();
    // Start cleanup on cancellation, not after an indefinitely pending native
    // capture. Do it once: a later completion must not re-mute a camera which
    // the user has explicitly restarted after this interruption.
    if (!op.cleanup) op.cleanup = (async () => {
      if (!this.isOwnerRetained()
        || (this.owner.mediaStreamTrack !== op.old && this.owner.mediaStreamTrack !== op.next)) return;
      this.failure = "Camera switch interrupted. Turn the camera off and on to try again.";
      await this.owner.mute().catch(() => undefined);
    })();
    return op.cleanup;
  }

  async switchCamera(facingMode: "user" | "environment", isCurrent: () => boolean): Promise<CameraEffectsTrack | null> {
    if (!this.available() || !isCurrent() || !retryRetiredCommunicationCaptures()) return null;
    const old = this.owner.mediaStreamTrack;
    const sender = this.owner.sender;
    if (old.kind !== "video" || !old.enabled || old.readyState !== "live" || sender?.track !== old) return null;
    const op: Operation = { old, next: null, reservation: reserveCommunicationCapture(this) };
    this.failure = undefined;
    this.operation = op;
    let captureResolved = false;
    const current = () => this.operation === op && isCurrent() && this.isOwnerCurrent()
      && (this.owner.mediaStreamTrack === old || this.owner.mediaStreamTrack === op.next)
      && this.owner.sender === sender && (sender.track === old || sender.track === op.next)
      && !this.owner.isUpstreamPaused && sender.transport?.state !== "closed" && this.owner.simulcastCodecs.size === 0;
    try {
      // The pinned capture SDK binds facing at creation. Stop only the old
      // camera before acquiring another; microphone and publication are retained.
      old.enabled = false;
      old.stop();
      if (String(old.readyState) !== "ended") throw new Error("camera-stop-unconfirmed");
      const stream = await this.capture(facingMode, old.getSettings());
      captureResolved = true;
      // LiveKit's public types use DOM tracks; the RN SDK supplies its native
      // implementation of that same capture/sender boundary.
      const tracks = (stream?.getTracks() ?? []) as unknown as MediaStreamTrack[];
      if (!op.reservation.received(tracks) || !current()) throw new Error("camera-owner-retired");
      const next = tracks[0];
      op.next = next ?? null;
      if (tracks.length !== 1 || !next || next.kind !== "video" || next.readyState !== "live"
        || next.getSettings().facingMode !== facingMode) throw new Error("camera-facing-unconfirmed");
      // Keep the acquired camera disabled until the existing sender acknowledges
      // replacement. Cancellation owns this exact raw track during the await.
      next.enabled = false;
      if (!current()) throw new Error("camera-owner-retired");
      await this.owner.replaceTrack(next, { userProvidedTrack: false });
      if (!current() || this.owner.mediaStreamTrack !== next || sender.track !== next
        || next.readyState !== "live" || !next.enabled || !op.reservation.adopt()) {
        throw new Error("camera-replacement-unconfirmed");
      }
      // RN VideoTrack observes this SDK event to refresh its native stream URL.
      this.owner.emit(TrackEvent.Restarted, this.owner);
      return next as CameraEffectsTrack;
    } catch {
      if (!captureResolved) op.reservation.rejected();
      await this.retire(op);
      return null;
    } finally {
      if (this.operation === op) this.operation = null;
    }
  }
}
