import { getRuntimeLiveKitConfig, isLiveKitRuntimeConfigured } from "../runtimeConfig";
import { supabase } from "../supabase";

import type { LiveKitJoinSurface } from "./token-contract";

type EnforceLiveKitParticipantStateRequest = {
  surface: Extract<LiveKitJoinSurface, "live-stage" | "watch-party-live">;
  roomName: string;
  targetParticipantIdentity: string;
  metadata?: Record<string, boolean | number | string | null | undefined>;
};

const sanitizeMetadata = (value: EnforceLiveKitParticipantStateRequest["metadata"]) => {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => (
      typeof entry === "string"
      || typeof entry === "number"
      || typeof entry === "boolean"
      || entry === null
    )),
  );
};

export async function enforceLiveKitParticipantState(
  request: EnforceLiveKitParticipantStateRequest,
): Promise<boolean> {
  const config = getRuntimeLiveKitConfig();
  const roomName = String(request.roomName ?? "").trim();
  const targetParticipantIdentity = String(request.targetParticipantIdentity ?? "").trim();

  if (!roomName || !targetParticipantIdentity || !isLiveKitRuntimeConfigured()) return false;

  const authSession = await supabase.auth.getSession().catch(() => null);
  const accessToken = String(authSession?.data.session?.access_token ?? "").trim();
  if (!accessToken) return false;

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "enforce-participant-state",
      surface: request.surface,
      roomName,
      targetParticipantIdentity,
      metadata: sanitizeMetadata(request.metadata),
    }),
  }).catch(() => null);

  return !!response?.ok;
}
