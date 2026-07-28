export type ChatCallMediaProvider = "legacy_webrtc" | "livekit";

export type ChatCallMediaTransportGates = {
  legacyTransportActive: boolean;
  liveKitTransportActive: boolean;
};

export const resolveChatCallMediaTransportGates = (input: {
  enabled: boolean;
  inviteId: string;
  mediaProvider: ChatCallMediaProvider;
}): ChatCallMediaTransportGates => {
  const callMayStartMedia = input.enabled && !!String(input.inviteId ?? "").trim();
  return {
    legacyTransportActive: callMayStartMedia && input.mediaProvider === "legacy_webrtc",
    liveKitTransportActive: callMayStartMedia && input.mediaProvider === "livekit",
  };
};
