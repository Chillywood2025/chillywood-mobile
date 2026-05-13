import { deleteRoom, removeParticipant } from "./livekitAdmin.js";
import { runAllowedScript } from "./shell.js";
import type { OpsConfig } from "./config.js";
import type { AlertmanagerAlert } from "./jobs.js";

export type ActionType =
  | "turn_caps"
  | "delete_room"
  | "remove_participant"
  | "network_throttle"
  | "observe"
  | "noop";

export type ActionPlan = {
  actionType: ActionType;
  alertname: string;
  summary: string;
  requiresApproval: boolean;
  requiresLiveActions: boolean;
  requiresNetShaping: boolean;
  destructive: boolean;
  valid: boolean;
  blockedReason?: string;
  target?: Record<string, string>;
  plannedCommands?: string[];
};

function alertName(alert: AlertmanagerAlert): string {
  return alert.labels.alertname || "unknown";
}

function isFiring(alert: AlertmanagerAlert): boolean {
  return (alert.status ?? "firing") === "firing";
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

  if (plan.requiresLiveActions && !config.allowLiveActions) {
    throw new Error("blocked_by_safety: ALLOW_LIVE_ACTIONS=false");
  }

  if (plan.requiresNetShaping && !config.allowNetShaping) {
    throw new Error("blocked_by_safety: ALLOW_NET_SHAPING=false");
  }

  if (config.dryRun) {
    return {
      dryRun: true,
      actionType: plan.actionType,
      target: plan.target ?? {},
      plannedCommands: plan.plannedCommands ?? []
    };
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
    case "observe":
    case "noop":
      return { observed: true, actionType: plan.actionType };
    default:
      throw new Error("unsupported_action_type");
  }
}
