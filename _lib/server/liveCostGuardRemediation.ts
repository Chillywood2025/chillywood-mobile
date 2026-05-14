export type ServerLiveCostGuardSeverity = "normal" | "warning" | "high" | "critical" | "emergency";
export type ServerLiveCostGuardActionType =
  | "shorten_token_ttl"
  | "restrict_publish"
  | "remove_participant"
  | "pause_new_live_rooms"
  | "turn_bandwidth_cap_requested"
  | "restore_normal_mode";

export type ServerLiveCostGuardRemediationPlan = {
  actionType: ServerLiveCostGuardActionType | null;
  destructive: boolean;
  reason: string;
};

export function planLiveCostGuardRemediation(severity: ServerLiveCostGuardSeverity): ServerLiveCostGuardRemediationPlan {
  if (severity === "warning") {
    return {
      actionType: "shorten_token_ttl",
      destructive: false,
      reason: "Warning-level cost pressure should shorten only new live/watch-party token TTLs.",
    };
  }
  if (severity === "high") {
    return {
      actionType: "restrict_publish",
      destructive: true,
      reason: "High cost pressure may restrict a targeted publisher only after server-side approval.",
    };
  }
  if (severity === "critical") {
    return {
      actionType: "remove_participant",
      destructive: true,
      reason: "Critical cost pressure may remove a targeted participant only through audited server action.",
    };
  }
  if (severity === "emergency") {
    return {
      actionType: "pause_new_live_rooms",
      destructive: true,
      reason: "Emergency cost pressure pauses new live/watch-party token issuance while existing rooms are reviewed.",
    };
  }
  return {
    actionType: null,
    destructive: false,
    reason: "Normal severity requires no remediation.",
  };
}
