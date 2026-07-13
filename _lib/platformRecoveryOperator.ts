export const PLATFORM_RECOVERY_OPERATOR_ID = "platform_recovery_operator" as const;

export type PlatformRecoveryFindingClass =
  | "backup_freshness_unknown"
  | "restore_drill_stale"
  | "migration_drift_detected"
  | "function_deployment_drift_detected"
  | "scheduled_timer_unproved"
  | "secret_presence_name_missing"
  | "audit_coverage_gap"
  | "recovery_review_required";

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url)/i;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

const hasLongSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return LONG_SECRET_LIKE_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(hasLongSecretLikeValue);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasLongSecretLikeValue);
  return false;
};

export const sanitizePlatformRecoveryProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizePlatformRecoveryProof);
  if (!value || typeof value !== "object") return typeof value === "string" ? value.replace(LONG_SECRET_LIKE_PATTERN, "[redacted]") : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => !SECRET_KEY_PATTERN.test(key) && !hasLongSecretLikeValue(entry))
    .map(([key, entry]) => [key, sanitizePlatformRecoveryProof(entry)]));
};

export const classifyPlatformRecoveryFinding = (text: string): PlatformRecoveryFindingClass => {
  const normalized = text.toLowerCase();
  if (normalized.includes("restore")) return "restore_drill_stale";
  if (normalized.includes("migration")) return "migration_drift_detected";
  if (normalized.includes("function")) return "function_deployment_drift_detected";
  if (normalized.includes("timer") || normalized.includes("scheduler")) return "scheduled_timer_unproved";
  if (normalized.includes("secret") || normalized.includes("token")) return "secret_presence_name_missing";
  if (normalized.includes("audit")) return "audit_coverage_gap";
  if (normalized.includes("backup")) return "backup_freshness_unknown";
  return "recovery_review_required";
};

export const buildPlatformRecoveryWatchPlan = () => ({
  systemId: PLATFORM_RECOVERY_OPERATOR_ID,
  checks: [
    "database_backup_freshness",
    "restore_drill_freshness",
    "migration_drift_detection",
    "supabase_function_deployment_drift",
    "scheduled_timer_health",
    "operator_token_presence_by_name",
    "audit_log_integrity",
  ],
  forbidden: [
    "production restore without approval",
    "destructive DB mutation",
    "secret rotation without approval",
    "deleting backups",
    "changing provider config",
    "fake backup/restore success",
  ],
});

export const buildPlatformRecoveryOwnerCommand = (finding: PlatformRecoveryFindingClass) => ({
  commandText: `Platform Recovery Operator finding requires safe review: ${finding}.`,
  normalizedIntent: "platform_recovery",
  targetSystems: [PLATFORM_RECOVERY_OPERATOR_ID],
  approvalLevel: 2,
  allowedScope: ["safe status/finding rows", "owner command request", "approval request for high-risk recovery"],
  forbiddenScope: ["production restore", "destructive DB mutation", "secret rotation", "backup deletion", "provider config mutation"],
});
