import type { ActionPlan } from "./actions.js";
import type { OpsConfig } from "./config.js";
import type { OpsJob } from "./jobs.js";

type JsonObject = Record<string, unknown>;

function requireSupabase(config: OpsConfig) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("supabase_service_role_not_configured");
  }

  return {
    serviceRoleKey: config.supabaseServiceRoleKey,
    url: config.supabaseUrl.replace(/\/+$/, "")
  };
}

function headers(config: OpsConfig, prefer?: string) {
  const { serviceRoleKey } = requireSupabase(config);
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function rest<T = unknown>(
  config: OpsConfig,
  path: string,
  options: { body?: unknown; method: "GET" | "PATCH" | "POST"; prefer?: string } = { method: "GET" }
): Promise<T> {
  const { url } = requireSupabase(config);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    body: options.body == null ? undefined : JSON.stringify(options.body),
    headers: headers(config, options.prefer),
    method: options.method
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = typeof parsed?.message === "string" ? parsed.message : `supabase_http_${response.status}`;
    throw new Error(`supabase_request_failed:${message}`);
  }

  return parsed as T;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function jobStatusForIncident(job: OpsJob): string {
  if (job.status === "denied") return "rejected";
  return job.status;
}

function targetFromPlan(plan: ActionPlan): JsonObject {
  return plan.target ?? {};
}

export async function mirrorLiveOpsJob(
  job: OpsJob,
  config: OpsConfig,
  eventType: "detect" | "dry_run" | "approve" | "reject" | "execute" | "fail" | "create_pr_only",
  actor?: { email?: string; role?: string; userId?: string }
) {
  if (!job.plan.liveOpsIncident || !config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return;
  }

  const incident = job.plan.liveOpsIncident;
  const rows = await rest<JsonObject[]>(
    config,
    "admin_live_ops_incidents?on_conflict=idempotency_key",
    {
      body: [
        {
          affected_call_id: incident.affectedCallId ?? null,
          affected_platform: incident.affectedPlatform,
          affected_purpose: incident.affectedPurpose,
          affected_rooms: incident.affectedRooms,
          affected_route: incident.affectedRoute,
          affected_server_id: incident.affectedServerId ?? null,
          affected_thread_id: incident.affectedThreadId ?? null,
          call_mode: incident.callMode ?? null,
          confidence: incident.confidence,
          detected_symptoms: incident.detectedSymptoms,
          dry_run_result: job.status === "dry_run_completed"
            ? job.executionResult ?? job.dryRunResult ?? null
            : job.dryRunResult ?? null,
          idempotency_key: job.idempotencyKey,
          last_action_at: new Date().toISOString(),
          likely_cause: incident.likelyCause,
          metadata: {
            ...incident.metadata,
            dry_run_result: job.dryRunResult ?? null,
            execution_result: job.executionResult ?? null,
            failure_reason: job.failureReason ?? null,
            ops_job_status: job.status,
          },
          ops_job_id: job.id,
          recommended_action: incident.recommendedAction,
          risk_level: incident.riskLevel,
          rollback_note: incident.rollbackNote,
          runbook_path: incident.runbookPath,
          runbook_url: incident.runbookUrl ?? null,
          status: jobStatusForIncident(job),
          suggested_fix: incident.suggestedFix,
          title: incident.title,
        }
      ],
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation"
    }
  );

  const incidentId = typeof rows?.[0]?.id === "string" ? rows[0].id : null;
  await rest(config, "admin_live_ops_action_audit", {
    body: {
      action_type: job.plan.actionType,
      actor_email: actor?.email ?? null,
      actor_role: actor?.role ?? "ops_service",
      actor_user_id: actor?.userId ?? null,
      dry_run: config.dryRun || job.status === "dry_run_completed",
      error_message: job.failureReason ?? null,
      event_type: eventType,
      idempotency_key: `${job.idempotencyKey}:${eventType}:${Date.now()}`,
      incident_id: incidentId,
      ops_job_id: job.id,
      result: {
        dry_run_result: job.dryRunResult ?? null,
        execution_result: job.executionResult ?? null,
        status: job.status,
      },
      risk_level: incident.riskLevel,
      rollback_note: incident.rollbackNote,
      success: !job.failureReason && job.status !== "failed",
      target: targetFromPlan(job.plan),
    },
    method: "POST"
  });
}

async function insertRoutingAudit(
  config: OpsConfig,
  input: {
    appRoomId?: string | null;
    eventType: string;
    livekitRoomName?: string | null;
    reason: string;
    serverRowId?: string | null;
  }
) {
  await rest(config, "livekit_routing_audit", {
    body: {
      app_room_id: input.appRoomId ?? null,
      event_type: input.eventType,
      livekit_room_name: input.livekitRoomName ?? null,
      metadata: {
        source: "live_ops_fix_center",
      },
      reason: input.reason,
      server_id: input.serverRowId ?? null,
    },
    method: "POST"
  });
}

async function updateServerStatus(
  config: OpsConfig,
  serverId: string,
  status: "active" | "disabled" | "draining" | "maintenance" | "offline" | "standby",
  reason: string
) {
  if (!serverId) throw new Error("missing_server_id");

  const patch: JsonObject = {
    status,
  };
  if (status === "draining") {
    patch.drain_started_at = new Date().toISOString();
    patch.drain_reason = reason;
  }
  if (status === "active") {
    patch.drain_started_at = null;
    patch.drain_reason = null;
  }

  const rows = await rest<JsonObject[]>(
    config,
    `livekit_servers?server_id=eq.${encode(serverId)}&select=id,server_id,status,last_heartbeat_at`,
    {
      body: patch,
      method: "PATCH",
      prefer: "return=representation"
    }
  );
  const row = rows?.[0];
  if (!row) throw new Error("livekit_server_not_found");

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
  await insertRoutingAudit(config, {
    eventType,
    reason,
    serverRowId: typeof row.id === "string" ? row.id : null,
  });

  return row;
}

async function chooseFreshStandby(config: OpsConfig, explicitStandbyServerId?: string) {
  const filter = explicitStandbyServerId ? `server_id=eq.${encode(explicitStandbyServerId)}&` : "";
  const rows = await rest<JsonObject[]>(
    config,
    `livekit_servers?${filter}status=eq.standby&select=id,server_id,status,last_heartbeat_at,weight&order=weight.desc`
  );
  const now = Date.now();
  const staleMillis = config.liveOpsHeartbeatStaleSeconds * 1000;
  const standby = rows.find((row) => {
    const heartbeatAt = typeof row.last_heartbeat_at === "string" ? Date.parse(row.last_heartbeat_at) : NaN;
    return Number.isFinite(heartbeatAt) && now - heartbeatAt <= staleMillis;
  });
  if (!standby) throw new Error("fresh_standby_not_available");
  return standby;
}

async function clearStaleAssignment(config: OpsConfig, target: Record<string, string> | undefined) {
  const assignmentId = target?.assignmentId ?? target?.assignment_id ?? "";
  const appRoomId = target?.appRoomId ?? target?.app_room_id ?? "";
  const livekitRoomName = target?.livekitRoomName ?? target?.livekit_room_name ?? target?.room ?? "";

  const filter = assignmentId
    ? `id=eq.${encode(assignmentId)}`
    : appRoomId
      ? `app_room_id=eq.${encode(appRoomId)}`
      : livekitRoomName
        ? `livekit_room_name=eq.${encode(livekitRoomName)}`
        : "";
  if (!filter) throw new Error("missing_assignment_target");

  const rows = await rest<JsonObject[]>(
    config,
    `livekit_room_assignments?${filter}&select=id,app_room_id,livekit_room_name,assignment_status,room_type,created_at,updated_at&limit=1`
  );
  const assignment = rows?.[0];
  if (!assignment) throw new Error("assignment_not_found");

  if (assignment.assignment_status === "ended") {
    return { assignment, status: "already_ended" };
  }

  const assignmentTime = Date.parse(String(assignment.updated_at ?? assignment.created_at ?? ""));
  if (!Number.isFinite(assignmentTime) || Date.now() - assignmentTime < config.staleAssignmentMinAgeSeconds * 1000) {
    throw new Error("assignment_not_old_enough_to_clear");
  }

  const partyId = String(assignment.app_room_id ?? "");
  if (partyId) {
    const roomRows = await rest<JsonObject[]>(
      config,
      `watch_party_rooms?party_id=eq.${encode(partyId)}&select=party_id,is_active,last_activity_at,updated_at&limit=1`
    );
    const room = roomRows?.[0];
    if (room?.is_active === true) {
      const lastActivity = Date.parse(String(room.last_activity_at ?? room.updated_at ?? ""));
      if (Number.isFinite(lastActivity) && Date.now() - lastActivity < config.staleAssignmentMinAgeSeconds * 1000) {
        throw new Error("active_room_not_safe_to_clear");
      }
    }

    const since = new Date(Date.now() - config.staleAssignmentMinAgeSeconds * 1000).toISOString();
    const activeMemberships = await rest<JsonObject[]>(
      config,
      `watch_party_room_memberships?party_id=eq.${encode(partyId)}&membership_state=in.(active,reconnecting)&last_seen_at=gte.${encode(since)}&select=party_id&limit=1`
    );
    if (activeMemberships.length > 0) {
      throw new Error("active_membership_not_safe_to_clear");
    }
  }

  const updated = await rest<JsonObject[]>(
    config,
    `livekit_room_assignments?id=eq.${encode(String(assignment.id))}&select=id,app_room_id,livekit_room_name,assignment_status,ended_at`,
    {
      body: {
        assignment_status: "ended",
        ended_at: new Date().toISOString(),
      },
      method: "PATCH",
      prefer: "return=representation"
    }
  );

  await insertRoutingAudit(config, {
    appRoomId: String(assignment.app_room_id ?? ""),
    eventType: "assignment_failed",
    livekitRoomName: String(assignment.livekit_room_name ?? ""),
    reason: "live_ops_clear_stale_assignment",
  });

  return { assignment: updated[0], status: "cleared" };
}

async function cleanStaleChatCall(config: OpsConfig, target: Record<string, string> | undefined) {
  let callId = target?.callId
    ?? target?.affectedCallId
    ?? target?.communication_room_id
    ?? target?.communicationRoomId
    ?? "";
  let threadId = target?.threadId
    ?? target?.affectedThreadId
    ?? target?.chat_thread_id
    ?? target?.chatThreadId
    ?? "";

  if (!callId && !threadId) {
    throw new Error("missing_chat_call_target");
  }

  let thread: JsonObject | null = null;
  if (threadId) {
    const threadRows = await rest<JsonObject[]>(
      config,
      `chat_threads?id=eq.${encode(threadId)}&select=id,active_communication_room_id,active_call_type,updated_at&limit=1`
    );
    thread = threadRows?.[0] ?? null;
    if (!thread) throw new Error("chat_thread_not_found");
    callId ||= String(thread.active_communication_room_id ?? "");
  }

  if (!callId) {
    throw new Error("missing_chat_call_id");
  }

  if (!thread) {
    const threadRows = await rest<JsonObject[]>(
      config,
      `chat_threads?active_communication_room_id=eq.${encode(callId)}&select=id,active_communication_room_id,active_call_type,updated_at&limit=1`
    );
    thread = threadRows?.[0] ?? null;
    threadId = String(thread?.id ?? threadId ?? "");
  }

  const roomRows = await rest<JsonObject[]>(
    config,
    `communication_rooms?room_id=eq.${encode(callId)}&select=room_id,status,last_activity_at,updated_at,created_at&limit=1`
  );
  const room = roomRows?.[0] ?? null;
  if (!room) {
    throw new Error("chat_call_room_not_found");
  }

  const staleSince = new Date(Date.now() - config.staleChatCallMinAgeSeconds * 1000).toISOString();
  const freshMemberships = await rest<JsonObject[]>(
    config,
    `communication_room_memberships?room_id=eq.${encode(callId)}&membership_state=in.(active,reconnecting)&last_seen_at=gte.${encode(staleSince)}&select=room_id,user_id,last_seen_at,membership_state&limit=1`
  );
  if (freshMemberships.length > 0) {
    throw new Error("fresh_chat_call_membership_not_safe_to_clean");
  }

  const status = String(room.status ?? "");
  const activityTime = Date.parse(String(room.last_activity_at ?? room.updated_at ?? room.created_at ?? ""));
  const isOldEnough = Number.isFinite(activityTime)
    && Date.now() - activityTime >= config.staleChatCallMinAgeSeconds * 1000;
  const safeToClean = status === "ended" || (status === "active" && isOldEnough);
  if (!safeToClean) {
    throw new Error(status === "active" ? "chat_call_not_old_enough_to_clean" : "chat_call_status_not_safe_to_clean");
  }

  const threadReferencesCall = String(thread?.active_communication_room_id ?? "") === callId;
  const result: JsonObject = {
    callId,
    dryRun: config.dryRun,
    roomStatus: status,
    safeToClean,
    staleSince,
    threadId: threadId || null,
    threadReferencesCall,
    wouldClearThreadReference: threadReferencesCall,
    wouldMarkRoomEnded: status === "active",
  };

  if (config.dryRun) {
    return result;
  }

  const nowIso = new Date().toISOString();
  let updatedThread: JsonObject | null = null;
  if (threadReferencesCall && threadId) {
    const rows = await rest<JsonObject[]>(
      config,
      `chat_threads?id=eq.${encode(threadId)}&active_communication_room_id=eq.${encode(callId)}&select=id,active_communication_room_id,active_call_type,updated_at`,
      {
        body: {
          active_call_type: null,
          active_communication_room_id: null,
          updated_at: nowIso,
        },
        method: "PATCH",
        prefer: "return=representation"
      }
    );
    updatedThread = rows?.[0] ?? null;
  }

  let updatedRoom: JsonObject | null = null;
  if (status === "active") {
    const rows = await rest<JsonObject[]>(
      config,
      `communication_rooms?room_id=eq.${encode(callId)}&status=eq.active&select=room_id,status,last_activity_at,updated_at`,
      {
        body: {
          last_activity_at: nowIso,
          status: "ended",
          updated_at: nowIso,
        },
        method: "PATCH",
        prefer: "return=representation"
      }
    );
    updatedRoom = rows?.[0] ?? null;
  }

  return {
    ...result,
    status: "cleaned",
    updatedRoom,
    updatedThread,
  };
}

export async function executeLiveOpsSupabaseAction(plan: ActionPlan, config: OpsConfig) {
  const target = plan.target ?? {};
  switch (plan.actionType) {
    case "drain_livekit_server":
      return await updateServerStatus(config, target.serverId ?? target.server_id ?? "", "draining", "live_ops_fix_center_drain");
    case "block_new_rooms_on_server":
      return await updateServerStatus(config, target.serverId ?? target.server_id ?? "", "maintenance", "live_ops_fix_center_block_new_rooms");
    case "route_to_standby": {
      const badServerId = target.serverId ?? target.server_id ?? "";
      const standby = await chooseFreshStandby(config, target.standbyServerId ?? target.standby_server_id);
      const activated = await updateServerStatus(config, String(standby.server_id), "active", "live_ops_fix_center_standby_activation");
      const drained = badServerId
        ? await updateServerStatus(config, badServerId, "draining", "live_ops_fix_center_route_to_standby")
        : null;
      return { activated, drained, status: "standby_routed" };
    }
    case "clear_stale_room_assignment":
      return await clearStaleAssignment(config, target);
    case "clean_stale_chat_call":
      return await cleanStaleChatCall(config, target);
    default:
      throw new Error("unsupported_live_ops_supabase_action");
  }
}
