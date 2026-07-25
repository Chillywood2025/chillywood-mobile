import { Buffer } from "node:buffer";
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  canonicalPinnedResearchInvocation,
  canonicalPinnedResearchResponse,
  invocationHeaderNames,
  PINNED_RESEARCH_INVOCATION_KEY_ID,
} from "./invocation-contract.mjs";

const SIGNATURE = /^[a-f0-9]{64}$/u;
const HMAC_KEY = /^[a-f0-9]{64}$/u;

export const sha256Hex = (value) =>
  createHash("sha256").update(value).digest("hex");

const sign = (key, value) =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update(value, "utf8")
    .digest("hex");

const constantTimeEqual = (left, right) => {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    left.length !== right.length
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
};

export const normalizeHostHmacKey = (value) =>
  typeof value === "string" && HMAC_KEY.test(value.trim())
    ? value.trim()
    : null;

export const createInvocationReplayGuard = ({
  maximumEntries = 10_000,
  now = Date.now,
  ttlMs = 60_000,
} = {}) => {
  if (
    !Number.isSafeInteger(maximumEntries) ||
    maximumEntries < 1 ||
    maximumEntries > 100_000 ||
    typeof now !== "function" ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 10_000 ||
    ttlMs > 120_000
  ) {
    throw new Error("research_host_replay_guard_rejected");
  }
  const entries = new Map();
  return Object.freeze({
    consume(nonce) {
      const current = now();
      for (const [value, expiresAt] of entries) {
        if (expiresAt <= current) entries.delete(value);
      }
      if (entries.has(nonce) || entries.size >= maximumEntries) return false;
      entries.set(nonce, current + ttlMs);
      return true;
    },
    size() {
      return entries.size;
    },
  });
};

export const authenticateHostInvocation = ({
  body,
  headers,
  hmacKey,
  now = Date.now,
  replayGuard,
}) => {
  const key = normalizeHostHmacKey(hmacKey);
  if (!key || !headers || !replayGuard) return null;
  const keyId = headers[invocationHeaderNames.keyId];
  const nonce = headers[invocationHeaderNames.nonce];
  const rawTimestamp = headers[invocationHeaderNames.timestamp];
  const suppliedBodyHash = headers[invocationHeaderNames.bodySha256];
  const suppliedSignature = headers[invocationHeaderNames.signature];
  if (
    keyId !== PINNED_RESEARCH_INVOCATION_KEY_ID ||
    typeof rawTimestamp !== "string" ||
    !/^[0-9]{10}$/u.test(rawTimestamp) ||
    typeof nonce !== "string" ||
    !/^[a-f0-9]{32}$/u.test(nonce) ||
    typeof suppliedBodyHash !== "string" ||
    !SIGNATURE.test(suppliedBodyHash) ||
    typeof suppliedSignature !== "string" ||
    !SIGNATURE.test(suppliedSignature)
  ) {
    return null;
  }
  const timestamp = Number(rawTimestamp);
  const currentSeconds = Math.floor(now() / 1_000);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < currentSeconds - 60 ||
    timestamp > currentSeconds + 5
  ) {
    return null;
  }
  const bodyHash = sha256Hex(body);
  if (!constantTimeEqual(bodyHash, suppliedBodyHash)) return null;
  const expectedSignature = sign(
    key,
    canonicalPinnedResearchInvocation({
      bodySha256: bodyHash,
      nonce,
      timestamp,
    }),
  );
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) return null;
  if (!replayGuard.consume(nonce)) return null;
  return Object.freeze({ bodyHash, nonce, timestamp });
};

export const signHostResponse = ({
  body,
  hmacKey,
  nonce,
  requestId,
  timestamp,
}) => {
  const key = normalizeHostHmacKey(hmacKey);
  if (!key) throw new Error("research_host_hmac_key_rejected");
  const bodySha256 = sha256Hex(body);
  return Object.freeze({
    bodySha256,
    signature: sign(
      key,
      canonicalPinnedResearchResponse({
        bodySha256,
        nonce,
        requestId,
        timestamp,
      }),
    ),
  });
};
