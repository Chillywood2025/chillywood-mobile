import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-livekit-operator-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const DEFAULT_STALE_SECONDS = 120;
const DEFAULT_SERVER_ID = "chillywood-prod-01";
const SURFACES = [
  "live_stage",
  "watch_party_live",
  "party_room_live_sidecar",
  "chat_call",
  "livekit_token",
  "livekit_router",
  "heartbeat_monitor",
  "host_agent",
] as const;

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

const safeLabel = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/[^a-z0-9_.:-]/g, "-")
  .slice(0, 120);

const redactText = (value: unknown) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");

const safeMetadata = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .filter(([key, entry]) => {
        const normalized = key.toLowerCase();
        if (
          normalized.includes("secret")
          || normalized.includes("token")
          || normalized.includes("password")
          || normalized.includes("key")
          || normalized.includes("authorization")
        ) return false;
        return typeof entry === "string"
          || typeof entry === "number"
          || typeof entry === "boolean"
          || entry === null;
      })
      .slice(0, 32)
      .map(([key, entry]) => [key, typeof entry === "string" ? redactText(entry) : entry]),
  );
};

const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const constantTimeEqual = (left: string, right: string) => {
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  let diff = leftText.length ^ rightText.length;
  const maxLength = Math.max(leftText.length, rightText.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const authenticateOperator = async (request: Request) => {
  const token = toText(request.headers.get("x-livekit-operator-token"));
  if (!token) return false;
  const expectedHash = readRequiredEnv("LIVEKIT_OPERATOR_TOKEN_SHA256");
  const actualHash = await sha256Hex(token);
  return constantTimeEqual(actualHash, expectedHash);
};

const authenticateAppUser = async (adminClient: SupabaseClientLike, request: Request) => {
  const authorization = toText(request.headers.get("authorization"));
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return null;
  const result = await adminClient.auth.getUser(accessToken);
  if (result.error || !result.data?.user?.id) return null;
  return result.data.user as { id: string };
};

const heartbeatAgeSeconds = (lastHeartbeatAt: unknown, now = Date.now()) => {
  const parsed = Date.parse(toText(lastHeartbeatAt));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((now - parsed) / 1000));
};

const classifyServer = (server: JsonObject, staleSeconds: number) => {
  const heartbeatAge = heartbeatAgeSeconds(server.last_heartbeat_at);
  if (toText(server.status) !== "active") return { reason: `status_${safeLabel(server.status || "unknown")}`, state: "no_eligible_server" };
  if (!/^wss:\/\/\S+$/i.test(toText(server.public_ws_url))) return { reason: "missing_public_ws_url", state: "websocket_unreachable" };
  if (heartbeatAge > staleSeconds) return { reason: "stale_heartbeat", state: "stale_heartbeat" };
  if (Number(server.current_rooms ?? 0) >= Number(server.max_rooms ?? 1)) return { reason: "room_capacity_full", state: "capacity_full" };
  if (Number(server.current_participants ?? 0) >= Number(server.max_participants ?? 1)) return { reason: "participant_capacity_full", state: "capacity_full" };
  const maxPublishers = toNumber(server.max_publishers);
  if (maxPublishers !== null && Number(server.current_publishers ?? 0) >= maxPublishers) return { reason: "publisher_capacity_full", state: "capacity_full" };
  if (toNumber(server.cpu_percent) !== null && Number(server.cpu_percent) >= Number(readOptionalEnv("LIVEKIT_ROUTER_MAX_CPU_PERCENT") || 85)) return { reason: "cpu_over_threshold", state: "degraded" };
  if (toNumber(server.ram_percent) !== null && Number(server.ram_percent) >= Number(readOptionalEnv("LIVEKIT_ROUTER_MAX_RAM_PERCENT") || 90)) return { reason: "ram_over_threshold", state: "degraded" };
  if (toNumber(server.packet_loss_percent) !== null && Number(server.packet_loss_percent) >= Number(readOptionalEnv("LIVEKIT_ROUTER_MAX_PACKET_LOSS_PERCENT") || 8)) return { reason: "packet_loss_over_threshold", state: "degraded" };
  return { reason: "eligible_server_available", state: "healthy" };
};

const planForState = (surface: string, healthState: string, reason: string) => {
  if (healthState === "healthy") {
    return { action: "audit_only", autoExecutable: true, level: 0, ownerApprovalRequired: false, reason, rollbackAvailable: false, surface };
  }
  if (healthState === "stale_heartbeat") {
    return { action: "run_heartbeat_monitor", autoExecutable: true, level: 1, ownerApprovalRequired: false, reason, rollbackAvailable: true, surface };
  }
  if (healthState === "function_blob_missing") {
    return { action: "redeploy_known_edge_function", autoExecutable: false, level: 2, ownerApprovalRequired: false, reason, rollbackAvailable: true, surface };
  }
  if (healthState === "capacity_full" || healthState === "capacity_counter_stale") {
    return { action: "refresh_registry_counters", autoExecutable: true, level: 1, ownerApprovalRequired: false, reason, rollbackAvailable: true, surface };
  }
  if (
    healthState === "render_surface_flicker"
    || healthState === "fallback_flash_regression"
    || healthState === "renderable_contract_regression"
    || healthState === "surface_mount_regression"
    || healthState === "roster_render_regression"
    || healthState === "app_token_validation_regression"
    || healthState === "camera_track_missing"
    || healthState === "render_contract_missing"
  ) {
    return { action: "stabilize_client_surface", autoExecutable: true, level: 1, ownerApprovalRequired: false, reason, rollbackAvailable: true, surface };
  }
  return { action: "owner_approval_required", autoExecutable: false, level: 3, ownerApprovalRequired: true, reason, rollbackAvailable: false, surface };
};

const readRouterHealth = async (adminClient: SupabaseClientLike) => {
  const staleSeconds = Number(readOptionalEnv("LIVEKIT_ROUTER_HEARTBEAT_STALE_SECONDS") || DEFAULT_STALE_SECONDS);
  const serversResult = await adminClient
    .from("livekit_servers")
    .select("id,server_id,status,public_ws_url,provider,region,last_heartbeat_at,current_rooms,current_participants,current_publishers,max_rooms,max_participants,max_publishers,cpu_percent,ram_percent,packet_loss_percent,bandwidth_out_mbps,max_egress_mbps,metrics_source,livekit_node_status,turn_status")
    .order("server_id", { ascending: true });

  if (serversResult.error) throw new Error(`livekit_servers read failed: ${serversResult.error.message}`);
  const servers = Array.isArray(serversResult.data) ? serversResult.data : [];
  const classified = servers.map((server: JsonObject) => ({
    heartbeatAgeSeconds: heartbeatAgeSeconds(server.last_heartbeat_at),
    publicWsHost: toText(server.public_ws_url).replace(/^wss?:\/\//i, "").split("/")[0] || null,
    reason: classifyServer(server, staleSeconds).reason,
    serverId: toText(server.server_id),
    state: classifyServer(server, staleSeconds).state,
    status: toText(server.status),
  }));
  const eligibleCount = classified.filter((entry: JsonObject) => entry.state === "healthy").length;
  const topRejection = classified.find((entry: JsonObject) => entry.state !== "healthy");
  const healthState = eligibleCount > 0 ? "healthy" : toText(topRejection?.state) || "no_eligible_server";
  const reason = eligibleCount > 0 ? "eligible_server_available" : toText(topRejection?.reason) || "no_servers_registered";

  return {
    classified,
    eligibleServerCount: eligibleCount,
    healthState,
    reason,
    serverCount: servers.length,
    staleHeartbeatSeconds: staleSeconds,
    surface: "livekit_router",
  };
};

const safeInsert = async (adminClient: SupabaseClientLike, table: string, payload: JsonObject) => {
  const result = await adminClient.from(table).insert(payload);
  if (result.error) {
    console.error("livekit-operator audit insert failed", table, redactText(result.error.message));
    return false;
  }
  return true;
};

const recordLearningState = async (
  adminClient: SupabaseClientLike,
  input: {
    action: string;
    healthState: string;
    reason: string;
    result: "failed" | "planned" | "succeeded";
    surface: string;
  },
) => {
  const query = await adminClient
    .from("livekit_operator_learning_state")
    .select("id,occurrence_count,success_count,failure_count,confidence")
    .eq("surface", input.surface)
    .eq("health_state", input.healthState)
    .eq("reason", input.reason)
    .eq("preferred_action", input.action)
    .maybeSingle();

  const current = query.data as JsonObject | null;
  const occurrenceCount = Number(current?.occurrence_count ?? 0) + 1;
  const successCount = Number(current?.success_count ?? 0) + (input.result === "succeeded" ? 1 : 0);
  const failureCount = Number(current?.failure_count ?? 0) + (input.result === "failed" ? 1 : 0);
  const confidence = Math.max(0, Math.min(0.999, successCount / Math.max(occurrenceCount, 1)));

  if (current?.id) {
    await adminClient
      .from("livekit_operator_learning_state")
      .update({
        confidence,
        failure_count: failureCount,
        last_result: input.result,
        occurrence_count: occurrenceCount,
        success_count: successCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    return;
  }

  await safeInsert(adminClient, "livekit_operator_learning_state", {
    confidence,
    failure_count: failureCount,
    health_state: input.healthState,
    last_result: input.result,
    occurrence_count: occurrenceCount,
    preferred_action: input.action,
    reason: input.reason,
    success_count: successCount,
    surface: input.surface,
  });
};

const writeHealthSnapshot = async (adminClient: SupabaseClientLike, health: JsonObject, metadata?: JsonObject) => safeInsert(
  adminClient,
  "livekit_surface_health_snapshots",
  {
    eligible_server_count: typeof health.eligibleServerCount === "number" ? health.eligibleServerCount : null,
    heartbeat_age_seconds: null,
    health_state: toText(health.healthState) || "unknown_requires_review",
    metadata: safeMetadata(metadata),
    reason: toText(health.reason) || "unknown",
    router_health: safeMetadata(health),
    severity: health.healthState === "healthy" ? "info" : "critical",
    surface: toText(health.surface) || "livekit_router",
  },
);

const readTokenAudit = async (adminClient: SupabaseClientLike) => {
  const sinceIso = new Date(Date.now() - 30 * 60_000).toISOString();
  const result = await adminClient
    .from("livekit_token_request_audit")
    .select("surface,outcome,error_code,room_join,can_publish,can_subscribe,created_at")
    .in("surface", ["live-stage", "watch-party-live", "chat-call"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(60);
  if (result.error) throw new Error(`livekit_token_request_audit read failed: ${result.error.message}`);
  return (result.data ?? []).map((row: JsonObject) => ({
    canPublish: row.can_publish === true,
    canSubscribe: row.can_subscribe === true,
    errorCode: toText(row.error_code) || null,
    outcome: toText(row.outcome),
    roomJoin: row.room_join === true,
    surface: toText(row.surface),
  }));
};

const readRenderNumber = (renderEvent: JsonObject, ...keys: string[]) => {
  for (const key of keys) {
    const value = toNumber(renderEvent[key]);
    if (value !== null) return value;
  }
  return null;
};

const readRenderBoolean = (renderEvent: JsonObject, ...keys: string[]) => {
  for (const key of keys) {
    if (typeof renderEvent[key] === "boolean") return renderEvent[key] === true;
  }
  return false;
};

const classifyRenderEvent = (renderEvent: JsonObject) => {
  const eventName = safeLabel(renderEvent.eventName || renderEvent.event_name || "unknown");
  const surface = safeLabel(renderEvent.surface || "watch_party_live");
  const hasRenderableContract = readRenderBoolean(renderEvent, "hasRenderableContract", "has_renderable_contract", "renderableContractPresent", "renderable_contract_present");
  const activeContractPresent = readRenderBoolean(renderEvent, "activeContractPresent", "active_contract_present");
  const shouldRenderSurface = readRenderBoolean(renderEvent, "shouldRenderSurface", "should_render_surface");
  const fallbackRosterShown = eventName === "livekit_fallback_roster_shown" || readRenderBoolean(renderEvent, "fallbackRosterShown", "fallback_roster_shown");
  const renderableContractCleared = eventName === "livekit_renderable_contract_cleared" || readRenderBoolean(renderEvent, "renderableContractCleared", "renderable_contract_cleared");
  const nbfDeltaSeconds = readRenderNumber(renderEvent, "nbfDeltaSecondsBucket", "nbf_delta_seconds_bucket", "tokenNbfDeltaSecondsBucket", "token_nbf_delta_seconds_bucket");
  const bubbleGridItemCount = readRenderNumber(renderEvent, "bubbleGridItemCount", "bubble_grid_item_count");
  const bubbleGridTrackCount = readRenderNumber(renderEvent, "bubbleGridTrackCount", "bubble_grid_track_count");
  const rosterParticipantCount = readRenderNumber(renderEvent, "rosterParticipantCount", "roster_participant_count");
  const canPublish = readRenderBoolean(renderEvent, "canPublish", "can_publish");

  if (eventName === "livekit_token_nbf_future_grace_used" && nbfDeltaSeconds !== null && nbfDeltaSeconds >= 0 && nbfDeltaSeconds <= 5) {
    return { confidence: 0.96, healthState: "healthy", reason: "token_nbf_future_within_grace", severity: "info", surface };
  }
  if (eventName === "livekit_token_nbf_rejected" || (nbfDeltaSeconds !== null && nbfDeltaSeconds > 5)) {
    return {
      confidence: 0.96,
      healthState: nbfDeltaSeconds !== null && nbfDeltaSeconds > 5 ? "token_time_skew_blocker" : "app_token_validation_regression",
      reason: nbfDeltaSeconds !== null && nbfDeltaSeconds > 5 ? "token_nbf_future_beyond_grace" : "fresh_token_rejected_by_client",
      severity: "critical",
      surface,
    };
  }
  if (renderableContractCleared && hasRenderableContract) {
    return { confidence: 0.95, healthState: "renderable_contract_regression", reason: "renderable_contract_cleared_while_valid", severity: "critical", surface };
  }
  if (fallbackRosterShown && hasRenderableContract) {
    return { confidence: 0.95, healthState: "fallback_flash_regression", reason: "fallback_roster_shown_while_renderable_contract_valid", severity: "warning", surface };
  }
  if ((activeContractPresent || hasRenderableContract) && shouldRenderSurface === false && eventName !== "livekit_fallback_roster_suppressed") {
    return { confidence: 0.94, healthState: "surface_mount_regression", reason: "active_or_renderable_contract_without_surface", severity: "critical", surface };
  }
  if ((rosterParticipantCount ?? 0) > 0 && (bubbleGridItemCount ?? 0) === 0) {
    return { confidence: 0.88, healthState: "roster_render_regression", reason: "roster_participants_exist_but_bubble_grid_empty", severity: "warning", surface };
  }
  if (canPublish && (bubbleGridTrackCount ?? 0) === 0 && (bubbleGridItemCount ?? 0) > 0) {
    return { confidence: 0.82, healthState: "camera_track_missing", reason: "publish_capable_participant_waiting_for_camera_track", severity: "warning", surface };
  }
  return { confidence: 0.9, healthState: "healthy", reason: "render_event_stable", severity: "info", surface };
};

const invokeHeartbeatMonitor = async (serverId: string) => {
  const monitorUrl = readOptionalEnv("LIVEKIT_HEARTBEAT_MONITOR_FUNCTION_URL");
  const monitorSecret = readOptionalEnv("LIVEKIT_HEARTBEAT_MONITOR_SECRET");
  if (!monitorUrl || !monitorSecret) {
    return { ok: false, reason: "heartbeat_monitor_invoke_config_missing", status: 0 };
  }
  const response = await fetch(monitorUrl, {
    body: JSON.stringify({
      server_id: serverId || DEFAULT_SERVER_ID,
      source: "livekit-autonomous-operator",
    }),
    headers: {
      "Content-Type": "application/json",
      "X-LiveKit-Heartbeat-Monitor-Token": monitorSecret,
    },
    method: "POST",
  });
  const body = await response.json().catch(() => null) as JsonObject | null;
  const error = toText(body?.error || body?.code);
  return {
    ok: response.ok,
    reason: response.ok ? "heartbeat_monitor_invoked" : error || "heartbeat_monitor_failed",
    status: response.status,
  };
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS, status: 204 });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const body = await request.json().catch(() => ({})) as JsonObject;
    const action = safeLabel(body.action || "health_snapshot");
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (action === "render_event_ingest") {
      const appUser = await authenticateAppUser(adminClient, request);
      if (!appUser) return jsonResponse(401, { error: "authenticated_user_required" });

      const renderEvent = body.render_event && typeof body.render_event === "object" ? body.render_event as JsonObject : {};
      const classification = classifyRenderEvent(renderEvent);
      const userHash = await sha256Hex(appUser.id);
      const sinceIso = new Date(Date.now() - 60_000).toISOString();
      const recent = await adminClient
        .from("livekit_operator_events")
        .select("id", { count: "exact", head: true })
        .eq("surface", classification.surface)
        .filter("metadata->>user_hash", "eq", userHash)
        .gte("created_at", sinceIso);
      if (typeof recent.count === "number" && recent.count > 60) {
        return jsonResponse(429, { error: "render_telemetry_rate_limited" });
      }

      const planned = planForState(classification.surface, classification.healthState, classification.reason);
      await safeInsert(adminClient, "livekit_operator_events", {
        action_planned: planned.action,
        confidence: classification.confidence,
        health_state: classification.healthState,
        metadata: safeMetadata({
          ...renderEvent,
          user_hash: userHash,
        }),
        reason: classification.reason,
        severity: classification.severity,
        surface: classification.surface,
      });
      await recordLearningState(adminClient, {
        action: planned.action,
        healthState: classification.healthState,
        reason: classification.reason,
        result: classification.healthState === "healthy" ? "succeeded" : "planned",
        surface: classification.surface,
      });
      return jsonResponse(200, {
        classification: {
          healthState: classification.healthState,
          reason: classification.reason,
          severity: classification.severity,
          surface: classification.surface,
        },
        ok: true,
      });
    }

    const operatorOk = await authenticateOperator(request);
    if (!operatorOk) return jsonResponse(401, { error: "operator_token_required" });

    if (action === "health_snapshot" || action === "router_health") {
      const routerHealth = await readRouterHealth(adminClient);
      const tokenAudit = await readTokenAudit(adminClient).catch((error) => ([{
        error: redactText(error instanceof Error ? error.message : String(error)),
      }]));
      await writeHealthSnapshot(adminClient, routerHealth, { action });
      await recordLearningState(adminClient, {
        action: "audit_only",
        healthState: toText(routerHealth.healthState),
        reason: toText(routerHealth.reason),
        result: routerHealth.healthState === "healthy" ? "succeeded" : "planned",
        surface: "livekit_router",
      });
      return jsonResponse(200, { ok: true, routerHealth, surfaces: SURFACES, tokenAudit });
    }

    if (action === "token_surface_probe") {
      const tokenAudit = await readTokenAudit(adminClient);
      return jsonResponse(200, { ok: true, tokenAudit });
    }

    if (action === "heartbeat_probe") {
      const invoke = body.invoke === true;
      const result = invoke ? await invokeHeartbeatMonitor(toText(body.server_id) || DEFAULT_SERVER_ID) : { ok: true, reason: "probe_config_present", status: 0 };
      return jsonResponse(result.ok ? 200 : 503, { ok: result.ok, result });
    }

    if (action === "plan_recovery" || action === "execute_safe_recovery" || action === "watch_once") {
      const routerHealth = await readRouterHealth(adminClient);
      const plan = planForState("livekit_router", toText(routerHealth.healthState), toText(routerHealth.reason));
      let execution: JsonObject = { status: "not_executed" };
      const shouldExecute = action === "execute_safe_recovery" || (action === "watch_once" && body.enable_safe_recovery === true);

      if (shouldExecute) {
        if (!plan.autoExecutable || plan.ownerApprovalRequired || plan.level >= 3) {
          execution = { reason: "owner_approval_required_or_not_auto_executable", status: "blocked" };
        } else if (plan.action === "run_heartbeat_monitor" || plan.action === "refresh_registry_counters") {
          const startedAt = Date.now();
          const result = await invokeHeartbeatMonitor(toText(body.server_id) || DEFAULT_SERVER_ID);
          const afterHealth = await readRouterHealth(adminClient).catch(() => ({}));
          execution = {
            durationMs: Date.now() - startedAt,
            reason: result.reason,
            status: result.ok ? "executed" : "failed",
          };
          await safeInsert(adminClient, "livekit_operator_recovery_actions", {
            action_planned: plan.action,
            action_taken: plan.action,
            after_health: safeMetadata(afterHealth),
            auto_executable: true,
            before_health: safeMetadata(routerHealth),
            health_state: routerHealth.healthState,
            owner_approval_required: false,
            reason: routerHealth.reason,
            recovery_duration_ms: execution.durationMs,
            recovery_level: plan.level,
            result: execution.status,
            rollback_available: true,
            severity: routerHealth.healthState === "healthy" ? "info" : "critical",
            surface: "livekit_router",
          });
          await recordLearningState(adminClient, {
            action: plan.action,
            healthState: toText(routerHealth.healthState),
            reason: toText(routerHealth.reason),
            result: result.ok ? "succeeded" : "failed",
            surface: "livekit_router",
          });
        }
      } else {
        await recordLearningState(adminClient, {
          action: plan.action,
          healthState: toText(routerHealth.healthState),
          reason: toText(routerHealth.reason),
          result: routerHealth.healthState === "healthy" ? "succeeded" : "planned",
          surface: "livekit_router",
        });
      }

      if (action === "watch_once") {
        await safeInsert(adminClient, "livekit_operator_events", {
          action_planned: plan.action,
          action_taken: toText(execution.status) === "executed" ? plan.action : null,
          confidence: routerHealth.healthState === "healthy" ? 0.99 : 0.9,
          health_state: routerHealth.healthState,
          metadata: safeMetadata({
            action,
            enable_safe_recovery: body.enable_safe_recovery === true,
            execution_status: execution.status,
            scheduler: body.scheduler,
            source: body.source,
          }),
          reason: routerHealth.reason,
          result: execution.status,
          severity: routerHealth.healthState === "healthy" ? "info" : "critical",
          surface: "livekit_router",
        });
      }

      return jsonResponse(200, { execution, ok: true, plan, routerHealth });
    }

    if (action === "pause_surface") {
      const surface = safeLabel(body.surface || "unknown");
      await safeInsert(adminClient, "livekit_operator_recovery_actions", {
        action_planned: "pause_affected_surface",
        action_taken: "pause_surface_recorded_only",
        auto_executable: false,
        health_state: "degraded",
        owner_approval_required: false,
        reason: "surface_pause_recorded_for_operator_review",
        recovery_level: 2,
        result: "recorded",
        rollback_available: true,
        severity: "warning",
        surface,
      });
      return jsonResponse(200, { ok: true, result: "recorded_only", surface });
    }

    if (action === "recovery_report") {
      const [events, recoveries, learning] = await Promise.all([
        adminClient.from("livekit_operator_events").select("surface,health_state,severity,reason,result,created_at").order("created_at", { ascending: false }).limit(25),
        adminClient.from("livekit_operator_recovery_actions").select("surface,health_state,action_planned,action_taken,result,created_at").order("created_at", { ascending: false }).limit(25),
        adminClient.from("livekit_operator_learning_state").select("surface,health_state,preferred_action,occurrence_count,success_count,failure_count,confidence,updated_at").order("updated_at", { ascending: false }).limit(25),
      ]);
      return jsonResponse(200, {
        events: events.data ?? [],
        learning: learning.data ?? [],
        ok: true,
        recoveries: recoveries.data ?? [],
      });
    }

    return jsonResponse(400, { error: "unsupported_action" });
  } catch (error) {
    console.error("livekit-operator failure", redactText(error instanceof Error ? error.message : String(error)));
    return jsonResponse(500, { error: "operator_failure" });
  }
});
