import { hashJson } from "./contracts.mjs";

const SAFE_STATUSES = new Set([
  "accepted",
  "blocked",
  "completed",
  "failed",
  "rejected",
]);
const SAFE_CATEGORIES = new Set([
  "credential_domain_rejected",
  "database_rejected",
  "deadline_rejected",
  "emergency_stop_rejected",
  "invocation_rejected",
  "operation_completed",
  "payload_rejected",
  "preflight_rejected",
  "revocation_rejected",
  "source_commit_rejected",
]);

export const sanitizedAuditEvent = async ({
  category,
  principal,
  requestId,
  status,
  versionId,
}) => {
  if (
    !SAFE_CATEGORIES.has(category) ||
    !SAFE_STATUSES.has(status) ||
    typeof principal !== "string" ||
    typeof requestId !== "string"
  ) {
    throw new Error("audit_event_rejected");
  }
  return Object.freeze({
    category,
    principal,
    requestHash: await hashJson({ principal, requestId }),
    status,
    timestamp: new Date().toISOString(),
    versionId:
      typeof versionId === "string" && versionId.length <= 128
        ? versionId
        : "unknown",
  });
};

export const writeSanitizedAudit = async (event, logger = console) => {
  logger.log(JSON.stringify(await sanitizedAuditEvent(event)));
};
