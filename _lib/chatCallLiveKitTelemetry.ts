import {
  emitLiveKitRenderTelemetryEvent,
  type ChatCallLiveKitTelemetryStage,
} from "./livekit/livekitRenderTelemetry";

export type ChatCallLiveKitTelemetryBinding = {
  callInviteId: string;
  communicationRoomId: string;
  threadId: string;
};

export const emitChatCallLiveKitStage = (
  stage: ChatCallLiveKitTelemetryStage,
  binding: ChatCallLiveKitTelemetryBinding,
  options: {
    connectionState?: string | null;
    durationMs?: number | null;
    shouldRenderSurface?: boolean;
  } = {},
) => {
  const callInviteId = String(binding.callInviteId ?? "").trim();
  const communicationRoomId = String(binding.communicationRoomId ?? "").trim();
  const threadId = String(binding.threadId ?? "").trim();
  if (!callInviteId || !communicationRoomId || !threadId) return null;

  return emitLiveKitRenderTelemetryEvent("livekit_chat_call_stage", {
    activeContractPresent: true,
    callInviteId,
    canPublish: true,
    communicationRoomId,
    connectionState: options.connectionState ?? null,
    durationMs: options.durationMs ?? null,
    hasRenderableContract: true,
    liveKitSdkEvent: true,
    mediaProvider: "livekit",
    participantRole: "speaker",
    renderableContractPresent: true,
    roomType: "chat_call",
    route: "chat-call",
    shouldRenderSurface: options.shouldRenderSurface ?? true,
    stage,
    surface: "chat_call",
    threadId,
  });
};
