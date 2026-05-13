import { RoomServiceClient } from "livekit-server-sdk";
import type { OpsConfig } from "./config.js";

export type LiveKitAdminOptions = {
  dryRun: boolean;
};

function normalizeLiveKitUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  } else if (url.protocol === "ws:") {
    url.protocol = "http:";
  }

  return url.toString().replace(/\/$/, "");
}

function createClient(config: OpsConfig): RoomServiceClient {
  if (!config.livekitApiUrl || !config.livekitApiKey || !config.livekitApiSecret) {
    throw new Error("livekit_config_missing");
  }

  return new RoomServiceClient(
    normalizeLiveKitUrl(config.livekitApiUrl),
    config.livekitApiKey,
    config.livekitApiSecret
  );
}

export async function deleteRoom(
  config: OpsConfig,
  room: string,
  opts: LiveKitAdminOptions
): Promise<Record<string, unknown>> {
  if (opts.dryRun) {
    return { dryRun: true, action: "deleteRoom", room };
  }

  const client = createClient(config);
  await client.deleteRoom(room);
  return { dryRun: false, action: "deleteRoom", room };
}

export async function removeParticipant(
  config: OpsConfig,
  room: string,
  identity: string,
  opts: LiveKitAdminOptions
): Promise<Record<string, unknown>> {
  if (opts.dryRun) {
    return { dryRun: true, action: "removeParticipant", room, identity };
  }

  const client = createClient(config);
  await client.removeParticipant(room, identity);
  return { dryRun: false, action: "removeParticipant", room, identity };
}
