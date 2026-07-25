export const PINNED_RESEARCH_HOST_SCHEMA_VERSION =
  "chillywood-pinned-research-host-v1";
export const PINNED_RESEARCH_INVOCATION_KEY_ID =
  "cognitive-public-research-broker-v1";
export const PINNED_RESEARCH_INVOCATION_PATH = "/v1/retrieve";
export const PINNED_RESEARCH_EXTERNAL_PATH =
  "/internal/cognitive-research-transport/v1/retrieve";
export const PINNED_RESEARCH_PROVIDER_ACTIVE = "ACTIVE";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]{1,79}$/u;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length &&
    actual.every((key, index) => key === keys[index]);
};

export const normalizePinnedResearchHostInvocation = (
  value,
  now = Date.now(),
) => {
  if (
    !hasExactKeys(value, [
      "authorityId",
      "deadlineAt",
      "requestId",
      "schemaVersion",
      "url",
    ]) ||
    value.schemaVersion !== PINNED_RESEARCH_HOST_SCHEMA_VERSION ||
    typeof value.authorityId !== "string" ||
    !SAFE_IDENTIFIER.test(value.authorityId) ||
    typeof value.requestId !== "string" ||
    !UUID.test(value.requestId) ||
    typeof value.url !== "string" ||
    value.url.length < 12 ||
    value.url.length > 2_048 ||
    typeof value.deadlineAt !== "string"
  ) {
    return null;
  }
  const deadline = Date.parse(value.deadlineAt);
  if (
    !Number.isFinite(deadline) ||
    deadline <= now ||
    deadline > now + 60_000 ||
    new Date(deadline).toISOString() !== value.deadlineAt
  ) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value.url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.port && parsed.port !== "443") ||
    parsed.toString() !== value.url
  ) {
    return null;
  }
  return Object.freeze({
    authorityId: value.authorityId,
    deadlineAt: value.deadlineAt,
    requestId: value.requestId,
    schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
    url: value.url,
  });
};

export const canonicalPinnedResearchInvocation = ({
  bodySha256,
  nonce,
  timestamp,
}) => {
  if (
    typeof bodySha256 !== "string" ||
    !SHA256.test(bodySha256) ||
    typeof nonce !== "string" ||
    !NONCE.test(nonce) ||
    !Number.isSafeInteger(timestamp)
  ) {
    throw new Error("research_host_invocation_contract_rejected");
  }
  return [
    PINNED_RESEARCH_HOST_SCHEMA_VERSION,
    "request",
    PINNED_RESEARCH_INVOCATION_KEY_ID,
    String(timestamp),
    nonce,
    bodySha256,
  ].join("\n");
};

export const canonicalPinnedResearchResponse = ({
  bodySha256,
  nonce,
  requestId,
  timestamp,
}) => {
  if (
    typeof bodySha256 !== "string" ||
    !SHA256.test(bodySha256) ||
    typeof nonce !== "string" ||
    !NONCE.test(nonce) ||
    typeof requestId !== "string" ||
    !UUID.test(requestId) ||
    !Number.isSafeInteger(timestamp)
  ) {
    throw new Error("research_host_response_contract_rejected");
  }
  return [
    PINNED_RESEARCH_HOST_SCHEMA_VERSION,
    "response",
    PINNED_RESEARCH_INVOCATION_KEY_ID,
    String(timestamp),
    nonce,
    requestId,
    bodySha256,
  ].join("\n");
};

export const invocationHeaderNames = Object.freeze({
  bodySha256: "x-chillywood-research-body-sha256",
  keyId: "x-chillywood-research-key-id",
  nonce: "x-chillywood-research-nonce",
  signature: "x-chillywood-research-signature",
  timestamp: "x-chillywood-research-timestamp",
});

export const responseHeaderNames = Object.freeze({
  bodySha256: "x-chillywood-research-response-body-sha256",
  signature: "x-chillywood-research-response-signature",
});

export const isSha256 = (value) =>
  typeof value === "string" && SHA256.test(value);
