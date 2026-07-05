import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2";
import { writeLiveKitRoutingAudit } from "../_shared/livekit-routing.ts";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-livekit-heartbeat-monitor-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const DEFAULT_SERVER_ID = "chillywood-prod-01";
const DEFAULT_TIMEOUT_MS = 4_000;

const toText = (value: unknown) => String(value ?? "").trim();

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const safeLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9_.:-]/g, "-").slice(0, 80);

const redact = (value: unknown) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{64,}/g, "[redacted]");

const deriveApiUrl = (publicWsUrl: string, internalApiUrl?: string | null) => {
  const configured = toText(internalApiUrl) || toText(Deno.env.get("LIVEKIT_API_URL"));
  if (configured) return configured;
  if (publicWsUrl.startsWith("wss://")) return `https://${publicWsUrl.slice("wss://".length)}`;
  if (publicWsUrl.startsWith("ws://")) return `http://${publicWsUrl.slice("ws://".length)}`;
  return publicWsUrl;
};

const deriveRtcProbeUrl = (publicWsUrl: string) => {
  if (publicWsUrl.startsWith("wss://")) return `https://${publicWsUrl.slice("wss://".length).replace(/\/$/, "")}/rtc`;
  if (publicWsUrl.startsWith("ws://")) return `http://${publicWsUrl.slice("ws://".length).replace(/\/$/, "")}/rtc`;
  return `${publicWsUrl.replace(/\/$/, "")}/rtc`;
};

const withTimeout = (timeoutMs: number) => AbortSignal.timeout(Math.max(1_000, timeoutMs));

const checkHttpReachable = async (url: string, timeoutMs: number) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: withTimeout(timeoutMs),
    });
    return {
      ok: response.status < 500,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? safeLabel(error.name || error.message) : "fetch_failed",
      ok: false,
      status: 0,
    };
  }
};

const countLiveKitState = async (
  roomService: RoomServiceClient,
) => {
  const rooms = await roomService.listRooms();
  let currentParticipants = 0;
  let currentPublishers = 0;

  for (const room of rooms) {
    const roomName = toText((room as { name?: unknown }).name);
    if (!roomName) continue;

    const participants = await roomService.listParticipants(roomName);
    currentParticipants += participants.length;
    currentPublishers += participants.filter((participant) => {
      const tracks = Array.isArray((participant as { tracks?: unknown }).tracks)
        ? (participant as { tracks: unknown[] }).tracks
        : [];
      return tracks.length > 0;
    }).length;
  }

  return {
    currentParticipants,
    currentPublishers,
    currentRooms: rooms.length,
  };
};

const recordHealthCheckedHeartbeat = async (
  adminClient: SupabaseClientLike,
  input: {
    apiUrl: string;
    counts: {
      currentParticipants: number;
      currentPublishers: number;
      currentRooms: number;
    };
    serverRow: JsonObject;
    source: string;
  },
) => {
  const nowIso = new Date().toISOString();
  const serverRowId = toText(input.serverRow.id);
  const serverId = toText(input.serverRow.server_id);
  const metricsSource = safeLabel(input.source || "livekit-heartbeat-monitor");

  const heartbeat = {
    active_participants: input.counts.currentParticipants,
    active_publishers: input.counts.currentPublishers,
    active_rooms: input.counts.currentRooms,
    bandwidth_in_mbps: null,
    bandwidth_out_mbps: null,
    cpu_percent: toNumber(input.serverRow.cpu_percent),
    disconnect_rate: null,
    disk_usage_percent: toNumber(input.serverRow.disk_usage_percent),
    heartbeat_at: nowIso,
    livekit_node_status: "healthy",
    memory_total_mb: toNumber(input.serverRow.memory_total_mb),
    memory_used_mb: toNumber(input.serverRow.memory_used_mb),
    metrics_collected_at: nowIso,
    metrics_source: metricsSource,
    network_rx_bps: toNumber(input.serverRow.network_rx_bps),
    network_tx_bps: toNumber(input.serverRow.network_tx_bps),
    packet_loss_percent: null,
    ram_percent: toNumber(input.serverRow.ram_percent),
    server_id: serverRowId,
    turn_status: toText(input.serverRow.turn_status) || "proof_pending",
  };

  const insert = await adminClient
    .from("livekit_server_heartbeats")
    .insert(heartbeat);

  if (insert.error) throw new Error(`LiveKit monitor heartbeat insert failed: ${insert.error.message}`);

  const update = await adminClient
    .from("livekit_servers")
    .update({
      current_participants: heartbeat.active_participants,
      current_publishers: heartbeat.active_publishers,
      current_rooms: heartbeat.active_rooms,
      last_heartbeat_at: nowIso,
      livekit_node_status: heartbeat.livekit_node_status,
      metrics_collected_at: heartbeat.metrics_collected_at,
      metrics_source: heartbeat.metrics_source,
      turn_status: heartbeat.turn_status,
    })
    .eq("id", serverRowId)
    .select("id,server_id,status,public_ws_url,last_heartbeat_at,current_rooms,current_participants,current_publishers,max_rooms,max_participants,max_publishers,metrics_source")
    .maybeSingle();

  if (update.error || !update.data) {
    throw new Error(`LiveKit monitor heartbeat update failed: ${update.error?.message ?? "missing row"}`);
  }

  await writeLiveKitRoutingAudit(adminClient, {
    eventType: "heartbeat_received",
    metadata: {
      active_participants: heartbeat.active_participants,
      active_publishers: heartbeat.active_publishers,
      active_rooms: heartbeat.active_rooms,
      health_checked: true,
      metrics_source: heartbeat.metrics_source,
    },
    reason: `health_checked_heartbeat:${serverId}`,
    serverRowId,
  });

  return update.data as JsonObject;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for LiveKit heartbeat monitoring." });

  try {
    const monitorSecret = readRequiredEnv("LIVEKIT_HEARTBEAT_MONITOR_SECRET");
    if (toText(req.headers.get("X-LiveKit-Heartbeat-Monitor-Token")) !== monitorSecret) {
      return jsonResponse(401, { error: "missing_monitor_authorization", message: "LiveKit heartbeat monitor authorization is required." });
    }

    const payload = await req.json().catch(() => ({})) as JsonObject;
    const serverId = toText(payload.server_id ?? payload.serverId) || DEFAULT_SERVER_ID;
    const timeoutMs = toPositiveInteger(payload.timeout_ms ?? payload.timeoutMs, DEFAULT_TIMEOUT_MS);
    const source = safeLabel(toText(payload.source) || "livekit-heartbeat-monitor");

    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const livekitApiKey = readRequiredEnv("LIVEKIT_API_KEY");
    const livekitApiSecret = readRequiredEnv("LIVEKIT_API_SECRET");

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const serverQuery = await adminClient
      .from("livekit_servers")
      .select("*")
      .eq("server_id", serverId)
      .maybeSingle();

    if (serverQuery.error) throw new Error(`LiveKit monitor server lookup failed: ${serverQuery.error.message}`);
    if (!serverQuery.data) return jsonResponse(404, { error: "server_not_found", message: "The requested LiveKit server is not registered." });

    const serverRow = serverQuery.data as JsonObject;
    const publicWsUrl = toText(serverRow.public_ws_url);
    if (!/^wss:\/\/\S+$/i.test(publicWsUrl) && !/^ws:\/\/(localhost|127[.]0[.]0[.]1)(:\d+)?(\/.*)?$/i.test(publicWsUrl)) {
      return jsonResponse(503, { error: "invalid_public_ws_url", message: "LiveKit server public WebSocket URL is invalid." });
    }

    const apiUrl = deriveApiUrl(publicWsUrl, toText(serverRow.internal_api_url) || null);
    const rootProbe = await checkHttpReachable(apiUrl, timeoutMs);
    const rtcProbe = await checkHttpReachable(deriveRtcProbeUrl(publicWsUrl), timeoutMs);
    if (!rootProbe.ok || !rtcProbe.ok) {
      await writeLiveKitRoutingAudit(adminClient, {
        eventType: "heartbeat_failed",
        metadata: {
          root_status: rootProbe.status,
          rtc_status: rtcProbe.status,
          source,
        },
        reason: "public_endpoint_unreachable",
        serverRowId: toText(serverRow.id),
      });

      return jsonResponse(503, {
        error: "livekit_public_endpoint_unreachable",
        message: "LiveKit public endpoint health check failed; heartbeat was not updated.",
        probe: {
          rootStatus: rootProbe.status,
          rtcStatus: rtcProbe.status,
        },
      });
    }

    const roomService = new RoomServiceClient(apiUrl, livekitApiKey, livekitApiSecret);
    const counts = await countLiveKitState(roomService);
    const updatedServer = await recordHealthCheckedHeartbeat(adminClient, {
      apiUrl,
      counts,
      serverRow,
      source,
    });

    return jsonResponse(200, {
      ok: true,
      server: {
        currentParticipants: Number(updatedServer.current_participants ?? 0),
        currentPublishers: Number(updatedServer.current_publishers ?? 0),
        currentRooms: Number(updatedServer.current_rooms ?? 0),
        lastHeartbeatAt: toText(updatedServer.last_heartbeat_at),
        metricsSource: toText(updatedServer.metrics_source),
        publicWsUrl,
        serverId,
        status: toText(updatedServer.status),
      },
    });
  } catch (error) {
    console.error("livekit-heartbeat-monitor failure", redact(error instanceof Error ? error.message : String(error)));
    return jsonResponse(500, {
      error: "livekit_heartbeat_monitor_failed",
      message: "The health-checked LiveKit heartbeat could not complete.",
    });
  }
});
