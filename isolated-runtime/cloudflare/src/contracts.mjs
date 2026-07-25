import { RUNTIME_SCHEMA_VERSION } from "./constants.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PRINCIPAL = /^cognitive_[a-z0-9_]{3,80}$/u;
const OPERATION = /^[a-z][a-z0-9_]{2,80}$/u;
const PLATFORMS = new Set(["android", "ios", "web", "shared"]);
const ENVELOPE_KEYS = Object.freeze([
  "deadlineAt",
  "environment",
  "operation",
  "payload",
  "payloadHash",
  "platform",
  "principal",
  "projectId",
  "requestId",
  "schemaVersion",
  "sourceCommit",
  "taskId",
]);
const RESPONSE_KEYS = Object.freeze([
  "operation",
  "principal",
  "requestId",
  "result",
  "resultHash",
  "runtime",
  "schemaVersion",
  "status",
]);

export const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
};

const isCanonicalTimestamp = (value) => {
  if (typeof value !== "string") return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
};

export const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

export const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const hashJson = (value) =>
  sha256Hex(JSON.stringify(canonicalize(value)));

export const constantTimeEqual = (left, right) => {
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

export const validateEnvelope = async (
  value,
  now = Date.now(),
  maxFutureMs = 60_000,
  resolvePrincipal = () => null,
) => {
  if (!exactKeys(value, ENVELOPE_KEYS)) {
    return { ok: false, error: "envelope_schema_rejected" };
  }
  const principal = resolvePrincipal(value.principal);
  if (
    !principal ||
    !PRINCIPAL.test(value.principal) ||
    !OPERATION.test(value.operation) ||
    !Object.hasOwn(principal.operations, value.operation) ||
    value.schemaVersion !== RUNTIME_SCHEMA_VERSION ||
    value.environment !== "production" ||
    !PLATFORMS.has(value.platform) ||
    !UUID.test(value.requestId) ||
    !UUID.test(value.taskId) ||
    !UUID.test(value.projectId) ||
    typeof value.sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/u.test(value.sourceCommit) ||
    !isCanonicalTimestamp(value.deadlineAt) ||
    !SHA256.test(value.payloadHash) ||
    !isRecord(value.payload)
  ) {
    return { ok: false, error: "envelope_scope_rejected" };
  }
  const deadline = Date.parse(value.deadlineAt);
  if (deadline <= now || deadline > now + maxFutureMs) {
    return { ok: false, error: "envelope_deadline_rejected" };
  }
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify(value.payload),
  ).byteLength;
  if (payloadBytes < 2 || payloadBytes > principal.maxRequestBytes) {
    return { ok: false, error: "payload_size_rejected" };
  }
  const operation = principal.operations[value.operation];
  if (
    !exactKeys(value.payload, operation.payloadKeys) ||
    value.payload.action !== value.operation
  ) {
    return { ok: false, error: "operation_schema_rejected" };
  }
  if (
    Object.hasOwn(value.payload, "taskId") &&
    value.payload.taskId !== value.taskId
  ) {
    return { ok: false, error: "task_scope_mismatch" };
  }
  if (
    Object.hasOwn(value.payload, "projectId") &&
    value.payload.projectId !== value.projectId
  ) {
    return { ok: false, error: "project_scope_mismatch" };
  }
  if (
    Object.hasOwn(value.payload, "platform") &&
    value.payload.platform !== value.platform
  ) {
    return { ok: false, error: "platform_scope_mismatch" };
  }
  if (
    Object.hasOwn(value.payload, "environment") &&
    value.payload.environment !== value.environment
  ) {
    return { ok: false, error: "environment_scope_mismatch" };
  }
  const payloadHash = await hashJson(value.payload);
  if (!constantTimeEqual(payloadHash, value.payloadHash)) {
    return { ok: false, error: "payload_hash_mismatch" };
  }
  return { ok: true, principal, operation };
};

export const makeResponse = async ({
  envelope,
  result,
  runtime,
  status,
}) => {
  const encodedResult = JSON.stringify(result);
  if (
    encodedResult === undefined ||
    new TextEncoder().encode(encodedResult).byteLength > 98_304
  ) {
    throw new Error("response_payload_rejected");
  }
  const response = {
    operation: envelope.operation,
    principal: envelope.principal,
    requestId: envelope.requestId,
    result,
    resultHash: await hashJson(result),
    runtime,
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    status,
  };
  if (!exactKeys(response, RESPONSE_KEYS)) {
    throw new Error("response_schema_invalid");
  }
  return Object.freeze(response);
};
