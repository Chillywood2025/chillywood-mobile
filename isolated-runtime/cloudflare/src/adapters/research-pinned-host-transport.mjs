import {
  canonicalPinnedResearchInvocation,
  canonicalPinnedResearchResponse,
  invocationHeaderNames,
  isSha256,
  PINNED_RESEARCH_EXTERNAL_PATH,
  PINNED_RESEARCH_HOST_SCHEMA_VERSION,
  PINNED_RESEARCH_INVOCATION_KEY_ID,
  PINNED_RESEARCH_PROVIDER_ACTIVE,
  responseHeaderNames,
} from "../../../pinned-research-transport/src/invocation-contract.mjs";

export const RESEARCH_PINNED_TRANSPORT_REQUIRED =
  "RESEARCH_PINNED_TRANSPORT_REQUIRED";

const HMAC_KEY = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const MAX_RESPONSE_BYTES = 4_194_304;
const ACCEPTED_CONTENT_TYPES = new Set([
  "application/feed+json",
  "application/json",
  "text/html",
  "text/plain",
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value, keys) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const bytesToHex = (value) =>
  [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (value) =>
  Uint8Array.from(
    value.match(/.{2}/gu) ?? [],
    (part) => Number.parseInt(part, 16),
  );

const sha256Hex = async (value, subtle) =>
  bytesToHex(
    await subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );

const hmacHex = async (key, value, subtle) => {
  const imported = await subtle.importKey(
    "raw",
    hexToBytes(key),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await subtle.sign("HMAC", imported, new TextEncoder().encode(value)),
  );
};

const constantTimeHexEqual = (left, right) => {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    left.length !== right.length ||
    !/^[a-f0-9]+$/u.test(left) ||
    !/^[a-f0-9]+$/u.test(right)
  ) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

const normalizeEndpoint = (raw) => {
  if (typeof raw !== "string" || raw.includes("REPLACE_WITH_")) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search ||
    parsed.port ||
    parsed.pathname !== PINNED_RESEARCH_EXTERNAL_PATH ||
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".localhost") ||
    parsed.hostname.endsWith(".local") ||
    parsed.hostname.endsWith(".internal") ||
    /^[0-9.:[\]]+$/u.test(parsed.hostname) ||
    !/^[a-z0-9.-]+$/u.test(parsed.hostname) ||
    parsed.hostname.includes("..") ||
    parsed.toString() !== raw
  ) {
    return null;
  }
  return parsed;
};

const validateAttestedResult = async (
  result,
  requestedUrl,
  subtle,
) => {
  if (
    !hasExactKeys(result, [
      "body",
      "canonicalUrl",
      "compressedBytes",
      "connectedPeerHash",
      "contentType",
      "credentialsSent",
      "decompressedBytes",
      "lastModifiedHeader",
      "networkBoundary",
      "providerReadiness",
      "rawArchivePersisted",
      "resolvedAddresses",
      "retrievalDate",
      "status",
      "transportAttestationHash",
      "transportAttestationManifest",
      "trustedForPersistence",
      "untrustedEvidence",
    ]) ||
    typeof result.body !== "string" ||
    new TextEncoder().encode(result.body).byteLength > 1_048_576 ||
    typeof result.canonicalUrl !== "string" ||
    typeof result.contentType !== "string" ||
    !ACCEPTED_CONTENT_TYPES.has(result.contentType) ||
    result.credentialsSent !== false ||
    result.rawArchivePersisted !== false ||
    result.networkBoundary !== "isolated_node_pinned_https_v1" ||
    result.providerReadiness !== PINNED_RESEARCH_PROVIDER_ACTIVE ||
    result.trustedForPersistence !== true ||
    result.untrustedEvidence !== true ||
    !Number.isSafeInteger(result.compressedBytes) ||
    result.compressedBytes < 0 ||
    result.compressedBytes !== result.decompressedBytes ||
    !Number.isSafeInteger(result.status) ||
    result.status < 200 ||
    result.status > 299 ||
    !isSha256(result.connectedPeerHash) ||
    !isSha256(result.transportAttestationHash) ||
    (
      result.lastModifiedHeader !== null &&
      (
        typeof result.lastModifiedHeader !== "string" ||
        result.lastModifiedHeader.length > 512
      )
    ) ||
    !Array.isArray(result.resolvedAddresses) ||
    result.resolvedAddresses.length < 1 ||
    result.resolvedAddresses.length > 16 ||
    result.resolvedAddresses.some((address) =>
      typeof address !== "string" || address.length > 64
    ) ||
    !Number.isFinite(Date.parse(result.retrievalDate)) ||
    new Date(Date.parse(result.retrievalDate)).toISOString() !==
      result.retrievalDate
  ) {
    throw new Error("research_host_result_rejected");
  }
  let requested;
  let final;
  try {
    requested = new URL(requestedUrl);
    final = new URL(result.canonicalUrl);
  } catch {
    throw new Error("research_host_result_rejected");
  }
  if (
    final.protocol !== "https:" ||
    final.hostname !== requested.hostname ||
    final.toString() !== result.canonicalUrl
  ) {
    throw new Error("research_host_result_rejected");
  }
  const manifest = result.transportAttestationManifest;
  if (
    !hasExactKeys(manifest, [
      "bodyHash",
      "contract",
      "finalUrlHash",
      "hops",
      "retrievalDate",
    ]) ||
    manifest.contract !== "chillywood_pinned_public_research_transport_v1" ||
    !isSha256(manifest.bodyHash) ||
    !isSha256(manifest.finalUrlHash) ||
    manifest.retrievalDate !== result.retrievalDate ||
    !Array.isArray(manifest.hops) ||
    manifest.hops.length < 1 ||
    manifest.hops.length > 4
  ) {
    throw new Error("research_host_attestation_rejected");
  }
  for (const hop of manifest.hops) {
    if (
      !hasExactKeys(hop, [
        "approvedAddressHashes",
        "connectedAddressHash",
        "contentType",
        "status",
        "urlHash",
      ]) ||
      !Array.isArray(hop.approvedAddressHashes) ||
      hop.approvedAddressHashes.length < 1 ||
      hop.approvedAddressHashes.length > 16 ||
      hop.approvedAddressHashes.some((value) => !isSha256(value)) ||
      !isSha256(hop.connectedAddressHash) ||
      !isSha256(hop.urlHash) ||
      typeof hop.contentType !== "string" ||
      !Number.isSafeInteger(hop.status)
    ) {
      throw new Error("research_host_attestation_rejected");
    }
  }
  const finalHop = manifest.hops.at(-1);
  const addressHashes = await Promise.all(
    result.resolvedAddresses.map((address) => sha256Hex(address, subtle)),
  );
  const [
    expectedBodyHash,
    expectedFinalUrlHash,
    expectedAttestationHash,
  ] = await Promise.all([
    sha256Hex(result.body, subtle),
    sha256Hex(result.canonicalUrl, subtle),
    sha256Hex(JSON.stringify(manifest), subtle),
  ]);
  if (
    !constantTimeHexEqual(manifest.bodyHash, expectedBodyHash) ||
    !constantTimeHexEqual(manifest.finalUrlHash, expectedFinalUrlHash) ||
    !constantTimeHexEqual(
      result.transportAttestationHash,
      expectedAttestationHash,
    ) ||
    !constantTimeHexEqual(
      finalHop.connectedAddressHash,
      result.connectedPeerHash,
    ) ||
    finalHop.contentType !== result.contentType ||
    finalHop.status !== result.status ||
    addressHashes.length !== finalHop.approvedAddressHashes.length ||
    addressHashes.some((value, index) =>
      !constantTimeHexEqual(value, finalHop.approvedAddressHashes[index])
    )
  ) {
    throw new Error("research_host_attestation_rejected");
  }
  return Object.freeze(result);
};

const readBoundedResponse = async (response) => {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)
  ) {
    throw new Error("research_host_response_size_rejected");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("research_host_response_size_rejected");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
};

export const createPinnedResearchHostTransport = ({
  fetcher = globalThis.fetch,
  now = Date.now,
  randomBytes = (length) => {
    const value = new Uint8Array(length);
    globalThis.crypto.getRandomValues(value);
    return value;
  },
  subtle = globalThis.crypto?.subtle,
} = {}) => {
  if (
    typeof fetcher !== "function" ||
    typeof now !== "function" ||
    typeof randomBytes !== "function" ||
    !subtle
  ) {
    throw new Error("research_host_adapter_configuration_rejected");
  }
  return async (url, signal, { authorityId, context, env } = {}) => {
    const endpoint = normalizeEndpoint(
      env?.COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL,
    );
    const hmacKey = env?.COGNITIVE_RESEARCH_PINNED_TRANSPORT_HMAC_KEY;
    if (
      !endpoint ||
      typeof hmacKey !== "string" ||
      !HMAC_KEY.test(hmacKey) ||
      !context ||
      typeof authorityId !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{1,79}$/u.test(authorityId) ||
      typeof context.requestId !== "string" ||
      !UUID.test(context.requestId) ||
      typeof context.deadlineAt !== "string"
    ) {
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    signal?.throwIfAborted();
    const timestamp = Math.floor(now() / 1_000);
    const nonceBytes = randomBytes(16);
    if (!(nonceBytes instanceof Uint8Array) || nonceBytes.length !== 16) {
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    const nonce = bytesToHex(nonceBytes);
    const payload = Object.freeze({
      authorityId,
      deadlineAt: context.deadlineAt,
      requestId: context.requestId,
      schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
      url,
    });
    const body = JSON.stringify(payload);
    const bodySha256 = await sha256Hex(body, subtle);
    const signature = await hmacHex(
      hmacKey,
      canonicalPinnedResearchInvocation({
        bodySha256,
        nonce,
        timestamp,
      }),
      subtle,
    );
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        body,
        cache: "no-store",
        credentials: "omit",
        headers: {
          "accept-encoding": "identity",
          "content-type": "application/json",
          [invocationHeaderNames.bodySha256]: bodySha256,
          [invocationHeaderNames.keyId]:
            PINNED_RESEARCH_INVOCATION_KEY_ID,
          [invocationHeaderNames.nonce]: nonce,
          [invocationHeaderNames.signature]: signature,
          [invocationHeaderNames.timestamp]: String(timestamp),
        },
        method: "POST",
        redirect: "manual",
        signal,
      });
    } catch {
      signal?.throwIfAborted();
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    if (
      !(response instanceof Response) ||
      response.status !== 200 ||
      response.redirected ||
      response.headers.get("content-type")?.split(";", 1)[0] !==
        "application/json"
    ) {
      await response?.body?.cancel?.().catch(() => undefined);
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    let responseBody;
    try {
      responseBody = await readBoundedResponse(response);
    } catch {
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    const responseBodySha256 = await sha256Hex(responseBody, subtle);
    const suppliedBodyHash =
      response.headers.get(responseHeaderNames.bodySha256);
    const suppliedSignature =
      response.headers.get(responseHeaderNames.signature);
    const expectedSignature = await hmacHex(
      hmacKey,
      canonicalPinnedResearchResponse({
        bodySha256: responseBodySha256,
        nonce,
        requestId: context.requestId,
        timestamp,
      }),
      subtle,
    );
    if (
      !constantTimeHexEqual(suppliedBodyHash, responseBodySha256) ||
      !constantTimeHexEqual(suppliedSignature, expectedSignature)
    ) {
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    let parsed;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    if (
      !hasExactKeys(parsed, ["requestId", "result", "schemaVersion"]) ||
      parsed.schemaVersion !== PINNED_RESEARCH_HOST_SCHEMA_VERSION ||
      parsed.requestId !== context.requestId
    ) {
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
    try {
      return await validateAttestedResult(parsed.result, url, subtle);
    } catch {
      throw new Error(RESEARCH_PINNED_TRANSPORT_REQUIRED);
    }
  };
};
