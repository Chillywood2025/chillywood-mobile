export type CameraEffect = "off" | "studio-light" | "chicago-skyline" | "crimson-aura" | "neon-edge" | "spotlight";
export type CameraEffectsCapabilities = {
  studioLighting: boolean;
  chicagoSkyline: boolean;
  crimsonAura?: boolean;
  neonEdge?: boolean;
  spotlight?: boolean;
  depthMode: "subject-parallax";
  reason?: string;
};
export type CameraEffectStatus = {
  state: "off" | "starting" | "active" | "unavailable" | "error";
  processedFrames: number;
  reason?: string;
};
export type CameraEffectsModule = {
  capabilities(): CameraEffectsCapabilities;
  configure(trackId: string, effect: CameraEffect, intensity: number): { processorName: string | null };
  release(trackId: string): void;
  status(trackId: string): CameraEffectStatus;
};
declare const module: CameraEffectsModule | null;
export default module;
