import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  readExactCurrentSessionAuthority,
  readExactPermissionKeys,
  readExactPlatformRole,
} from "../_shared/exact-subject-authority.ts";
import { writeLiveKitRoutingAudit } from "../_shared/livekit-routing.ts";

type JsonObject = Record<string, unknown>;
type AuthenticatedUser = {
  email: string | null;
  id: string;
};
type AuthResult = { error: Response } | { user: AuthenticatedUser };
type SupabaseClientLike = any;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-livekit-registry-heartbeat-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const VALID_PROVIDERS = new Set(["hetzner", "ovh", "local", "other"]);
const VALID_STATUSES = new Set(["active", "disabled", "draining", "maintenance", "offline", "standby"]);
const VALID_LIVEKIT_NODE_STATUSES = new Set(["unknown", "healthy", "degraded", "unavailable", "offline"]);
const VALID_TURN_STATUSES = new Set(["unknown", "configured", "not_configured", "unavailable", "proof_pending"]);

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

const toNonnegativeNumber = (value: unknown): number | null => {
  const parsed = toNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

const toPercent = (value: unknown): number | null => {
  const parsed = toNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
};

const toPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const isRecord = (value: unknown): value is JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

const safeMetadata = (metadata: unknown): JsonObject => {
  if (!isRecord(metadata)) return {};

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => {
        const normalized = key.toLowerCase();
        if (
          normalized.includes("secret")
          || normalized.includes("token")
          || normalized.includes("password")
          || normalized.includes("key")
          || normalized.includes("url")
        ) return false;

        return typeof value === "string"
          || typeof value === "number"
          || typeof value === "boolean"
          || value === null;
      })
      .slice(0, 24),
  );
};

const safeLabel = (value: unknown, options: Set<string>) => {
  const normalized = toText(value).toLowerCase();
  return options.has(normalized) ? normalized : null;
};

const safeMetricsSource = (value: unknown) => {
  const normalized = toText(value).toLowerCase().replace(/[^a-z0-9_.:-]/g, "-").slice(0, 80);
  if (!normalized) return null;
  if (
    normalized.includes("secret")
    || normalized.includes("token")
    || normalized.includes("password")
    || normalized.includes("key")
    || normalized.includes("url")
  ) return null;
  return normalized;
};

const safeIsoTime = (value: unknown, fallback: string) => {
  const raw = toText(value);
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

const authenticateRequest = async (
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<AuthResult> => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: jsonResponse(401, { error: "missing_authorization", message: "Bearer authorization is required." }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId || !(await readExactCurrentSessionAuthority(authClient, userId))) {
    return { error: jsonResponse(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return {
    user: {
      email: data.user?.email ?? null,
      id: userId,
    },
  };
};

const userHasPlatformRole = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
) => {
  return readExactPlatformRole(adminClient, user.id, ["owner", "operator"]);
};

const userHasLiveOpsPermission = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
) => {
  return (await readExactPermissionKeys(adminClient, user.id, ["live_ops"]))
    .has("live_ops");
};

const requireOperator = async (
  req: Request,
  adminClient: SupabaseClientLike,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<AuthResult> => {
  const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
  if ("error" in authResult) return authResult;

  const role = await userHasPlatformRole(adminClient, authResult.user);
  if (role !== "owner" && (role !== "operator" || !(await userHasLiveOpsPermission(adminClient, authResult.user)))) {
    return {
      error: jsonResponse(403, {
        error: "live_ops_permission_required",
        message: "LiveKit registry operations require Owner or an Admin with live_ops permission.",
      }),
    };
  }

  return authResult;
};

const sanitizeServer = (row: JsonObject) => ({
  bandwidthInMbps: toNumber(row.bandwidth_in_mbps),
  bandwidthOutMbps: toNumber(row.bandwidth_out_mbps),
  cpuPercent: toNumber(row.cpu_percent),
  currentParticipants: Number(row.current_participants ?? 0),
  currentPublishers: Number(row.current_publishers ?? 0),
  currentRooms: Number(row.current_rooms ?? 0),
  disconnectRate: toNumber(row.disconnect_rate),
  displayName: toText(row.display_name),
  drainReason: toText(row.drain_reason) || null,
  drainStartedAt: toText(row.drain_started_at) || null,
  diskUsagePercent: toNumber(row.disk_usage_percent),
  id: toText(row.id),
  lastAssignmentAt: toText(row.last_assignment_at) || null,
  lastHeartbeatAt: toText(row.last_heartbeat_at) || null,
  livekitNodeStatus: toText(row.livekit_node_status) || null,
  maxEgressMbps: toNumber(row.max_egress_mbps),
  maxParticipants: Number(row.max_participants ?? 0),
  maxPublishers: toNumber(row.max_publishers),
  maxRooms: Number(row.max_rooms ?? 0),
  memoryTotalMb: toNumber(row.memory_total_mb),
  memoryUsedMb: toNumber(row.memory_used_mb),
  metadata: safeMetadata(row.metadata),
  metricsCollectedAt: toText(row.metrics_collected_at) || null,
  metricsSource: toText(row.metrics_source) || null,
  networkRxBps: toNumber(row.network_rx_bps),
  networkTxBps: toNumber(row.network_tx_bps),
  packetLossPercent: toNumber(row.packet_loss_percent),
  provider: toText(row.provider),
  publicWsUrl: toText(row.public_ws_url),
  ramPercent: toNumber(row.ram_percent),
  region: toText(row.region),
  serverId: toText(row.server_id),
  status: toText(row.status),
  turnStatus: toText(row.turn_status) || null,
  updatedAt: toText(row.updated_at) || null,
  weight: Number(row.weight ?? 0),
});

const sanitizeAssignment = (row: JsonObject) => ({
  appRoomId: toText(row.app_room_id),
  assignedServerId: toText(row.assigned_server_id),
  assignmentReason: toText(row.assignment_reason),
  assignmentStatus: toText(row.assignment_status),
  createdAt: toText(row.created_at) || null,
  endedAt: toText(row.ended_at) || null,
  id: toText(row.id),
  isPubliclyEligible: row.is_publicly_eligible === true,
  livekitRoomName: toText(row.livekit_room_name),
  roomType: toText(row.room_type),
  updatedAt: toText(row.updated_at) || null,
  visibility: toText(row.visibility) || null,
});

const sanitizeAudit = (row: JsonObject) => ({
  appRoomId: toText(row.app_room_id) || null,
  createdAt: toText(row.created_at) || null,
  eventType: toText(row.event_type),
  id: toText(row.id),
  livekitRoomName: toText(row.livekit_room_name) || null,
  metadata: safeMetadata(row.metadata),
  reason: toText(row.reason),
  serverId: toText(row.server_id) || null,
});

const listRegistry = async (adminClient: SupabaseClientLike, payload: JsonObject) => {
  const limit = Math.min(toPositiveInteger(payload.limit, 50), 100);

  const [servers, assignments, audit] = await Promise.all([
    adminClient
      .from("livekit_servers")
      .select("*")
      .order("server_id", { ascending: true }),
    adminClient
      .from("livekit_room_assignments")
      .select("id,app_room_id,livekit_room_name,assigned_server_id,assignment_reason,assignment_status,room_type,visibility,is_publicly_eligible,created_at,updated_at,ended_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    adminClient
      .from("livekit_routing_audit")
      .select("id,event_type,server_id,app_room_id,livekit_room_name,reason,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (servers.error) throw new Error(`LiveKit registry list failed: ${servers.error.message}`);
  if (assignments.error) throw new Error(`LiveKit assignments list failed: ${assignments.error.message}`);
  if (audit.error) throw new Error(`LiveKit routing audit list failed: ${audit.error.message}`);

  return jsonResponse(200, {
    assignments: ((assignments.data ?? []) as JsonObject[]).map(sanitizeAssignment),
    audit: ((audit.data ?? []) as JsonObject[]).map(sanitizeAudit),
    servers: ((servers.data ?? []) as JsonObject[]).map(sanitizeServer),
  });
};

const upsertServer = async (
  adminClient: SupabaseClientLike,
  payload: JsonObject,
  actorUserId: string,
) => {
  const serverId = toText(payload.server_id ?? payload.serverId);
  const provider = toText(payload.provider) || "hetzner";
  const status = toText(payload.status) || "active";
  const publicWsUrl = toText(payload.public_ws_url ?? payload.publicWsUrl);
  const region = toText(payload.region);

  if (!serverId) return jsonResponse(400, { error: "missing_server_id", message: "server_id is required." });
  if (!VALID_PROVIDERS.has(provider)) return jsonResponse(400, { error: "invalid_provider", message: "provider must be hetzner, ovh, local, or other." });
  if (!VALID_STATUSES.has(status)) return jsonResponse(400, { error: "invalid_status", message: "status must be active, draining, offline, maintenance, disabled, or standby." });
  if (!publicWsUrl) return jsonResponse(400, { error: "missing_public_ws_url", message: "public_ws_url is required." });
  if (!region) return jsonResponse(400, { error: "missing_region", message: "region is required and must be operator-provided." });

  const upsert = await adminClient
    .from("livekit_servers")
    .upsert({
      display_name: toText(payload.display_name ?? payload.displayName) || serverId,
      internal_api_url: toText(payload.internal_api_url ?? payload.internalApiUrl) || null,
      max_egress_mbps: toNumber(payload.max_egress_mbps ?? payload.maxEgressMbps),
      max_participants: toPositiveInteger(payload.max_participants ?? payload.maxParticipants, 1000),
      max_publishers: toNumber(payload.max_publishers ?? payload.maxPublishers),
      max_rooms: toPositiveInteger(payload.max_rooms ?? payload.maxRooms, 100),
      metadata: safeMetadata(payload.metadata),
      provider,
      public_ws_url: publicWsUrl,
      region,
      server_id: serverId,
      status,
      weight: toPositiveInteger(payload.weight, 100),
    }, { onConflict: "server_id" })
    .select("*")
    .maybeSingle();

  if (upsert.error || !upsert.data) {
    throw new Error(`LiveKit server upsert failed: ${upsert.error?.message ?? "missing row"}`);
  }

  await writeLiveKitRoutingAudit(adminClient, {
    actorUserId,
    eventType: status === "active" ? "server_activated" : "server_registered",
    metadata: { provider, status },
    reason: `server_upsert:${serverId}`,
    serverRowId: toText((upsert.data as JsonObject).id),
  });

  return jsonResponse(200, { server: sanitizeServer(upsert.data as JsonObject) });
};

const setServerStatus = async (
  adminClient: SupabaseClientLike,
  payload: JsonObject,
  actorUserId: string,
) => {
  const serverId = toText(payload.server_id ?? payload.serverId);
  const status = toText(payload.status);
  const reason = toText(payload.reason) || null;

  if (!serverId) return jsonResponse(400, { error: "missing_server_id", message: "server_id is required." });
  if (!VALID_STATUSES.has(status)) return jsonResponse(400, { error: "invalid_status", message: "status must be active, draining, offline, maintenance, disabled, or standby." });

  const updatePayload: JsonObject = {
    status,
  };
  if (status === "draining") {
    updatePayload.drain_started_at = new Date().toISOString();
    updatePayload.drain_reason = reason;
  }
  if (status === "active") {
    updatePayload.drain_started_at = null;
    updatePayload.drain_reason = null;
  }

  const update = await adminClient
    .from("livekit_servers")
    .update(updatePayload)
    .eq("server_id", serverId)
    .select("*")
    .maybeSingle();

  if (update.error) throw new Error(`LiveKit server status update failed: ${update.error.message}`);
  if (!update.data) return jsonResponse(404, { error: "server_not_found", message: "The requested LiveKit server is not registered." });

  const eventType = status === "active"
    ? "server_activated"
    : status === "draining"
      ? "server_draining"
      : status === "disabled"
        ? "server_disabled"
        : status === "maintenance"
          ? "server_maintenance"
          : status === "offline"
            ? "server_offline"
            : "server_standby";

  await writeLiveKitRoutingAudit(adminClient, {
    actorUserId,
    eventType,
    metadata: { status },
    reason: reason ?? `server_status:${status}`,
    serverRowId: toText((update.data as JsonObject).id),
  });

  return jsonResponse(200, { server: sanitizeServer(update.data as JsonObject) });
};

const heartbeatTokenAllowed = (req: Request) => {
  const configured = readOptionalEnv("LIVEKIT_REGISTRY_HEARTBEAT_SECRET");
  if (!configured) return false;
  return toText(req.headers.get("X-LiveKit-Registry-Heartbeat-Token")) === configured;
};

const recordHeartbeat = async (
  adminClient: SupabaseClientLike,
  payload: JsonObject,
) => {
  const serverId = toText(payload.server_id ?? payload.serverId);
  if (!serverId) return jsonResponse(400, { error: "missing_server_id", message: "server_id is required." });

  const serverQuery = await adminClient
    .from("livekit_servers")
    .select("id,server_id")
    .eq("server_id", serverId)
    .maybeSingle();

  if (serverQuery.error) throw new Error(`LiveKit heartbeat server lookup failed: ${serverQuery.error.message}`);
  if (!serverQuery.data) return jsonResponse(404, { error: "server_not_found", message: "The heartbeat server is not registered." });

  const nowIso = new Date().toISOString();
  const serverRowId = toText((serverQuery.data as JsonObject).id);
  const metricsCollectedAt = safeIsoTime(payload.metrics_collected_at ?? payload.metricsCollectedAt, nowIso);
  const heartbeat = {
    active_participants: Math.max(0, Number(payload.active_participants ?? payload.activeParticipants ?? 0)),
    active_publishers: Math.max(0, Number(payload.active_publishers ?? payload.activePublishers ?? 0)),
    active_rooms: Math.max(0, Number(payload.active_rooms ?? payload.activeRooms ?? 0)),
    bandwidth_in_mbps: toNonnegativeNumber(payload.bandwidth_in_mbps ?? payload.bandwidthInMbps),
    bandwidth_out_mbps: toNonnegativeNumber(payload.bandwidth_out_mbps ?? payload.bandwidthOutMbps),
    cpu_percent: toPercent(payload.cpu_percent ?? payload.cpuPercent),
    disconnect_rate: toNonnegativeNumber(payload.disconnect_rate ?? payload.disconnectRate),
    disk_usage_percent: toPercent(payload.disk_usage_percent ?? payload.diskUsagePercent),
    heartbeat_at: nowIso,
    livekit_node_status: safeLabel(payload.livekit_node_status ?? payload.livekitNodeStatus, VALID_LIVEKIT_NODE_STATUSES),
    memory_total_mb: toNonnegativeNumber(payload.memory_total_mb ?? payload.memoryTotalMb),
    memory_used_mb: toNonnegativeNumber(payload.memory_used_mb ?? payload.memoryUsedMb),
    metrics_collected_at: metricsCollectedAt,
    metrics_source: safeMetricsSource(payload.metrics_source ?? payload.metricsSource),
    network_rx_bps: toNonnegativeNumber(payload.network_rx_bps ?? payload.networkRxBps),
    network_tx_bps: toNonnegativeNumber(payload.network_tx_bps ?? payload.networkTxBps),
    packet_loss_percent: toPercent(payload.packet_loss_percent ?? payload.packetLossPercent),
    ram_percent: toPercent(payload.ram_percent ?? payload.ramPercent),
    server_id: serverRowId,
    turn_status: safeLabel(payload.turn_status ?? payload.turnStatus, VALID_TURN_STATUSES),
  };

  const insert = await adminClient
    .from("livekit_server_heartbeats")
    .insert(heartbeat);

  if (insert.error) throw new Error(`LiveKit heartbeat insert failed: ${insert.error.message}`);

  const update = await adminClient
    .from("livekit_servers")
    .update({
      bandwidth_in_mbps: heartbeat.bandwidth_in_mbps,
      bandwidth_out_mbps: heartbeat.bandwidth_out_mbps,
      cpu_percent: heartbeat.cpu_percent,
      current_participants: heartbeat.active_participants,
      current_publishers: heartbeat.active_publishers,
      current_rooms: heartbeat.active_rooms,
      disconnect_rate: heartbeat.disconnect_rate,
      disk_usage_percent: heartbeat.disk_usage_percent,
      last_heartbeat_at: nowIso,
      livekit_node_status: heartbeat.livekit_node_status,
      memory_total_mb: heartbeat.memory_total_mb,
      memory_used_mb: heartbeat.memory_used_mb,
      metrics_collected_at: heartbeat.metrics_collected_at,
      metrics_source: heartbeat.metrics_source,
      network_rx_bps: heartbeat.network_rx_bps,
      network_tx_bps: heartbeat.network_tx_bps,
      packet_loss_percent: heartbeat.packet_loss_percent,
      ram_percent: heartbeat.ram_percent,
      turn_status: heartbeat.turn_status,
    })
    .eq("id", serverRowId)
    .select("*")
    .maybeSingle();

  if (update.error || !update.data) throw new Error(`LiveKit server heartbeat update failed: ${update.error?.message ?? "missing row"}`);

  await writeLiveKitRoutingAudit(adminClient, {
    eventType: "heartbeat_received",
    metadata: {
      active_participants: heartbeat.active_participants,
      active_publishers: heartbeat.active_publishers,
      active_rooms: heartbeat.active_rooms,
      has_resource_metrics: heartbeat.cpu_percent !== null
        || heartbeat.ram_percent !== null
        || heartbeat.memory_used_mb !== null
        || heartbeat.network_tx_bps !== null,
      metrics_source: heartbeat.metrics_source,
    },
    reason: `heartbeat:${serverId}`,
    serverRowId,
  });

  return jsonResponse(200, { server: sanitizeServer(update.data as JsonObject) });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for livekit-registry." });

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const payload = await req.json().catch(() => null) as JsonObject | null;
    if (!isRecord(payload)) return jsonResponse(400, { error: "invalid_body", message: "Request body must be a JSON object." });

    const action = toText(payload.action).toLowerCase();
    if (action === "heartbeat") {
      if (!heartbeatTokenAllowed(req)) {
        const authResult = await requireOperator(req, adminClient, supabaseUrl, supabaseAnonKey);
        if ("error" in authResult) return authResult.error;
      }
      return await recordHeartbeat(adminClient, payload);
    }

    const authResult = await requireOperator(req, adminClient, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;

    if (action === "list") return await listRegistry(adminClient, payload);
    if (action === "upsert_server") return await upsertServer(adminClient, payload, authResult.user.id);
    if (action === "set_status") return await setServerStatus(adminClient, payload, authResult.user.id);

    return jsonResponse(400, {
      error: "invalid_action",
      message: "action must be list, upsert_server, heartbeat, or set_status.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown LiveKit registry error.";
    console.error("livekit-registry failure", message.replace(/[A-Za-z0-9._~+/=-]{64,}/g, "[redacted]"));
    return jsonResponse(500, {
      error: "livekit_registry_failed",
      message: "Chi'llywood could not complete the LiveKit registry operation.",
    });
  }
});
