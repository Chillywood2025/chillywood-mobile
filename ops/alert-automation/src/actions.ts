import { deleteRoom, removeParticipant } from "./livekitAdmin.js";
import { runAllowedScript } from "./shell.js";
import type { OpsConfig } from "./config.js";
import type { AlertmanagerAlert } from "./jobs.js";
import { createGithubDraftPullRequest, createGithubIssue, rerunGithubActionsJob } from "./github.js";
import {
  classifyLiveOpsIncident,
  type LiveOpsActionType,
  type LiveOpsIncidentPlan
} from "./liveOps.js";
import { executeLiveOpsSupabaseAction } from "./supabaseOps.js";

export type ActionType =
  | "turn_caps"
  | "delete_room"
  | "remove_participant"
  | "network_throttle"
  | "observe"
  | LiveOpsActionType
  | "noop";

export type ActionPlan = {
  actionType: ActionType;
  alertname: string;
  summary: string;
  requiresApproval: boolean;
  requiresGithubActions?: boolean;
  requiresInfraActions?: boolean;
  requiresLiveActions: boolean;
  requiresLiveOpsRegistryActions?: boolean;
  requiresNetShaping: boolean;
  destructive: boolean;
  valid: boolean;
  blockedReason?: string;
  liveOpsIncident?: LiveOpsIncidentPlan;
  target?: Record<string, string>;
  plannedCommands?: string[];
};

function alertName(alert: AlertmanagerAlert): string {
  return alert.labels.alertname || "unknown";
}

function isFiring(alert: AlertmanagerAlert): boolean {
  return (alert.status ?? "firing") === "firing";
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function liveOpsTarget(alert: AlertmanagerAlert, incident: LiveOpsIncidentPlan): Record<string, string> {
  const metadata = incident.metadata;
  const target: Record<string, string> = {};
  const pairs: Record<string, unknown> = {
    appRoomId: metadata.app_room_id,
    assignmentId: metadata.assignment_id,
    affectedCallId: incident.affectedCallId,
    affectedThreadId: incident.affectedThreadId,
    callId: incident.affectedCallId ?? metadata.call_id ?? metadata.communication_room_id,
    callMode: incident.callMode ?? metadata.call_mode,
    fixBranch: metadata.fix_branch,
    githubJobId: metadata.github_job_id,
    livekitRoomName: metadata.livekit_room_name ?? metadata.room,
    room: metadata.room,
    serverId: metadata.server_id ?? incident.affectedServerId,
    standbyServerId: metadata.standby_server_id,
    threadId: incident.affectedThreadId ?? metadata.thread_id ?? metadata.chat_thread_id,
  };

  for (const [key, value] of Object.entries(pairs)) {
    const normalized = text(value);
    if (normalized) target[key] = normalized;
  }

  target.affectedRoute = incident.affectedRoute;
  target.affectedPurpose = incident.affectedPurpose;
  target.affectedPlatform = incident.affectedPlatform;
  if (incident.affectedRooms[0]) target.room = incident.affectedRooms[0];
  return target;
}

function liveOpsPlan(alert: AlertmanagerAlert, incident: LiveOpsIncidentPlan): ActionPlan {
  const target = liveOpsTarget(alert, incident);
  const actionType = incident.recommendedAction;
  const requiresGithubActions =
    actionType === "create_github_issue"
    || actionType === "create_github_pr"
    || actionType === "rerun_github_actions_job";
  const requiresLiveOpsRegistryActions =
    actionType === "drain_livekit_server"
    || actionType === "block_new_rooms_on_server"
    || actionType === "route_to_standby"
    || actionType === "clear_stale_room_assignment"
    || actionType === "clean_stale_chat_call";
  const requiresInfraActions =
    actionType === "restart_livekit_service"
    || actionType === "rollback_last_infra_deploy";
  const missingServer =
    (actionType === "drain_livekit_server" || actionType === "block_new_rooms_on_server")
    && !target.serverId;
  const missingGithubJob = actionType === "rerun_github_actions_job" && !target.githubJobId;
  const missingFixBranch = actionType === "create_github_pr" && !target.fixBranch;
  const missingAssignment =
    actionType === "clear_stale_room_assignment"
    && !target.assignmentId
    && !target.appRoomId
    && !target.livekitRoomName
    && !target.room;
  const missingChatCall =
    actionType === "clean_stale_chat_call"
    && !target.callId
    && !target.affectedCallId
    && !target.threadId
    && !target.affectedThreadId;

  return {
    actionType,
    alertname: alertName(alert),
    blockedReason: missingServer
      ? "missing_server_id"
      : missingGithubJob
        ? "missing_github_job_id"
        : missingFixBranch
          ? "missing_fix_branch"
          : missingAssignment
            ? "missing_assignment_target"
            : missingChatCall
              ? "missing_chat_call_target"
              : undefined,
    destructive: requiresLiveOpsRegistryActions || requiresInfraActions,
    liveOpsIncident: incident,
    plannedCommands: requiresInfraActions
      ? [
          actionType === "restart_livekit_service"
            ? "scripts/livekit-restart.sh"
            : "scripts/livekit-rollback.sh"
        ]
      : undefined,
    requiresApproval: true,
    requiresGithubActions,
    requiresInfraActions,
    requiresLiveActions: false,
    requiresLiveOpsRegistryActions,
    requiresNetShaping: false,
    summary: incident.suggestedFix,
    target,
    valid: !(missingServer || missingGithubJob || missingFixBranch || missingAssignment || missingChatCall)
  };
}

function liveOpsIssueBody(incident: LiveOpsIncidentPlan, plan: ActionPlan): string {
  return [
    "## Live Ops Incident",
    "",
    `- Route: ${incident.affectedRoute}`,
    `- Purpose: ${incident.affectedPurpose}`,
    `- Call mode: ${incident.callMode ?? "not supplied"}`,
    `- Platform: ${incident.affectedPlatform}`,
    `- Rooms: ${incident.affectedRooms.length ? incident.affectedRooms.join(", ") : "not supplied"}`,
    `- Thread: ${incident.affectedThreadId ?? "not supplied"}`,
    `- Call: ${incident.affectedCallId ?? "not supplied"}`,
    `- Server: ${incident.affectedServerId ?? plan.target?.serverId ?? "not supplied"}`,
    `- Likely cause: ${incident.likelyCause}`,
    `- Confidence: ${incident.confidence}`,
    `- Risk: ${incident.riskLevel}`,
    "",
    "## Symptoms",
    ...incident.detectedSymptoms.map((symptom) => `- ${symptom}`),
    "",
    "## Suggested Fix",
    incident.suggestedFix,
    "",
    "## Guardrails",
    "- Do not redesign Live Stage, Watch-Party Live, Chi'lly Chat, or chat call UI.",
    "- Do not change room layouts, call layouts, call permissions, or premium gates.",
    "- Do not add fake participants, fake calls, fake stats, or fake health.",
    "- Do not auto-merge or auto-deploy production code.",
    "",
    `Runbook: ${incident.runbookUrl ?? incident.runbookPath}`,
  ].join("\n");
}

export function planAction(alert: AlertmanagerAlert, config: OpsConfig): ActionPlan {
  const name = alertName(alert);

  if (!isFiring(alert)) {
    return {
      actionType: "noop",
      alertname: name,
      summary: "Resolved alert recorded as no-op.",
      requiresApproval: false,
      requiresLiveActions: false,
      requiresNetShaping: false,
      destructive: false,
      valid: true
    };
  }

  const liveOpsIncident = classifyLiveOpsIncident(alert);
  if (liveOpsIncident) {
    return liveOpsPlan(alert, liveOpsIncident);
  }

  switch (name) {
    case "TurnAllocationSurge":
      return {
        actionType: "turn_caps",
        alertname: name,
        summary: "Apply TURN caps script and optionally network shaping.",
        requiresApproval: true,
        requiresLiveActions: false,
        requiresNetShaping: true,
        destructive: true,
        valid: true,
        target: {
          interface: config.netThrottleInterface ?? "",
          rate: config.netThrottleRate ?? "",
          turnConfigPath: config.turnConfigPath ?? ""
        },
        plannedCommands: [
          "scripts/turn-cap.sh",
          ...(config.netThrottleInterface && config.netThrottleRate
            ? [`scripts/net-throttle.sh ${config.netThrottleInterface} ${config.netThrottleRate}`]
            : ["network throttle skipped until NET_THROTTLE_INTERFACE and NET_THROTTLE_RATE are set"])
        ]
      };
    case "RoomZombieStuck": {
      const room = alert.labels.room;
      return {
        actionType: "delete_room",
        alertname: name,
        summary: "Delete a stuck LiveKit room.",
        requiresApproval: true,
        requiresLiveActions: true,
        requiresNetShaping: false,
        destructive: true,
        valid: Boolean(room),
        blockedReason: room ? undefined : "missing_room_label",
        target: { room: room ?? "" }
      };
    }
    case "PublisherFlood": {
      const room = alert.labels.room;
      const identity = alert.labels.identity;
      return {
        actionType: "remove_participant",
        alertname: name,
        summary: "Remove a flooding LiveKit participant.",
        requiresApproval: true,
        requiresLiveActions: true,
        requiresNetShaping: false,
        destructive: true,
        valid: Boolean(room && identity),
        blockedReason: room && identity ? undefined : "missing_room_or_identity_label",
        target: { room: room ?? "", identity: identity ?? "" }
      };
    }
    case "LiveKitHighEgress":
      return {
        actionType: "network_throttle",
        alertname: name,
        summary: "Propose network throttle for high Egress load.",
        requiresApproval: true,
        requiresLiveActions: false,
        requiresNetShaping: true,
        destructive: true,
        valid: Boolean(config.netThrottleInterface && config.netThrottleRate),
        blockedReason:
          config.netThrottleInterface && config.netThrottleRate
            ? undefined
            : "missing_network_shaping_target",
        target: {
          interface: config.netThrottleInterface ?? "",
          rate: config.netThrottleRate ?? ""
        },
        plannedCommands:
          config.netThrottleInterface && config.netThrottleRate
            ? [`scripts/net-throttle.sh ${config.netThrottleInterface} ${config.netThrottleRate}`]
            : ["set NET_THROTTLE_INTERFACE and NET_THROTTLE_RATE before any real shaping"]
      };
    case "ServerCpuMemoryPressure":
      return {
        actionType: "observe",
        alertname: name,
        summary: "Observe and log server pressure only.",
        requiresApproval: false,
        requiresLiveActions: false,
        requiresNetShaping: false,
        destructive: false,
        valid: true
      };
    default:
      return {
        actionType: "noop",
        alertname: name,
        summary: "Unknown alert recorded as no-op.",
        requiresApproval: false,
        requiresLiveActions: false,
        requiresNetShaping: false,
        destructive: false,
        valid: true
      };
  }
}

export async function executeAction(
  plan: ActionPlan,
  config: OpsConfig
): Promise<Record<string, unknown>> {
  if (!plan.valid) {
    throw new Error(plan.blockedReason ?? "invalid_action_plan");
  }

  if (config.dryRun) {
    if (plan.actionType === "clean_stale_chat_call" && config.supabaseUrl && config.supabaseServiceRoleKey) {
      return await executeLiveOpsSupabaseAction(plan, config);
    }
    return {
      dryRun: true,
      actionType: plan.actionType,
      target: plan.target ?? {},
      plannedCommands: plan.plannedCommands ?? []
    };
  }

  if (plan.requiresLiveActions && !config.allowLiveActions) {
    throw new Error("blocked_by_safety: ALLOW_LIVE_ACTIONS=false");
  }

  if (plan.requiresNetShaping && !config.allowNetShaping) {
    throw new Error("blocked_by_safety: ALLOW_NET_SHAPING=false");
  }

  if (plan.requiresGithubActions && !config.allowGithubActions) {
    throw new Error("blocked_by_safety: ALLOW_GITHUB_ACTIONS=false");
  }

  if (plan.requiresLiveOpsRegistryActions && !config.allowLiveOpsRegistryActions) {
    throw new Error("blocked_by_safety: ALLOW_LIVE_OPS_REGISTRY_ACTIONS=false");
  }

  if (plan.requiresInfraActions && !config.allowInfraActions) {
    throw new Error("blocked_by_safety: ALLOW_INFRA_ACTIONS=false");
  }

  switch (plan.actionType) {
    case "delete_room":
      return await deleteRoom(config, plan.target?.room ?? "", { dryRun: false });
    case "remove_participant":
      return await removeParticipant(config, plan.target?.room ?? "", plan.target?.identity ?? "", {
        dryRun: false
      });
    case "turn_caps": {
      const turnResult = await runAllowedScript(
        "turn-cap.sh",
        [],
        {
          RUN_OPS_SCRIPT: "1",
          DRY_RUN: config.dryRun ? "1" : "0",
          TURN_CONFIG_PATH: config.turnConfigPath
        }
      );
      const throttleResult =
        config.netThrottleInterface && config.netThrottleRate
          ? await runAllowedScript(
              "net-throttle.sh",
              [config.netThrottleInterface, config.netThrottleRate],
              {
                RUN_OPS_SCRIPT: "1",
                DRY_RUN: config.dryRun ? "1" : "0"
              }
            )
          : undefined;

      return { turnResult, throttleResult };
    }
    case "network_throttle":
      return await runAllowedScript(
        "net-throttle.sh",
        [plan.target?.interface ?? "", plan.target?.rate ?? ""],
        {
          RUN_OPS_SCRIPT: "1",
          DRY_RUN: config.dryRun ? "1" : "0"
        }
      );
    case "create_github_issue": {
      if (!plan.liveOpsIncident) throw new Error("missing_live_ops_incident");
      return await createGithubIssue(config, {
        body: liveOpsIssueBody(plan.liveOpsIncident, plan),
        labels: ["live-ops", "reliability"],
        title: `Live Ops: ${plan.liveOpsIncident.title}`
      });
    }
    case "create_github_pr": {
      if (!plan.liveOpsIncident) throw new Error("missing_live_ops_incident");
      const fixBranch = plan.target?.fixBranch ?? "";
      if (!fixBranch) throw new Error("missing_fix_branch");
      return await createGithubDraftPullRequest(config, {
        body: liveOpsIssueBody(plan.liveOpsIncident, plan),
        headBranch: fixBranch,
        title: `Live Ops Fix: ${plan.liveOpsIncident.title}`
      });
    }
    case "rerun_github_actions_job":
      return await rerunGithubActionsJob(config, plan.target?.githubJobId ?? "");
    case "drain_livekit_server":
    case "block_new_rooms_on_server":
    case "route_to_standby":
    case "clear_stale_room_assignment":
    case "clean_stale_chat_call":
      return await executeLiveOpsSupabaseAction(plan, config);
    case "restart_livekit_service":
      return await runAllowedScript("livekit-restart.sh", [], {
        CONFIRM_LIVEKIT_RESTART: "YES",
        DRY_RUN: config.dryRun ? "1" : "0",
        RUN_OPS_SCRIPT: "1",
      });
    case "rollback_last_infra_deploy":
      return await runAllowedScript("livekit-rollback.sh", [], {
        CONFIRM_LIVEKIT_ROLLBACK: "YES",
        DRY_RUN: config.dryRun ? "1" : "0",
        RUN_OPS_SCRIPT: "1",
      });
    case "observe":
    case "noop":
      return { observed: true, actionType: plan.actionType };
    default:
      throw new Error("unsupported_action_type");
  }
}

export async function createPrOnlyForPlan(plan: ActionPlan, config: OpsConfig): Promise<Record<string, unknown>> {
  if (!plan.liveOpsIncident) {
    throw new Error("missing_live_ops_incident");
  }

  const fixBranch = plan.target?.fixBranch ?? "";
  if (!fixBranch) {
    throw new Error("missing_fix_branch");
  }

  if (config.dryRun) {
    return {
      actionType: "create_github_pr",
      dryRun: true,
      target: {
        baseBranch: config.githubDefaultBranch,
        headBranch: fixBranch,
      }
    };
  }

  if (!config.allowGithubActions) {
    throw new Error("blocked_by_safety: ALLOW_GITHUB_ACTIONS=false");
  }

  return await createGithubDraftPullRequest(config, {
    body: liveOpsIssueBody(plan.liveOpsIncident, plan),
    headBranch: fixBranch,
    title: `Live Ops Fix: ${plan.liveOpsIncident.title}`
  });
}
