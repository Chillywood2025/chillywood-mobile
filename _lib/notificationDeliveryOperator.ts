import {
  assertNoForbiddenScopedOperatorMutation,
  buildScopedOperatorApprovalRequest,
  buildScopedOperatorPlan,
  canAutoExecuteScopedOperatorAction,
  sanitizeScopedOperatorProof,
  type ScopedOperatorActionDefinition,
} from "./scopedAutonomousOperatorShared";

const SYSTEM_ID = "notification_delivery_operator" as const;

export const notificationDeliveryOperatorActions = [
  {
    actionId: "health_snapshot",
    approvalLevel: 1,
    risk: "safe_write",
    allowedWriteScope: ["notification_delivery_health_snapshots", "notification_operator_events"],
    forbiddenScope: ["push send", "preference bypass", "secret output"],
    reason: "record notification delivery health only",
  },
  {
    actionId: "record_delivery_attempt",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["notification_delivery_attempts", "notification_operator_events"],
    forbiddenScope: ["marketing blast sends", "fake system event sends"],
    reason: "record delivery attempt metadata without broad send authority",
  },
  {
    actionId: "mark_token_provider_revoked",
    approvalLevel: 2,
    risk: "safe_write",
    allowedWriteScope: ["user_push_tokens disabled/revoked only with DeviceNotRegistered evidence", "notification_required_review_flags"],
    forbiddenScope: ["token deletion without provider evidence", "push credential mutation"],
    reason: "device token cleanup is allowed only after provider DeviceNotRegistered evidence",
  },
  {
    actionId: "push_blast_or_campaign_send",
    approvalLevel: 3,
    risk: "approval_required",
    allowedWriteScope: ["owner-approved campaign scope only"],
    forbiddenScope: ["bypass notification preferences", "broad user messaging without approval"],
    reason: "broad notification sends require owner/super-admin approval",
  },
] as const satisfies readonly ScopedOperatorActionDefinition[];

export const classifyNotificationDeliveryHealth = (input: { providerStatus?: string; retryBacklog?: number }) => {
  if (input.providerStatus === "outage") return "outage";
  if ((input.retryBacklog ?? 0) > 100) return "degraded";
  return "healthy";
};

export const classifyNotificationDeliveryApprovalLevel = (actionId: string) => (
  buildScopedOperatorPlan(
    SYSTEM_ID,
    actionId,
    notificationDeliveryOperatorActions,
    "mark notification event/review rows superseded; never delete provider evidence",
    "notification_delivery_operator emergency stop blocks safe writes; read/report remains available",
    3,
  ).approvalLevel
);

export const buildNotificationDeliveryPlan = (actionId: string) => buildScopedOperatorPlan(
  SYSTEM_ID,
  actionId,
  notificationDeliveryOperatorActions,
  "mark notification event/review rows superseded; never delete provider evidence",
  "notification_delivery_operator emergency stop blocks safe writes; read/report remains available",
  3,
);

export const canAutoExecuteNotificationDelivery = (actionId: string) => (
  canAutoExecuteScopedOperatorAction(buildNotificationDeliveryPlan(actionId))
);

export const buildNotificationDeliveryApprovalRequest = (actionId: string, metadata: Record<string, unknown> = {}) => (
  buildScopedOperatorApprovalRequest(
    buildNotificationDeliveryPlan(actionId),
    "Notification Delivery Operator approval request",
    "Run proof:notification-delivery-operator and guard:notification-delivery-operator before execution.",
    "Re-run provider/preference preflight, verify exact scope, and confirm emergency_stop is false.",
    metadata,
  )
);

export const sanitizeNotificationDeliveryProof = sanitizeScopedOperatorProof;

export const assertNoForbiddenNotificationDeliveryMutation = (actionId: string) => (
  assertNoForbiddenScopedOperatorMutation(buildNotificationDeliveryPlan(actionId), "notification_delivery_operator")
);
