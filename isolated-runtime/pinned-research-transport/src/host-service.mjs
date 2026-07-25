import { Buffer } from "node:buffer";
import http from "node:http";
import net from "node:net";

import {
  authorityAllowsPinnedResearchUrl,
} from "./authority-policy.mjs";
import {
  authenticateHostInvocation,
  createInvocationReplayGuard,
  normalizeHostHmacKey,
  sha256Hex,
  signHostResponse,
} from "./host-auth.mjs";
import {
  invocationHeaderNames,
  isSha256,
  normalizePinnedResearchHostInvocation,
  PINNED_RESEARCH_HOST_SCHEMA_VERSION,
  PINNED_RESEARCH_INVOCATION_PATH,
  PINNED_RESEARCH_PROVIDER_ACTIVE,
  responseHeaderNames,
} from "./invocation-contract.mjs";
import {
  createPinnedPublicResearchTransport,
  PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER,
} from "./pinned-public-research-transport.mjs";

const MAX_INVOCATION_BYTES = 8_192;
const MAX_RESPONSE_BYTES = 4_194_304;

const isLoopback = (raw) => {
  if (typeof raw !== "string") return false;
  const address = raw.toLowerCase().split("%", 1)[0];
  return address === "::1" ||
    address === "127.0.0.1" ||
    (
      address.startsWith("::ffff:") &&
      net.isIPv4(address.slice(7)) &&
      address.slice(7).startsWith("127.")
    );
};

const singleHeader = (headers, name) => {
  const value = headers[name];
  return Array.isArray(value) ? null : value ?? null;
};

const exactInvocationHeaders = (headers) => Object.fromEntries(
  Object.values(invocationHeaderNames).map((name) => [
    name,
    singleHeader(headers, name),
  ]),
);

const readBoundedBody = (request, signal) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const fail = (error) => {
      request.destroy();
      reject(error);
    };
    const abort = () => fail(new Error("research_cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    request.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_INVOCATION_BYTES) {
        fail(new Error("research_host_request_size_rejected"));
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => {
      signal.removeEventListener("abort", abort);
      resolve(Buffer.concat(chunks, size).toString("utf8"));
    });
    request.once("error", (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });

const safeErrorCategory = (error) => {
  const value = error instanceof Error ? error.message : "";
  if (value === "research_cancelled") return "cancelled";
  if (value === "research_host_request_size_rejected") return "oversized";
  if (value.startsWith("research_")) return "transport_rejected";
  return "request_rejected";
};

const validatedTransportResult = (result) => {
  if (
    !result ||
    result.networkBoundary !== "isolated_node_pinned_https_v1" ||
    result.providerReadiness !==
      PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER ||
    result.credentialsSent !== false ||
    result.rawArchivePersisted !== false ||
    result.trustedForPersistence !== false ||
    result.untrustedEvidence !== true ||
    !isSha256(result.transportAttestationHash) ||
    !result.transportAttestationManifest ||
    result.transportAttestationManifest.contract !==
      "chillywood_pinned_public_research_transport_v1" ||
    typeof result.body !== "string" ||
    typeof result.canonicalUrl !== "string" ||
    typeof result.contentType !== "string" ||
    !Array.isArray(result.resolvedAddresses) ||
    result.resolvedAddresses.length < 1 ||
    result.resolvedAddresses.length > 16 ||
    !Number.isSafeInteger(result.status)
  ) {
    throw new Error("research_transport_attestation_rejected");
  }
  return Object.freeze({
    ...result,
    providerReadiness: PINNED_RESEARCH_PROVIDER_ACTIVE,
    trustedForPersistence: true,
  });
};

const jsonResponse = (response, status, value, headers = {}) => {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
};

export const createPinnedResearchHostServer = ({
  hmacKey,
  logger = { log() {} },
  now = Date.now,
  replayGuard = createInvocationReplayGuard({ now }),
  requireForwardedHttps = true,
  releaseManifestSha256,
  sourceCommit,
  sourceTree,
  transport = createPinnedPublicResearchTransport(),
} = {}) => {
  const key = normalizeHostHmacKey(hmacKey);
  if (
    !key ||
    typeof logger?.log !== "function" ||
    typeof now !== "function" ||
    typeof transport !== "function" ||
    typeof sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/u.test(sourceCommit) ||
    typeof sourceTree !== "string" ||
    !/^[a-f0-9]{40}$/u.test(sourceTree) ||
    typeof releaseManifestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(releaseManifestSha256)
  ) {
    throw new Error("research_host_configuration_rejected");
  }
  return http.createServer(async (request, response) => {
    if (
      request.method === "GET" &&
      request.url === "/healthz" &&
      isLoopback(request.socket.remoteAddress)
    ) {
      jsonResponse(response, 200, {
        contract: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
        providerReadiness: PINNED_RESEARCH_PROVIDER_ACTIVE,
        releaseManifestSha256,
        sourceCommit,
        sourceTree,
      });
      return;
    }
    const requestController = new AbortController();
    const close = () => {
      if (!response.writableEnded) {
        requestController.abort(new Error("research_cancelled"));
      }
    };
    request.once("aborted", close);
    response.once("close", close);
    let authenticated;
    let normalized;
    try {
      if (
        request.method !== "POST" ||
        request.url !== PINNED_RESEARCH_INVOCATION_PATH ||
        !isLoopback(request.socket.remoteAddress) ||
        (
          requireForwardedHttps &&
          singleHeader(request.headers, "x-forwarded-proto") !== "https"
        ) ||
        singleHeader(request.headers, "authorization") !== null ||
        singleHeader(request.headers, "cookie") !== null ||
        singleHeader(request.headers, "content-encoding") !== null ||
        singleHeader(request.headers, "content-type") !== "application/json"
      ) {
        throw new Error("research_host_request_rejected");
      }
      const body = await readBoundedBody(
        request,
        requestController.signal,
      );
      authenticated = authenticateHostInvocation({
        body,
        headers: exactInvocationHeaders(request.headers),
        hmacKey: key,
        now,
        replayGuard,
      });
      if (!authenticated) {
        throw new Error("research_host_invocation_rejected");
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error("research_host_payload_rejected");
      }
      normalized = normalizePinnedResearchHostInvocation(parsed, now());
      if (
        !normalized ||
        JSON.stringify(normalized) !== body ||
        !authorityAllowsPinnedResearchUrl(
          normalized.authorityId,
          normalized.url,
        )
      ) {
        throw new Error("research_host_payload_rejected");
      }
      const deadlineController = new AbortController();
      const cancel = () =>
        deadlineController.abort(
          requestController.signal.reason ?? new Error("research_cancelled"),
        );
      requestController.signal.addEventListener("abort", cancel, {
        once: true,
      });
      const timeout = setTimeout(
        () => deadlineController.abort(new Error("research_total_timeout")),
        Math.max(1, Date.parse(normalized.deadlineAt) - now()),
      );
      let result;
      try {
        result = validatedTransportResult(
          await transport(normalized.url, deadlineController.signal),
        );
      } finally {
        clearTimeout(timeout);
        requestController.signal.removeEventListener("abort", cancel);
      }
      const responseBody = JSON.stringify({
        requestId: normalized.requestId,
        result,
        schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
      });
      if (Buffer.byteLength(responseBody) > MAX_RESPONSE_BYTES) {
        throw new Error("research_host_response_size_rejected");
      }
      const signed = signHostResponse({
        body: responseBody,
        hmacKey: key,
        nonce: authenticated.nonce,
        requestId: normalized.requestId,
        timestamp: authenticated.timestamp,
      });
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(responseBody),
        "content-type": "application/json; charset=utf-8",
        [responseHeaderNames.bodySha256]: signed.bodySha256,
        [responseHeaderNames.signature]: signed.signature,
        "x-content-type-options": "nosniff",
      });
      response.end(responseBody);
      logger.log(JSON.stringify({
        category: "request_completed",
        requestIdHash: sha256Hex(normalized.requestId),
        status: "completed",
      }));
    } catch (error) {
      const category = safeErrorCategory(error);
      logger.log(JSON.stringify({
        category,
        requestIdHash: normalized?.requestId
          ? sha256Hex(normalized.requestId)
          : null,
        status: "rejected",
      }));
      if (!response.headersSent && !response.destroyed) {
        jsonResponse(
          response,
          authenticated ? 400 : 401,
          { error: "request_rejected" },
        );
      } else if (!response.destroyed) {
        response.destroy();
      }
    } finally {
      request.removeListener("aborted", close);
      response.removeListener("close", close);
    }
  });
};
