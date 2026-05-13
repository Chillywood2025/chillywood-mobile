import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient>;

export type LiveKitRoutingRoomType =
  | "chat_call"
  | "live_stage"
  | "live_watch_party"
  | "other"
  | "party_room"
  | "proof"
  | "watch_party_live";

type LiveKitServerStatus = "active" | "disabled" | "draining" | "maintenance" | "offline" | "standby";

type LiveKitServerRow = {
  bandwidth_in_mbps: number | null;
  bandwidth_out_mbps: number | null;
  cpu_percent: number | null;
  current_participants: number;
  current_publishers: number;
  current_rooms: number;
  disconnect_rate: number | null;
  id: string;
  last_assignment_at: string | null;
  last_heartbeat_at: string | null;
  max_egress_mbps: number | null;
  max_participants: number;
  max_publishers: number | null;
  max_rooms: number;
  packet_loss_percent: number | null;
  provider: string;
  public_ws_url: string;
  ram_percent: number | null;
  region: string;
  server_id: string;
  status: LiveKitServerStatus;
  weight: number;
};

type LiveKitRoomAssignmentRow = {
  assigned_server_id: string;
  assignment_reason: string;
  assignment_status: string;
  id: string;
};

export type LiveKitRouterInput = {
  actorUserId?: string | null;
  appRoomId: string;
  livekitRoomName: string;
  metadata?: JsonObject;
  requestedRegion?: string | null;
  roomType: LiveKitRoutingRoomType;
};

type RouterLimits = {
  maxBandwidthOutMbps: number;
  maxCpuPercent: number;
  maxPacketLossPercent: number;
  maxRamPercent: number;
  staleHeartbeatSeconds: number;
};

export type LiveKitAssignmentResult =
  | {
      assignmentId: string;
      assignmentReason: string;
      ok: true;
      serverId: string;
      serverRowId: string;
      serverUrl: string;
    }
  | {
      error: string;
      message: string;
      ok: false;
      status: number;
    };

export type LiveKitCandidateDecision = {
  reason: string;
  server: LiveKitServerRow | null;
};

export const LIVEKIT_ROUTER_DEFAULT_HEARTBEAT_STALE_SECONDS = 120;
const DEFAULT_MAX_CPU_PERCENT = 85;
const DEFAULT_MAX_RAM_PERCENT = 90;
const DEFAULT_MAX_BANDWIDTH_OUT_MBPS = 0;
const DEFAULT_MAX_PACKET_LOSS_PERCENT = 8;

const toText = (value: unknown) => String(value ?? "").trim();

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

const readRouterLimits = (): RouterLimits => ({
  maxBandwidthOutMbps: toNumber(readOptionalEnv("LIVEKIT_ROUTER_MAX_BANDWIDTH_OUT_MBPS")) ?? DEFAULT_MAX_BANDWIDTH_OUT_MBPS,
  maxCpuPercent: toNumber(readOptionalEnv("LIVEKIT_ROUTER_MAX_CPU_PERCENT")) ?? DEFAULT_MAX_CPU_PERCENT,
  maxPacketLossPercent: toNumber(readOptionalEnv("LIVEKIT_ROUTER_MAX_PACKET_LOSS_PERCENT")) ?? DEFAULT_MAX_PACKET_LOSS_PERCENT,
  maxRamPercent: toNumber(readOptionalEnv("LIVEKIT_ROUTER_MAX_RAM_PERCENT")) ?? DEFAULT_MAX_RAM_PERCENT,
  staleHeartbeatSeconds: toPositiveInteger(readOptionalEnv("LIVEKIT_ROUTER_HEARTBEAT_STALE_SECONDS"))
    ?? LIVEKIT_ROUTER_DEFAULT_HEARTBEAT_STALE_SECONDS,
});

const safeMetadata = (metadata: unknown): JsonObject => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};

  return Object.fromEntries(
    Object.entries(metadata as JsonObject)
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

const normalizeServerRow = (row: JsonObject): LiveKitServerRow => ({
  bandwidth_in_mbps: toNumber(row.bandwidth_in_mbps),
  bandwidth_out_mbps: toNumber(row.bandwidth_out_mbps),
  cpu_percent: toNumber(row.cpu_percent),
  current_participants: Math.max(0, Number(row.current_participants ?? 0)),
  current_publishers: Math.max(0, Number(row.current_publishers ?? 0)),
  current_rooms: Math.max(0, Number(row.current_rooms ?? 0)),
  disconnect_rate: toNumber(row.disconnect_rate),
  id: toText(row.id),
  last_assignment_at: toText(row.last_assignment_at) || null,
  last_heartbeat_at: toText(row.last_heartbeat_at) || null,
  max_egress_mbps: toNumber(row.max_egress_mbps),
  max_participants: Math.max(1, Number(row.max_participants ?? 1)),
  max_publishers: toNumber(row.max_publishers),
  max_rooms: Math.max(1, Number(row.max_rooms ?? 1)),
  packet_loss_percent: toNumber(row.packet_loss_percent),
  provider: toText(row.provider),
  public_ws_url: toText(row.public_ws_url),
  ram_percent: toNumber(row.ram_percent),
  region: toText(row.region),
  server_id: toText(row.server_id),
  status: toText(row.status) as LiveKitServerStatus,
  weight: Math.max(1, Number(row.weight ?? 1)),
});

const normalizeAssignmentRow = (row: JsonObject): LiveKitRoomAssignmentRow => ({
  assigned_server_id: toText(row.assigned_server_id),
  assignment_reason: toText(row.assignment_reason),
  assignment_status: toText(row.assignment_status),
  id: toText(row.id),
});

const isPublicLiveKitUrl = (url: string) => /^wss:\/\/\S+$/i.test(url) || /^ws:\/\/(localhost|127[.]0[.]0[.]1)(:\d+)?(\/.*)?$/i.test(url);

const heartbeatAgeMillis = (server: LiveKitServerRow, nowMillis: number) => {
  if (!server.last_heartbeat_at) return Number.POSITIVE_INFINITY;
  const heartbeatMillis = Date.parse(server.last_heartbeat_at);
  if (!Number.isFinite(heartbeatMillis)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMillis - heartbeatMillis);
};

const assignmentAgeMillis = (server: LiveKitServerRow, nowMillis: number) => {
  if (!server.last_assignment_at) return Number.POSITIVE_INFINITY;
  const assignmentMillis = Date.parse(server.last_assignment_at);
  if (!Number.isFinite(assignmentMillis)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMillis - assignmentMillis);
};

const rejectionReason = (server: LiveKitServerRow, limits: RouterLimits, nowMillis: number): string | null => {
  if (server.status !== "active") return `status_${server.status}`;
  if (!isPublicLiveKitUrl(server.public_ws_url)) return "missing_public_ws_url";
  if (heartbeatAgeMillis(server, nowMillis) > limits.staleHeartbeatSeconds * 1000) return "stale_heartbeat";
  if (server.current_rooms >= server.max_rooms) return "room_capacity_full";
  if (server.current_participants >= server.max_participants) return "participant_capacity_full";
  if (server.max_publishers !== null && server.current_publishers >= server.max_publishers) return "publisher_capacity_full";
  if (server.cpu_percent !== null && server.cpu_percent >= limits.maxCpuPercent) return "cpu_over_threshold";
  if (server.ram_percent !== null && server.ram_percent >= limits.maxRamPercent) return "ram_over_threshold";
  if (server.packet_loss_percent !== null && server.packet_loss_percent >= limits.maxPacketLossPercent) return "packet_loss_over_threshold";
  if (
    limits.maxBandwidthOutMbps > 0
    && server.bandwidth_out_mbps !== null
    && server.bandwidth_out_mbps >= limits.maxBandwidthOutMbps
  ) return "bandwidth_out_over_threshold";
  if (
    server.max_egress_mbps !== null
    && server.bandwidth_out_mbps !== null
    && server.bandwidth_out_mbps >= server.max_egress_mbps
  ) return "egress_bandwidth_full";
  return null;
};

const scoreServer = (server: LiveKitServerRow, requestedRegion: string | null, nowMillis: number) => {
  const roomLoad = server.current_rooms / Math.max(server.max_rooms, 1);
  const participantLoad = server.current_participants / Math.max(server.max_participants, 1);
  const publisherLoad = server.max_publishers && server.max_publishers > 0
    ? server.current_publishers / server.max_publishers
    : 0;
  const regionBonus = requestedRegion && requestedRegion === server.region ? 10_000 : 0;
  const recentAssignmentPenalty = assignmentAgeMillis(server, nowMillis) < 10_000 ? 25 : 0;
  const loadPenalty = Math.round((roomLoad * 450) + (participantLoad * 350) + (publisherLoad * 200));

  return regionBonus + (server.weight * 10) - loadPenalty - recentAssignmentPenalty;
};

export const chooseLiveKitServer = (
  servers: LiveKitServerRow[],
  requestedRegion: string | null,
  limits: RouterLimits,
  nowMillis = Date.now(),
): LiveKitCandidateDecision => {
  const rejectedReasons = new Map<string, number>();
  const eligible = servers.filter((server) => {
    const reason = rejectionReason(server, limits, nowMillis);
    if (!reason) return true;
    rejectedReasons.set(reason, (rejectedReasons.get(reason) ?? 0) + 1);
    return false;
  });

  if (!eligible.length) {
    const reason = [...rejectedReasons.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([entryReason, count]) => `${entryReason}:${count}`)
      .join(", ") || "no_servers_registered";

    return { reason, server: null };
  }

  const [selected] = eligible
    .map((server) => ({ score: scoreServer(server, requestedRegion, nowMillis), server }))
    .sort((left, right) => right.score - left.score || left.server.server_id.localeCompare(right.server.server_id));

  return {
    reason: requestedRegion && selected.server.region === requestedRegion
      ? "active_healthy_region_weighted"
      : "active_healthy_weighted",
    server: selected.server,
  };
};

export const normalizeLiveKitRoutingRoomType = (
  surface: "chat-call" | "live-stage" | "watch-party-live",
  roomKind: "communication" | "watch-party",
  watchPartyRoomType?: string | null,
): LiveKitRoutingRoomType => {
  if (surface === "chat-call" || roomKind === "communication") return "chat_call";
  if (surface === "live-stage") return "live_stage";

  const normalizedRoomType = toText(watchPartyRoomType).toLowerCase();
  if (normalizedRoomType === "live") return "live_watch_party";
  if (normalizedRoomType === "title") return "party_room";
  return "watch_party_live";
};

export const writeLiveKitRoutingAudit = async (
  adminClient: SupabaseClientLike,
  event: {
    actorUserId?: string | null;
    appRoomId?: string | null;
    eventType: string;
    livekitRoomName?: string | null;
    metadata?: JsonObject;
    reason: string;
    serverRowId?: string | null;
  },
) => {
  await adminClient
    .from("livekit_routing_audit")
    .insert({
      actor_user_id: toText(event.actorUserId) || null,
      app_room_id: toText(event.appRoomId) || null,
      event_type: event.eventType,
      livekit_room_name: toText(event.livekitRoomName) || null,
      metadata: safeMetadata(event.metadata),
      reason: event.reason.slice(0, 240),
      server_id: toText(event.serverRowId) || null,
    });
};

const fetchExistingAssignment = async (
  adminClient: SupabaseClientLike,
  input: LiveKitRouterInput,
): Promise<LiveKitRoomAssignmentRow | null> => {
  const query = await adminClient
    .from("livekit_room_assignments")
    .select("id,assigned_server_id,assignment_reason,assignment_status")
    .eq("app_room_id", input.appRoomId)
    .eq("livekit_room_name", input.livekitRoomName)
    .eq("room_type", input.roomType)
    .in("assignment_status", ["assigned", "active"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (query.error) throw new Error(`LiveKit assignment lookup failed: ${query.error.message}`);
  if (!query.data) return null;
  return normalizeAssignmentRow(query.data as JsonObject);
};

const fetchServerByRowId = async (
  adminClient: SupabaseClientLike,
  serverRowId: string,
): Promise<LiveKitServerRow | null> => {
  const query = await adminClient
    .from("livekit_servers")
    .select(`
      id,
      server_id,
      provider,
      region,
      public_ws_url,
      status,
      weight,
      max_rooms,
      max_participants,
      max_publishers,
      max_egress_mbps,
      current_rooms,
      current_participants,
      current_publishers,
      cpu_percent,
      ram_percent,
      bandwidth_in_mbps,
      bandwidth_out_mbps,
      packet_loss_percent,
      disconnect_rate,
      last_heartbeat_at,
      last_assignment_at
    `)
    .eq("id", serverRowId)
    .maybeSingle();

  if (query.error) throw new Error(`LiveKit server lookup failed: ${query.error.message}`);
  if (!query.data) return null;
  return normalizeServerRow(query.data as JsonObject);
};

export const resolveLiveKitAssignment = async (
  adminClient: SupabaseClientLike,
  input: LiveKitRouterInput,
): Promise<LiveKitAssignmentResult> => {
  const appRoomId = toText(input.appRoomId).toUpperCase();
  const livekitRoomName = toText(input.livekitRoomName).toUpperCase();
  const requestedRegion = toText(input.requestedRegion) || null;
  const actorUserId = toText(input.actorUserId) || null;
  const normalizedInput: LiveKitRouterInput = {
    ...input,
    actorUserId,
    appRoomId,
    livekitRoomName,
    metadata: safeMetadata(input.metadata),
    requestedRegion,
  };

  const existingAssignment = await fetchExistingAssignment(adminClient, normalizedInput);
  if (existingAssignment) {
    const assignedServer = await fetchServerByRowId(adminClient, existingAssignment.assigned_server_id);
    if (!assignedServer) {
      await writeLiveKitRoutingAudit(adminClient, {
        actorUserId,
        appRoomId,
        eventType: "assignment_failed",
        livekitRoomName,
        reason: "assigned_server_missing",
      });

      return {
        error: "assigned_server_missing",
        message: "The existing LiveKit room assignment points to a server that is no longer registered.",
        ok: false,
        status: 503,
      };
    }

    if (assignedServer.status !== "active" && assignedServer.status !== "draining") {
      await writeLiveKitRoutingAudit(adminClient, {
        actorUserId,
        appRoomId,
        eventType: "assignment_failed",
        livekitRoomName,
        metadata: { assigned_status: assignedServer.status, assigned_server_id: assignedServer.server_id },
        reason: "assigned_server_unavailable",
        serverRowId: assignedServer.id,
      });

      return {
        error: "assigned_server_unavailable",
        message: "The assigned LiveKit server is unavailable for this existing room. Operator recovery is required.",
        ok: false,
        status: 503,
      };
    }

    await writeLiveKitRoutingAudit(adminClient, {
      actorUserId,
      appRoomId,
      eventType: "assignment_reused",
      livekitRoomName,
      metadata: { server_id: assignedServer.server_id, status: assignedServer.status },
      reason: assignedServer.status === "draining" ? "existing_room_on_draining_server" : "existing_assignment_wins",
      serverRowId: assignedServer.id,
    });

    return {
      assignmentId: existingAssignment.id,
      assignmentReason: existingAssignment.assignment_reason || "existing_assignment_wins",
      ok: true,
      serverId: assignedServer.server_id,
      serverRowId: assignedServer.id,
      serverUrl: assignedServer.public_ws_url,
    };
  }

  const serversQuery = await adminClient
    .from("livekit_servers")
    .select(`
      id,
      server_id,
      provider,
      region,
      public_ws_url,
      status,
      weight,
      max_rooms,
      max_participants,
      max_publishers,
      max_egress_mbps,
      current_rooms,
      current_participants,
      current_publishers,
      cpu_percent,
      ram_percent,
      bandwidth_in_mbps,
      bandwidth_out_mbps,
      packet_loss_percent,
      disconnect_rate,
      last_heartbeat_at,
      last_assignment_at
    `);

  if (serversQuery.error) throw new Error(`LiveKit registry lookup failed: ${serversQuery.error.message}`);

  const servers = ((serversQuery.data ?? []) as JsonObject[]).map(normalizeServerRow);
  const selection = chooseLiveKitServer(servers, requestedRegion, readRouterLimits());

  if (!selection.server) {
    await writeLiveKitRoutingAudit(adminClient, {
      actorUserId,
      appRoomId,
      eventType: "no_eligible_server",
      livekitRoomName,
      metadata: { requested_region: requestedRegion, room_type: input.roomType },
      reason: selection.reason,
    });

    return {
      error: "no_eligible_livekit_server",
      message: "No healthy eligible LiveKit server is currently available for new rooms.",
      ok: false,
      status: 503,
    };
  }

  const assignmentReason = `${selection.reason}:server=${selection.server.server_id}`;
  const insert = await adminClient
    .from("livekit_room_assignments")
    .insert({
      app_room_id: appRoomId,
      assigned_server_id: selection.server.id,
      assignment_reason: assignmentReason,
      livekit_room_name: livekitRoomName,
      metadata: safeMetadata({
        requested_region: requestedRegion,
        ...normalizedInput.metadata,
      }),
      room_type: input.roomType,
      created_by: actorUserId,
    })
    .select("id,assigned_server_id,assignment_reason,assignment_status")
    .maybeSingle();

  if (insert.error) {
    const fallbackAssignment = await fetchExistingAssignment(adminClient, normalizedInput);
    if (fallbackAssignment) {
      const assignedServer = await fetchServerByRowId(adminClient, fallbackAssignment.assigned_server_id);
      if (assignedServer && (assignedServer.status === "active" || assignedServer.status === "draining")) {
        await writeLiveKitRoutingAudit(adminClient, {
          actorUserId,
          appRoomId,
          eventType: "assignment_reused",
          livekitRoomName,
          metadata: { server_id: assignedServer.server_id, status: assignedServer.status },
          reason: "concurrent_assignment_reused",
          serverRowId: assignedServer.id,
        });

        return {
          assignmentId: fallbackAssignment.id,
          assignmentReason: fallbackAssignment.assignment_reason || "concurrent_assignment_reused",
          ok: true,
          serverId: assignedServer.server_id,
          serverRowId: assignedServer.id,
          serverUrl: assignedServer.public_ws_url,
        };
      }
    }

    await writeLiveKitRoutingAudit(adminClient, {
      actorUserId,
      appRoomId,
      eventType: "assignment_failed",
      livekitRoomName,
      metadata: { error_code: insert.error.code ?? "insert_error" },
      reason: "assignment_insert_failed",
      serverRowId: selection.server.id,
    });

    return {
      error: "assignment_failed",
      message: "Chi'llywood could not persist a LiveKit server assignment for this room.",
      ok: false,
      status: 503,
    };
  }

  const assignment = normalizeAssignmentRow(insert.data as JsonObject);
  await adminClient
    .from("livekit_servers")
    .update({ last_assignment_at: new Date().toISOString() })
    .eq("id", selection.server.id);

  await writeLiveKitRoutingAudit(adminClient, {
    actorUserId,
    appRoomId,
    eventType: "room_assigned",
    livekitRoomName,
    metadata: {
      requested_region: requestedRegion,
      room_type: input.roomType,
      server_id: selection.server.server_id,
    },
    reason: assignmentReason,
    serverRowId: selection.server.id,
  });

  return {
    assignmentId: assignment.id,
    assignmentReason,
    ok: true,
    serverId: selection.server.server_id,
    serverRowId: selection.server.id,
    serverUrl: selection.server.public_ws_url,
  };
};
