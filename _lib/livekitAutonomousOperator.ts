export type LiveKitOperatorSurface =
  | "chat_call"
  | "heartbeat_monitor"
  | "host_agent"
  | "live_stage"
  | "livekit_router"
  | "livekit_token"
  | "party_room_live_sidecar"
  | "watch_party_live";

export type LiveKitOperatorHealthState =
  | "camera_track_missing"
  | "app_token_validation_regression"
  | "backend_router_regression"
  | "capacity_counter_stale"
  | "capacity_full"
  | "degraded"
  | "deployment_regression"
  | "fallback_flash_regression"
  | "function_blob_missing"
  | "healthy"
  | "heartbeat_regression"
  | "heartbeat_monitor_down"
  | "host_service_down"
  | "no_eligible_server"
  | "render_contract_missing"
  | "render_identity_mismatch"
  | "render_surface_flicker"
  | "renderable_contract_regression"
  | "roster_render_regression"
  | "stale_heartbeat"
  | "surface_mount_regression"
  | "token_issuer_unavailable"
  | "token_time_skew_blocker"
  | "unknown_requires_review"
  | "websocket_unreachable";

export type LiveKitRecoveryLevel = 0 | 1 | 2 | 3 | 4;

export type LiveKitRecoveryAction =
  | "audit_only"
  | "owner_approval_required"
  | "pause_affected_surface"
  | "redeploy_known_edge_function"
  | "refresh_registry_counters"
  | "restart_heartbeat_monitor"
  | "run_heartbeat_monitor"
  | "scoped_assignment_cleanup"
  | "stabilize_client_surface"
  | "unknown_review";

export type LiveKitHealthClassification = {
  confidence: number;
  healthState: LiveKitOperatorHealthState;
  reason: string;
  severity: "info" | "warning" | "critical";
  surface: LiveKitOperatorSurface;
};

export type LiveKitRecoveryPlan = {
  action: LiveKitRecoveryAction;
  autoExecutable: boolean;
  level: LiveKitRecoveryLevel;
  reason: string;
  requiresOwnerApproval: boolean;
  rollbackAvailable: boolean;
  surface: LiveKitOperatorSurface;
};

export type LiveKitRouterServerInput = {
  bandwidthOutMbps?: number | null;
  cpuPercent?: number | null;
  currentParticipants?: number | null;
  currentPublishers?: number | null;
  currentRooms?: number | null;
  heartbeatAgeSeconds?: number | null;
  maxEgressMbps?: number | null;
  maxParticipants?: number | null;
  maxPublishers?: number | null;
  maxRooms?: number | null;
  packetLossPercent?: number | null;
  publicWsUrl?: string | null;
  ramPercent?: number | null;
  serverId?: string | null;
  status?: string | null;
};

export type LiveKitRouterHealthInput = {
  maxBandwidthOutMbps?: number | null;
  maxCpuPercent?: number | null;
  maxPacketLossPercent?: number | null;
  maxRamPercent?: number | null;
  servers: LiveKitRouterServerInput[];
  staleHeartbeatSeconds?: number | null;
};

export type LiveKitHostHealthInput = {
  caddyRunning?: boolean | null;
  dockerRunning?: boolean | null;
  heartbeatMonitorRunning?: boolean | null;
  hostReachable?: boolean | null;
  livekitContainerRunning?: boolean | null;
  websocketReachable?: boolean | null;
};

export type LiveKitFunctionHealthInput = {
  errorCode?: string | null;
  functionName: "livekit-heartbeat-monitor" | "livekit-token" | "livekit-operator";
  httpStatus?: number | null;
  responds?: boolean | null;
};

export type LiveKitRenderHealthInput = {
  activeContractPresent?: boolean | null;
  bubbleGridItemCount?: number | null;
  bubbleGridTrackCount?: number | null;
  canPublish?: boolean | null;
  connectionState?: string | null;
  eventName?: string | null;
  fallbackRosterShown?: boolean | null;
  fallbackShownAfterMs?: number | null;
  hasRenderableContract?: boolean | null;
  nbfDeltaSeconds?: number | null;
  identityMismatchGuarded?: boolean | null;
  renderableContractCleared?: boolean | null;
  renderableContractExpired?: boolean | null;
  rosterParticipantCount?: number | null;
  roomError?: boolean | null;
  roomMismatch?: boolean | null;
  shouldRenderSurface?: boolean | null;
  surface: LiveKitOperatorSurface;
};

export type LiveKitLearningIncident = {
  action: LiveKitRecoveryAction;
  healthState: LiveKitOperatorHealthState;
  recoverySucceeded: boolean;
  surface: LiveKitOperatorSurface;
};

export type LiveKitLearningState = {
  confidence: number;
  lastAction: LiveKitRecoveryAction;
  occurrenceCount: number;
  successCount: number;
};

const DEFAULT_STALE_HEARTBEAT_SECONDS = 120;
const DEFAULT_MAX_CPU_PERCENT = 85;
const DEFAULT_MAX_RAM_PERCENT = 90;
const DEFAULT_MAX_PACKET_LOSS_PERCENT = 8;
const WATCH_PARTY_FALLBACK_FLASH_GRACE_MILLIS = 1_600;

const clampConfidence = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasPublicWsUrl = (value: unknown) => /^wss:\/\/\S+$/i.test(String(value ?? "").trim());

export const classifyLiveKitRouterHealth = (
  input: LiveKitRouterHealthInput,
): LiveKitHealthClassification => {
  const staleSeconds = asNumber(input.staleHeartbeatSeconds) ?? DEFAULT_STALE_HEARTBEAT_SECONDS;
  const maxCpu = asNumber(input.maxCpuPercent) ?? DEFAULT_MAX_CPU_PERCENT;
  const maxRam = asNumber(input.maxRamPercent) ?? DEFAULT_MAX_RAM_PERCENT;
  const maxPacketLoss = asNumber(input.maxPacketLossPercent) ?? DEFAULT_MAX_PACKET_LOSS_PERCENT;
  const maxBandwidth = asNumber(input.maxBandwidthOutMbps) ?? 0;
  const servers = Array.isArray(input.servers) ? input.servers : [];

  if (!servers.length) {
    return {
      confidence: 0.98,
      healthState: "no_eligible_server",
      reason: "no_servers_registered",
      severity: "critical",
      surface: "livekit_router",
    };
  }

  const reasons = new Map<LiveKitOperatorHealthState, number>();
  let eligibleCount = 0;

  servers.forEach((server) => {
    const status = String(server.status ?? "").trim();
    const heartbeatAge = asNumber(server.heartbeatAgeSeconds);
    const currentRooms = asNumber(server.currentRooms) ?? 0;
    const maxRooms = asNumber(server.maxRooms) ?? 1;
    const currentParticipants = asNumber(server.currentParticipants) ?? 0;
    const maxParticipants = asNumber(server.maxParticipants) ?? 1;
    const currentPublishers = asNumber(server.currentPublishers) ?? 0;
    const maxPublishers = asNumber(server.maxPublishers);
    const cpu = asNumber(server.cpuPercent);
    const ram = asNumber(server.ramPercent);
    const packetLoss = asNumber(server.packetLossPercent);
    const bandwidthOut = asNumber(server.bandwidthOutMbps);
    const maxEgress = asNumber(server.maxEgressMbps);

    let state: LiveKitOperatorHealthState | null = null;
    if (status !== "active") state = status === "maintenance" ? "degraded" : "no_eligible_server";
    else if (!hasPublicWsUrl(server.publicWsUrl)) state = "websocket_unreachable";
    else if (heartbeatAge === null || heartbeatAge > staleSeconds) state = "stale_heartbeat";
    else if (currentRooms >= maxRooms || currentParticipants >= maxParticipants || (maxPublishers !== null && currentPublishers >= maxPublishers)) state = "capacity_full";
    else if (cpu !== null && cpu >= maxCpu) state = "degraded";
    else if (ram !== null && ram >= maxRam) state = "degraded";
    else if (packetLoss !== null && packetLoss >= maxPacketLoss) state = "degraded";
    else if (maxBandwidth > 0 && bandwidthOut !== null && bandwidthOut >= maxBandwidth) state = "degraded";
    else if (maxEgress !== null && bandwidthOut !== null && bandwidthOut >= maxEgress) state = "degraded";

    if (state) {
      reasons.set(state, (reasons.get(state) ?? 0) + 1);
      return;
    }
    eligibleCount += 1;
  });

  if (eligibleCount > 0) {
    return {
      confidence: 0.96,
      healthState: reasons.size ? "degraded" : "healthy",
      reason: reasons.size ? "eligible_server_available_with_degraded_peers" : "eligible_server_available",
      severity: reasons.size ? "warning" : "info",
      surface: "livekit_router",
    };
  }

  const [topState] = [...reasons.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? ["unknown_requires_review", 0];
  return {
    confidence: 0.94,
    healthState: topState,
    reason: topState === "stale_heartbeat" ? "all_candidates_stale_heartbeat" : "no_eligible_server_candidates",
    severity: "critical",
    surface: "livekit_router",
  };
};

export const classifyLiveKitHostHealth = (
  input: LiveKitHostHealthInput,
): LiveKitHealthClassification => {
  if (input.hostReachable === false || input.dockerRunning === false || input.livekitContainerRunning === false) {
    return {
      confidence: 0.94,
      healthState: "host_service_down",
      reason: "host_or_livekit_service_down",
      severity: "critical",
      surface: "host_agent",
    };
  }
  if (input.caddyRunning === false || input.websocketReachable === false) {
    return {
      confidence: 0.9,
      healthState: "websocket_unreachable",
      reason: "public_livekit_websocket_unreachable",
      severity: "critical",
      surface: "host_agent",
    };
  }
  if (input.heartbeatMonitorRunning === false) {
    return {
      confidence: 0.9,
      healthState: "heartbeat_monitor_down",
      reason: "heartbeat_monitor_service_not_running",
      severity: "warning",
      surface: "heartbeat_monitor",
    };
  }
  return {
    confidence: 0.9,
    healthState: "healthy",
    reason: "host_services_healthy",
    severity: "info",
    surface: "host_agent",
  };
};

export const classifyLiveKitFunctionHealth = (
  input: LiveKitFunctionHealthInput,
): LiveKitHealthClassification => {
  const normalizedError = String(input.errorCode ?? "").trim().toUpperCase();
  const surface: LiveKitOperatorSurface = input.functionName === "livekit-heartbeat-monitor"
    ? "heartbeat_monitor"
    : input.functionName === "livekit-token"
      ? "livekit_token"
      : "livekit_router";

  if (normalizedError === "NOT_FOUND_FUNCTION_BLOB") {
    return {
      confidence: 0.98,
      healthState: "function_blob_missing",
      reason: `${input.functionName}_function_blob_missing`,
      severity: "critical",
      surface,
    };
  }

  if (input.responds === false || (typeof input.httpStatus === "number" && input.httpStatus >= 500)) {
    return {
      confidence: 0.9,
      healthState: input.functionName === "livekit-token" ? "token_issuer_unavailable" : "heartbeat_monitor_down",
      reason: `${input.functionName}_unavailable`,
      severity: "critical",
      surface,
    };
  }

  return {
    confidence: 0.92,
    healthState: "healthy",
    reason: `${input.functionName}_responding`,
    severity: "info",
    surface,
  };
};

export const classifyLiveKitRenderHealth = (
  input: LiveKitRenderHealthInput,
): LiveKitHealthClassification => {
  const fallbackShownAfterMs = asNumber(input.fallbackShownAfterMs);
  const nbfDeltaSeconds = asNumber(input.nbfDeltaSeconds);
  const hasRenderableContract = input.hasRenderableContract === true && input.renderableContractExpired !== true;
  const eventName = String(input.eventName ?? "").trim();

  if (eventName === "livekit_token_nbf_future_grace_used" && nbfDeltaSeconds !== null && nbfDeltaSeconds >= 0 && nbfDeltaSeconds <= 5) {
    return {
      confidence: 0.96,
      healthState: "healthy",
      reason: "token_nbf_future_within_grace",
      severity: "info",
      surface: input.surface,
    };
  }

  if (eventName === "livekit_token_nbf_rejected" || (nbfDeltaSeconds !== null && nbfDeltaSeconds > 5)) {
    return {
      confidence: 0.96,
      healthState: nbfDeltaSeconds !== null && nbfDeltaSeconds > 5 ? "token_time_skew_blocker" : "app_token_validation_regression",
      reason: nbfDeltaSeconds !== null && nbfDeltaSeconds > 5 ? "token_nbf_future_beyond_grace" : "fresh_token_rejected_by_client",
      severity: "critical",
      surface: input.surface,
    };
  }

  if (input.renderableContractCleared && hasRenderableContract) {
    return {
      confidence: 0.95,
      healthState: "renderable_contract_regression",
      reason: "renderable_contract_cleared_while_valid",
      severity: "critical",
      surface: input.surface,
    };
  }

  if (input.roomError || input.roomMismatch || input.renderableContractExpired) {
    return {
      confidence: 0.92,
      healthState: "render_contract_missing",
      reason: input.roomError ? "hard_room_error" : input.roomMismatch ? "room_mismatch" : "expired_renderable_contract",
      severity: "warning",
      surface: input.surface,
    };
  }

  if (hasRenderableContract && input.fallbackRosterShown && (fallbackShownAfterMs === null || fallbackShownAfterMs < WATCH_PARTY_FALLBACK_FLASH_GRACE_MILLIS)) {
    return {
      confidence: 0.95,
      healthState: "fallback_flash_regression",
      reason: "fallback_roster_shown_during_renderable_contract_grace_window",
      severity: "warning",
      surface: input.surface,
    };
  }

  if (hasRenderableContract && input.shouldRenderSurface === false) {
    return {
      confidence: 0.94,
      healthState: input.activeContractPresent ? "surface_mount_regression" : "render_contract_missing",
      reason: "renderable_contract_exists_but_surface_not_mounted",
      severity: "critical",
      surface: input.surface,
    };
  }

  if (input.identityMismatchGuarded === false) {
    return {
      confidence: 0.9,
      healthState: "render_identity_mismatch",
      reason: "identity_mismatch_not_guarded",
      severity: "critical",
      surface: input.surface,
    };
  }

  if (input.canPublish && (asNumber(input.bubbleGridTrackCount) ?? 0) === 0 && (asNumber(input.bubbleGridItemCount) ?? 0) > 0) {
    return {
      confidence: 0.86,
      healthState: "camera_track_missing",
      reason: "publish_capable_participant_waiting_for_camera_track",
      severity: "warning",
      surface: input.surface,
    };
  }

  if ((asNumber(input.rosterParticipantCount) ?? 0) > 0 && (asNumber(input.bubbleGridItemCount) ?? 0) === 0) {
    return {
      confidence: 0.88,
      healthState: "roster_render_regression",
      reason: "roster_participants_exist_but_bubble_grid_empty",
      severity: "warning",
      surface: input.surface,
    };
  }

  return {
    confidence: 0.9,
    healthState: "healthy",
    reason: "render_surface_stable",
    severity: "info",
    surface: input.surface,
  };
};

export const classifyLiveKitSurfaceHealth = (
  surface: LiveKitOperatorSurface,
  states: LiveKitHealthClassification[],
): LiveKitHealthClassification => {
  const scoped = states.filter((state) => state.surface === surface || state.surface === "livekit_router" || state.surface === "livekit_token");
  const blocker = scoped.find((state) => state.severity === "critical")
    ?? scoped.find((state) => state.severity === "warning")
    ?? scoped[0];
  if (blocker) return { ...blocker, surface };
  return {
    confidence: 0.8,
    healthState: "unknown_requires_review",
    reason: "surface_not_observed",
    severity: "warning",
    surface,
  };
};

export const planLiveKitRecoveryAction = (
  classification: LiveKitHealthClassification,
): LiveKitRecoveryPlan => {
  const base = {
    reason: classification.reason,
    surface: classification.surface,
  };

  switch (classification.healthState) {
    case "healthy":
      return { ...base, action: "audit_only", autoExecutable: true, level: 0, requiresOwnerApproval: false, rollbackAvailable: false };
    case "stale_heartbeat":
      return { ...base, action: "run_heartbeat_monitor", autoExecutable: true, level: 1, requiresOwnerApproval: false, rollbackAvailable: true };
    case "function_blob_missing":
      return { ...base, action: "redeploy_known_edge_function", autoExecutable: true, level: 2, requiresOwnerApproval: false, rollbackAvailable: true };
    case "heartbeat_monitor_down":
      return { ...base, action: "restart_heartbeat_monitor", autoExecutable: true, level: 2, requiresOwnerApproval: false, rollbackAvailable: true };
    case "capacity_counter_stale":
      return { ...base, action: "refresh_registry_counters", autoExecutable: true, level: 1, requiresOwnerApproval: false, rollbackAvailable: true };
    case "capacity_full":
      return { ...base, action: "pause_affected_surface", autoExecutable: true, level: 2, requiresOwnerApproval: false, rollbackAvailable: true };
    case "render_surface_flicker":
    case "fallback_flash_regression":
    case "renderable_contract_regression":
    case "surface_mount_regression":
    case "roster_render_regression":
    case "app_token_validation_regression":
    case "camera_track_missing":
    case "render_contract_missing":
      return { ...base, action: "stabilize_client_surface", autoExecutable: true, level: 1, requiresOwnerApproval: false, rollbackAvailable: true };
    case "token_time_skew_blocker":
    case "backend_router_regression":
    case "heartbeat_regression":
    case "deployment_regression":
      return { ...base, action: "owner_approval_required", autoExecutable: false, level: 3, requiresOwnerApproval: true, rollbackAvailable: false };
    case "host_service_down":
    case "websocket_unreachable":
      return { ...base, action: "owner_approval_required", autoExecutable: false, level: 3, requiresOwnerApproval: true, rollbackAvailable: false };
    default:
      return { ...base, action: "unknown_review", autoExecutable: false, level: 3, requiresOwnerApproval: true, rollbackAvailable: false };
  }
};

export const canAutoExecuteLiveKitRecovery = (
  plan: LiveKitRecoveryPlan,
  options?: {
    hostProofHealthy?: boolean;
    operatorTokenValid?: boolean;
    scopedAction?: boolean;
  },
) => {
  if (plan.requiresOwnerApproval || plan.level >= 3) return false;
  if (options?.operatorTokenValid === false || options?.scopedAction === false) return false;
  if (
    (plan.action === "restart_heartbeat_monitor" || plan.action === "run_heartbeat_monitor" || plan.action === "refresh_registry_counters")
    && options?.hostProofHealthy === false
  ) return false;
  return plan.autoExecutable;
};

export const updateLiveKitOperatorLearningState = (
  previous: LiveKitLearningState | null | undefined,
  incident: LiveKitLearningIncident,
): LiveKitLearningState => {
  const occurrenceCount = (previous?.occurrenceCount ?? 0) + 1;
  const successCount = (previous?.successCount ?? 0) + (incident.recoverySucceeded ? 1 : 0);
  const successRate = successCount / Math.max(occurrenceCount, 1);
  const priorConfidence = previous?.confidence ?? 0.5;
  const confidence = clampConfidence((priorConfidence * 0.45) + (successRate * 0.55));
  return {
    confidence,
    lastAction: incident.action,
    occurrenceCount,
    successCount,
  };
};

export const sanitizeLiveKitOperatorProof = <T extends Record<string, unknown>>(proof: T) => {
  const redacted: Record<string, unknown> = {};
  Object.entries(proof).forEach(([key, value]) => {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("secret")
      || normalized.includes("token")
      || normalized.includes("password")
      || normalized.includes("key")
      || normalized.includes("authorization")
    ) {
      redacted[key] = "[redacted]";
      return;
    }
    if (typeof value === "string") {
      redacted[key] = value.replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");
      return;
    }
    redacted[key] = value;
  });
  return redacted as T;
};

export const LIVEKIT_AUTONOMOUS_OPERATOR_SURFACES: LiveKitOperatorSurface[] = [
  "live_stage",
  "watch_party_live",
  "party_room_live_sidecar",
  "chat_call",
  "livekit_token",
  "livekit_router",
  "heartbeat_monitor",
  "host_agent",
];

export const WATCH_PARTY_LIVEKIT_FALLBACK_ROSTER_GRACE_MILLIS = WATCH_PARTY_FALLBACK_FLASH_GRACE_MILLIS;
