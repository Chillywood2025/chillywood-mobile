import { resolveChatCallMediaTransportGates } from "../../../_lib/chatCallMediaProviderPolicy.ts";

const assertGate = (
  label: string,
  input: Parameters<typeof resolveChatCallMediaTransportGates>[0],
  expected: ReturnType<typeof resolveChatCallMediaTransportGates>,
) => {
  Deno.test(label, () => {
    const actual = resolveChatCallMediaTransportGates(input);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    if (actual.legacyTransportActive && actual.liveKitTransportActive) {
      throw new Error(`${label}: both transports became active`);
    }
  });
};

assertGate(
  "media is disabled before the accepted product lifecycle enables it",
  { enabled: false, inviteId: "invite-1", mediaProvider: "livekit" },
  { legacyTransportActive: false, liveKitTransportActive: false },
);

assertGate(
  "LiveKit invite enables only LiveKit media",
  { enabled: true, inviteId: "invite-1", mediaProvider: "livekit" },
  { legacyTransportActive: false, liveKitTransportActive: true },
);

assertGate(
  "legacy rollback invite enables only direct WebRTC media",
  { enabled: true, inviteId: "invite-1", mediaProvider: "legacy_webrtc" },
  { legacyTransportActive: true, liveKitTransportActive: false },
);

assertGate(
  "missing durable invite enables neither transport",
  { enabled: true, inviteId: "", mediaProvider: "livekit" },
  { legacyTransportActive: false, liveKitTransportActive: false },
);
