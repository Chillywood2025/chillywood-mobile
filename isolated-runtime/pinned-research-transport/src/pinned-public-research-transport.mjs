import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import https from "node:https";
import net from "node:net";

import {
  isPrivateOrReservedIp,
} from "../../cloudflare/src/adapters/research-fetch-transport.mjs";

export const RESEARCH_PINNED_TRANSPORT_REQUIRED =
  "RESEARCH_PINNED_TRANSPORT_REQUIRED";
export const PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER =
  "PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER";

const DEFAULT_LIMITS = Object.freeze({
  maximumBodyBytes: 1_048_576,
  maximumDnsAddresses: 16,
  maximumRedirects: 3,
  totalTimeoutMs: 15_000,
});
const ACCEPTED_CONTENT_TYPES = new Set([
  "application/feed+json",
  "application/json",
  "text/html",
  "text/plain",
]);
const METADATA_HOSTNAMES = new Set([
  "instance-data",
  "metadata",
  "metadata.aws.internal",
  "metadata.google.internal",
]);
const CREDENTIAL_QUERY_KEY =
  /(?:^|[_-])(?:access[_-]?token|api[_-]?key|auth|authorization|client[_-]?secret|credential|key|password|secret|session|sig|signature|token)(?:$|[_-])/iu;
const CREDENTIAL_VALUE =
  /(?:^|[?&])(?:access[_-]?token|api[_-]?key|authorization|client[_-]?secret|credential|password|secret|session|sig|signature|token)=/iu;
const CREDENTIAL_MATERIAL =
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,})\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|https:\/\/[^/\s:@]+:[^/\s@]+@/u;

const sha256 = (value) =>
  createHash("sha256").update(String(value), "utf8").digest("hex");

const normalizedIp = (raw) => {
  if (typeof raw !== "string") return null;
  const value = raw.toLowerCase().replace(/^\[|\]$/gu, "").split("%", 1)[0];
  if (value.startsWith("::ffff:") && net.isIPv4(value.slice(7))) {
    return value.slice(7);
  }
  return net.isIP(value) ? value : null;
};

const decodedSecurityCandidates = (raw) => {
  const candidates = [];
  let value = String(raw);
  for (let depth = 0; depth < 5; depth += 1) {
    candidates.push(value);
    let next;
    try {
      next = decodeURIComponent(value);
    } catch {
      return null;
    }
    if (next === value) return candidates;
    value = next;
  }
  try {
    return decodeURIComponent(value) === value ? candidates : null;
  } catch {
    return null;
  }
};

const normalizeLimits = (limits = {}) => {
  const value = Object.freeze({ ...DEFAULT_LIMITS, ...limits });
  if (
    !Number.isSafeInteger(value.maximumBodyBytes) ||
    value.maximumBodyBytes < 1_024 ||
    value.maximumBodyBytes > 4_194_304 ||
    !Number.isSafeInteger(value.maximumDnsAddresses) ||
    value.maximumDnsAddresses < 1 ||
    value.maximumDnsAddresses > 32 ||
    !Number.isSafeInteger(value.maximumRedirects) ||
    value.maximumRedirects < 0 ||
    value.maximumRedirects > 5 ||
    !Number.isSafeInteger(value.totalTimeoutMs) ||
    value.totalTimeoutMs < 100 ||
    value.totalTimeoutMs > 60_000
  ) {
    throw new Error("research_transport_limits_rejected");
  }
  return value;
};

const abortRace = (promise, signal) => {
  if (signal.aborted) {
    Promise.resolve(promise).catch(() => undefined);
    return Promise.reject(new Error("research_cancelled"));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("research_cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
};

export const canonicalizePinnedResearchUrl = (raw) => {
  if (typeof raw !== "string" || raw.length < 12 || raw.length > 2_048) {
    return null;
  }
  const normalized = raw.normalize("NFKC").replace(
    /[\u3002\uff0e\uff61]/gu,
    ".",
  );
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.port && parsed.port !== "443")
  ) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    METADATA_HOSTNAMES.has(hostname) ||
    (
      net.isIP(hostname) === 0 &&
      (!/^[a-z0-9.-]+$/u.test(hostname) ||
        hostname.includes(".."))
    ) ||
    (
      net.isIP(hostname) !== 0 &&
      isPrivateOrReservedIp(hostname)
    ) ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    return null;
  }
  parsed.hostname = hostname;
  parsed.port = "";
  const securityCandidates = [
    parsed.pathname,
    ...[...parsed.searchParams.entries()].flat(),
  ].flatMap((value) => decodedSecurityCandidates(value) ?? [null]);
  if (
    [...parsed.searchParams.entries()].some(([key, value]) =>
      CREDENTIAL_QUERY_KEY.test(key) ||
      CREDENTIAL_VALUE.test(`${key}=${value}`) ||
      CREDENTIAL_VALUE.test(`?${value}`)
    ) ||
    securityCandidates.includes(null) ||
    securityCandidates.some((value) =>
      CREDENTIAL_VALUE.test(`?${value}`) ||
      CREDENTIAL_MATERIAL.test(value)
    )
  ) {
    return null;
  }
  const canonical = parsed.toString();
  return Object.freeze({
    canonical,
    hostname,
    pathAndQuery: `${parsed.pathname}${parsed.search}`,
    pathname: parsed.pathname,
  });
};

export const resolvePinnedPublicAddresses = async (
  hostname,
  signal,
  {
    maximumDnsAddresses = DEFAULT_LIMITS.maximumDnsAddresses,
    resolver = resolveWithSystemDns,
  } = {},
) => {
  if (
    typeof hostname !== "string" ||
    typeof resolver !== "function" ||
    !Number.isSafeInteger(maximumDnsAddresses) ||
    maximumDnsAddresses < 1 ||
    maximumDnsAddresses > 32
  ) {
    throw new Error("research_dns_configuration_rejected");
  }
  signal?.throwIfAborted();
  const values = await abortRace(
    resolver(hostname, signal),
    signal ?? new AbortController().signal,
  );
  signal?.throwIfAborted();
  if (!Array.isArray(values)) {
    throw new Error("research_dns_scope_rejected");
  }
  const normalizedAddresses = values.map((entry) =>
    normalizedIp(typeof entry === "string" ? entry : entry?.address)
  );
  if (
    values.length > maximumDnsAddresses ||
    normalizedAddresses.some((address) => address === null)
  ) {
    throw new Error("research_dns_scope_rejected");
  }
  const addresses = [...new Set(normalizedAddresses)].sort((left, right) => {
    const familyDifference = net.isIP(left) - net.isIP(right);
    return familyDifference || left.localeCompare(right);
  });
  if (
    addresses.length < 1 ||
    addresses.length > maximumDnsAddresses ||
    addresses.some((address) => isPrivateOrReservedIp(address))
  ) {
    throw new Error("research_dns_scope_rejected");
  }
  return Object.freeze(addresses);
};

export const resolveWithSystemDns = async (hostname, signal) => {
  const resolver = new Resolver({ timeout: 2_000, tries: 2 });
  const cancel = () => resolver.cancel();
  if (signal?.aborted) {
    resolver.cancel();
    throw new Error("research_cancelled");
  }
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const results = await abortRace(
      Promise.allSettled([
        resolver.resolve4(hostname),
        resolver.resolve6(hostname),
      ]),
      signal ?? new AbortController().signal,
    );
    return results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
    resolver.cancel();
  }
};

export const pinnedHttpsRequestOptions = (target, pinnedAddress, signal) => {
  if (
    !target ||
    typeof target.hostname !== "string" ||
    !normalizedIp(pinnedAddress) ||
    isPrivateOrReservedIp(pinnedAddress)
  ) {
    throw new Error("research_transport_scope_rejected");
  }
  return Object.freeze({
    agent: false,
    headers: Object.freeze({
      Accept:
        "text/html, text/plain, application/json, application/feed+json",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-store",
      Host: target.hostname,
      "User-Agent": "ChillywoodPinnedPublicResearchTransport/1",
    }),
    hostname: target.hostname,
    lookup: (_hostname, options, callback) => {
      const address = normalizedIp(pinnedAddress);
      const family = net.isIPv6(pinnedAddress) ? 6 : 4;
      if (options?.all) {
        callback(null, [{ address, family }]);
        return;
      }
      callback(null, address, family);
    },
    method: "GET",
    path: target.pathAndQuery,
    port: 443,
    protocol: "https:",
    rejectUnauthorized: true,
    servername: target.hostname,
    signal,
  });
};

export const connectPinnedHttps = ({
  pinnedAddress,
  signal,
  target,
}) =>
  new Promise((resolve, reject) => {
    const expectedAddress = normalizedIp(pinnedAddress);
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request(
      pinnedHttpsRequestOptions(target, pinnedAddress, signal),
      (response) => {
        const connectedAddress = normalizedIp(response.socket.remoteAddress);
        if (
          !response.socket.authorized ||
          !connectedAddress ||
          connectedAddress !== expectedAddress ||
          isPrivateOrReservedIp(connectedAddress)
        ) {
          response.destroy();
          fail(new Error("research_connected_peer_mismatch"));
          return;
        }
        if (settled) {
          response.destroy();
          return;
        }
        settled = true;
        resolve(Object.freeze({
          body: response,
          connectedAddress,
          headers: response.headers,
          status: response.statusCode,
        }));
      },
    );
    request.once("error", fail);
    request.end();
  });

const headerValue = (headers, name) => {
  if (headers instanceof Headers) return headers.get(name);
  if (!headers || typeof headers !== "object") return null;
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value ?? null;
};

const readIdentityBody = async (response, maximumBodyBytes, signal) => {
  const contentEncoding = String(
    headerValue(response.headers, "content-encoding") ?? "identity",
  ).trim().toLowerCase();
  if (contentEncoding !== "" && contentEncoding !== "identity") {
    response.body?.destroy?.();
    throw new Error("research_content_encoding_rejected");
  }
  const declared = headerValue(response.headers, "content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/u.test(String(declared)) ||
      Number(declared) > maximumBodyBytes)
  ) {
    response.body?.destroy?.();
    throw new Error("research_response_size_rejected");
  }
  if (!response.body) return Object.freeze({ body: "", bytes: 0 });
  const chunks = [];
  let bytes = 0;
  const abort = () =>
    response.body.destroy?.(new Error("research_cancelled"));
  signal.addEventListener("abort", abort, { once: true });
  try {
    for await (const value of response.body) {
      signal.throwIfAborted();
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > maximumBodyBytes) {
        response.body.destroy?.();
        throw new Error("research_response_size_rejected");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
  let body;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, bytes),
    );
  } catch {
    throw new Error("research_response_encoding_rejected");
  }
  return Object.freeze({ body, bytes });
};

export const buildPinnedTransportAttestation = ({
  body,
  finalUrl,
  history,
  retrievalDate,
}) => {
  const manifest = Object.freeze({
    bodyHash: sha256(body),
    contract: "chillywood_pinned_public_research_transport_v1",
    finalUrlHash: sha256(finalUrl),
    hops: history.map((hop) => Object.freeze({
      approvedAddressHashes: hop.approvedAddresses.map(sha256),
      connectedAddressHash: sha256(hop.connectedAddress),
      contentType: hop.contentType,
      status: hop.status,
      urlHash: sha256(hop.url),
    })),
    retrievalDate,
  });
  return Object.freeze({
    hash: sha256(JSON.stringify(manifest)),
    manifest,
  });
};

export const createPinnedPublicResearchTransport = ({
  connector = connectPinnedHttps,
  limits,
  now = Date.now,
  resolver = resolveWithSystemDns,
} = {}) => {
  if (
    typeof connector !== "function" ||
    typeof now !== "function" ||
    typeof resolver !== "function"
  ) {
    throw new Error("research_transport_configuration_rejected");
  }
  const bounded = normalizeLimits(limits);
  const productionConnector = connector === connectPinnedHttps;
  return async (initialUrl, callerSignal) => {
    const initial = canonicalizePinnedResearchUrl(initialUrl);
    if (!initial) throw new Error("research_url_rejected");
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("research_total_timeout")),
      bounded.totalTimeoutMs,
    );
    const cancel = () =>
      controller.abort(callerSignal?.reason ?? new Error("research_cancelled"));
    if (callerSignal?.aborted) cancel();
    else callerSignal?.addEventListener("abort", cancel, { once: true });

    const history = [];
    let target = initial;
    try {
      for (
        let redirectCount = 0;
        redirectCount <= bounded.maximumRedirects;
        redirectCount += 1
      ) {
        controller.signal.throwIfAborted();
        const approvedAddresses = await resolvePinnedPublicAddresses(
          target.hostname,
          controller.signal,
          {
            maximumDnsAddresses: bounded.maximumDnsAddresses,
            resolver,
          },
        );
        const response = await abortRace(
          connector({
            pinnedAddress: approvedAddresses[0],
            signal: controller.signal,
            target,
          }),
          controller.signal,
        );
        const connectedAddress = normalizedIp(response?.connectedAddress);
        if (
          !connectedAddress ||
          isPrivateOrReservedIp(connectedAddress) ||
          !approvedAddresses.includes(connectedAddress)
        ) {
          response?.body?.destroy?.();
          throw new Error("research_connected_peer_mismatch");
        }
        if (
          !Number.isSafeInteger(response.status) ||
          response.status < 200 ||
          response.status > 399
        ) {
          response?.body?.destroy?.();
          throw new Error("research_http_status_rejected");
        }
        const contentType = String(
          headerValue(response.headers, "content-type") ?? "",
        ).split(";", 1)[0].trim().toLowerCase();
        const location = headerValue(response.headers, "location");
        history.push(Object.freeze({
          approvedAddresses,
          connectedAddress,
          contentType,
          status: response.status,
          url: target.canonical,
        }));
        if (location !== null) {
          response.body?.destroy?.();
          if (
            ![301, 302, 303, 307, 308].includes(response.status) ||
            redirectCount === bounded.maximumRedirects
          ) {
            throw new Error("research_redirect_rejected");
          }
          const redirected = canonicalizePinnedResearchUrl(
            new URL(String(location), target.canonical).toString(),
          );
          if (!redirected || redirected.hostname !== initial.hostname) {
            throw new Error("research_redirect_scope_rejected");
          }
          target = redirected;
          continue;
        }
        if (response.status < 200 || response.status > 299) {
          response.body?.destroy?.();
          throw new Error("research_http_status_rejected");
        }
        if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
          response.body?.destroy?.();
          throw new Error("research_content_type_rejected");
        }
        const readback = await readIdentityBody(
          response,
          bounded.maximumBodyBytes,
          controller.signal,
        );
        const retrievalDate = new Date(now()).toISOString();
        const attestation = buildPinnedTransportAttestation({
          body: readback.body,
          finalUrl: target.canonical,
          history,
          retrievalDate,
        });
        return Object.freeze({
          body: readback.body,
          canonicalUrl: target.canonical,
          compressedBytes: readback.bytes,
          connectedPeerHash: sha256(connectedAddress),
          contentType,
          credentialsSent: false,
          decompressedBytes: readback.bytes,
          lastModifiedHeader: headerValue(
            response.headers,
            "last-modified",
          ),
          networkBoundary: productionConnector
            ? "isolated_node_pinned_https_v1"
            : "synthetic_contract_fixture_only",
          providerReadiness: productionConnector
            ? PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER
            : RESEARCH_PINNED_TRANSPORT_REQUIRED,
          rawArchivePersisted: false,
          resolvedAddresses: approvedAddresses,
          retrievalDate,
          status: response.status,
          transportAttestationHash: productionConnector
            ? attestation.hash
            : null,
          transportAttestationManifest: productionConnector
            ? attestation.manifest
            : null,
          // A verified socket is necessary but not sufficient. The deployment
          // remains ineligible for broker persistence until a reviewed host
          // identity and invocation boundary are selected and bound.
          trustedForPersistence: false,
          untrustedEvidence: true,
        });
      }
      throw new Error("research_redirect_rejected");
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          callerSignal?.aborted
            ? "research_cancelled"
            : "research_total_timeout",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", cancel);
    }
  };
};
