import type { ActionPlan } from "./actions.js";
import { getAlertName, type OpsJob } from "./jobs.js";

const SAFE_LABEL_KEYS = new Set(["alertname", "severity", "room", "identity", "instance", "job", "service"]);
const SAFE_TARGET_KEYS = new Set(["room", "identity", "instance", "job", "service", "interface", "rate"]);

const SENSITIVE_KEY_PATTERN =
  /(authorization|credential|header|hls|jwt|key|password|provider|secret|service_role|smtp|token|url|uri)/i;
const SENSITIVE_TEXT_PATTERN =
  /(https?:\/\/\S+|wss?:\/\/\S+|sha256=[a-f0-9]{32,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,})/g;

export type SafeOpsJob = {
  id: string;
  status: OpsJob["status"];
  alertName: string;
  alertStatus: string;
  labels: Record<string, string>;
  plan: SafeActionPlan;
  createdAt: string;
  updatedAt: string;
  approvalExpiresAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  deniedAt?: string;
  deniedBy?: string;
  executedAt?: string;
  failureReason?: string;
  dryRunResult?: unknown;
  executionResult?: unknown;
  duplicate?: boolean;
};

export type SafeActionPlan = Pick<
  ActionPlan,
  | "actionType"
  | "alertname"
  | "summary"
  | "requiresApproval"
  | "requiresLiveActions"
  | "requiresNetShaping"
  | "destructive"
  | "valid"
> & {
  blockedReason?: string;
  target?: Record<string, string>;
  plannedCommands?: string[];
};

export function redactText(value: string): string {
  return value.replace(SENSITIVE_TEXT_PATTERN, "[redacted]");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[redacted]";
        continue;
      }

      output[key] = sanitizeValue(nestedValue);
    }

    return output;
  }

  return value;
}

function sanitizeRecord(
  record: Record<string, string> | undefined,
  allowedKeys: Set<string>
): Record<string, string> | undefined {
  if (!record) {
    return undefined;
  }

  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!allowedKeys.has(key)) {
      continue;
    }

    safe[key] = redactText(value);
  }

  return safe;
}

export function sanitizeActionPlan(plan: ActionPlan): SafeActionPlan {
  const safeTarget = sanitizeRecord(plan.target, SAFE_TARGET_KEYS);

  return {
    actionType: plan.actionType,
    alertname: plan.alertname,
    summary: redactText(plan.summary),
    requiresApproval: plan.requiresApproval,
    requiresLiveActions: plan.requiresLiveActions,
    requiresNetShaping: plan.requiresNetShaping,
    destructive: plan.destructive,
    valid: plan.valid,
    blockedReason: plan.blockedReason ? redactText(plan.blockedReason) : undefined,
    target: safeTarget,
    plannedCommands: plan.plannedCommands?.map(redactText)
  };
}

export function sanitizeJob(job: OpsJob & { duplicate?: boolean }): SafeOpsJob {
  return {
    id: job.id,
    status: job.status,
    alertName: getAlertName(job.alert),
    alertStatus: job.alert.status ?? "firing",
    labels: sanitizeRecord(job.alert.labels, SAFE_LABEL_KEYS) ?? {},
    plan: sanitizeActionPlan(job.plan),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    approvalExpiresAt: job.approvalExpiresAt,
    approvedAt: job.approvedAt,
    approvedBy: job.approvedBy ? redactText(job.approvedBy) : undefined,
    deniedAt: job.deniedAt,
    deniedBy: job.deniedBy ? redactText(job.deniedBy) : undefined,
    executedAt: job.executedAt,
    failureReason: job.failureReason ? redactText(job.failureReason) : undefined,
    dryRunResult: sanitizeValue(job.dryRunResult),
    executionResult: sanitizeValue(job.executionResult),
    duplicate: job.duplicate
  };
}

export function safeEmailLabels(job: OpsJob): Record<string, string> {
  return sanitizeRecord(job.alert.labels, SAFE_LABEL_KEYS) ?? {};
}
