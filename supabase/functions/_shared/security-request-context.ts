type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

export type SecurityRequestContextResult = {
  captureStatus: "captured" | "malformed" | "unavailable";
  error?: string | null;
  id: string | null;
  ipMasked: string | null;
  networkProofError?: string | null;
  networkProofSource?: string | null;
  networkProofState: "verified" | "missing" | "invalid" | "expired" | "malformed";
  networkProofVerified: boolean;
  requestId: string;
  source: string;
};

type SignedNetworkProofPayload = {
  asnOrIsp?: string | null;
  cityApprox?: string | null;
  country?: string | null;
  ipHash: string;
  maskedIp: string;
  nonce?: string | null;
  raw?: JsonObject;
  region?: string | null;
  requestPath?: string | null;
  timestamp?: string | null;
  userAgentHash?: string | null;
  version?: string | null;
};

type SignedNetworkProofResult = {
  asnOrIsp?: string | null;
  cityApprox?: string | null;
  country?: string | null;
  error?: string | null;
  headerVersion?: string | null;
  ipHash?: string | null;
  maskedIp?: string | null;
  nonce?: string | null;
  payload?: JsonObject | null;
  region?: string | null;
  requestPath?: string | null;
  source?: string | null;
  spoofableHeadersPresent: string[];
  state: "verified" | "missing" | "invalid" | "expired" | "malformed";
  timestamp?: string | null;
  userAgentHash?: string | null;
  verified: boolean;
};

const NETWORK_PROOF_HEADER = "x-chillywood-network-proof";
const NETWORK_PROOF_SIGNATURE_HEADER = "x-chillywood-network-proof-signature";
const NETWORK_PROOF_TIMESTAMP_HEADER = "x-chillywood-network-proof-timestamp";
const NETWORK_PROOF_VERSION_HEADER = "x-chillywood-network-proof-version";
const NETWORK_PROOF_SOURCE = "signed_chillywood_proxy";
const NETWORK_PROOF_VERSION = "v1";
const NETWORK_PROOF_DEFAULT_MAX_AGE_SECONDS = 300;

const SPOOFABLE_CLIENT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "x-client-ip",
  "cf-connecting-ip",
] as const;

const toText = (value: unknown) => String(value ?? "").trim();

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const hashSecurityText = async (value: unknown, namespace = "security-context") => {
  const text = `${namespace}|${toText(value)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(digest);
};

const normalizeUuid = (value: unknown) => {
  const text = toText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)
    ? text
    : null;
};

const normalizeHeaderName = (value: unknown) => toText(value).toLowerCase();

const requestIdFromHeaders = (headers: Headers) => {
  const candidate = toText(headers.get("x-request-id") ?? headers.get("cf-ray") ?? headers.get("fly-request-id"));
  if (candidate && /^[A-Za-z0-9._:-]{6,160}$/.test(candidate)) return candidate.slice(0, 160);
  return crypto.randomUUID();
};

const normalizeIp = (value: unknown) => {
  let ip = toText(value).replace(/^"|"$/g, "");
  if (!ip) return null;

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(":"));
  }

  ip = ip.replace(/%.+$/u, "").toLowerCase();

  const ipv4Parts = ip.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every((part) => /^\d{1,3}$/.test(part))) {
    const octets = ipv4Parts.map((part) => Number(part));
    if (octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
      return octets.join(".");
    }
  }

  if (ip.includes(":") && /^[0-9a-f:.]+$/i.test(ip) && ip.length <= 45) {
    return ip;
  }

  return null;
};

const safeShortText = (value: unknown, max = 120) => {
  const text = toText(value);
  if (!text) return null;
  return text.replace(/[^\w .:/@-]/g, "_").slice(0, max);
};

const maskIp = (ip: string) => {
  if (ip.includes(".")) {
    const [a, b, c] = ip.split(".");
    return `${a}.${b}.${c}.0/24`;
  }

  const parts = ip.split(":").filter(Boolean);
  return `${parts.slice(0, 4).join(":") || "0000"}::/64`;
};

const base64UrlDecode = (value: string) => {
  const text = toText(value).replace(/-/g, "+").replace(/_/g, "/");
  if (!text || /[^A-Za-z0-9+/=]/.test(text)) return null;
  try {
    return atob(text.padEnd(Math.ceil(text.length / 4) * 4, "="));
  } catch {
    return null;
  }
};

const parseJsonObject = (value: string): JsonObject | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : null;
  } catch {
    return null;
  }
};

const normalizeSignature = (value: unknown) => toText(value).replace(/^sha256=/i, "").toLowerCase();

const hmacSha256Hex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
};

const constantTimeEqual = (left: string, right: string) => {
  const a = normalizeSignature(left);
  const b = normalizeSignature(right);
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
};

const parseProofTimestamp = (value: unknown) => {
  const text = toText(value);
  if (!text) return null;
  if (/^\d{10,13}$/.test(text)) {
    const numeric = Number(text);
    return new Date(text.length === 10 ? numeric * 1000 : numeric);
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};

const proofMaxAgeMs = () => {
  const seconds = Number(toText(Deno.env.get("CHILLYWOOD_NETWORK_PROOF_MAX_AGE_SECONDS")));
  return (Number.isFinite(seconds) && seconds >= 30 && seconds <= 1800 ? seconds : NETWORK_PROOF_DEFAULT_MAX_AGE_SECONDS) * 1000;
};

const normalizeNetworkProofPayload = (row: JsonObject): SignedNetworkProofPayload | null => {
  const ipHash = toText(row.ip_hash ?? row.ipHash).toLowerCase();
  const maskedIp = toText(row.masked_ip_or_prefix ?? row.maskedIp ?? row.masked_ip);
  if (!/^[a-f0-9]{16,128}$/.test(ipHash)) return null;
  if (!maskedIp || maskedIp.length > 90) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(maskedIp) || normalizeIp(maskedIp) === maskedIp) return null;

  const userAgentHash = toText(row.user_agent_hash ?? row.userAgentHash).toLowerCase();
  if (userAgentHash && !/^[a-f0-9]{16,128}$/.test(userAgentHash)) return null;

  return {
    asnOrIsp: safeShortText(row.asn_or_isp ?? row.asnOrIsp, 120),
    cityApprox: safeShortText(row.city_approx ?? row.cityApprox, 80),
    country: safeShortText(row.country, 80),
    ipHash,
    maskedIp,
    nonce: safeShortText(row.nonce ?? row.request_id ?? row.requestId, 120),
    raw: row,
    region: safeShortText(row.region, 80),
    requestPath: safeShortText(row.request_path ?? row.requestPath, 200),
    timestamp: toText(row.timestamp) || null,
    userAgentHash: userAgentHash || null,
    version: safeShortText(row.version, 20),
  };
};

const pathMatchesSignedProof = (currentPath: unknown, proofPath: unknown) => {
  const current = safeShortText(currentPath, 200);
  const proof = safeShortText(proofPath, 200);
  if (!current || !proof) return false;
  if (current === proof || current.endsWith(proof)) return true;

  const currentSegments = current.split("/").filter(Boolean);
  const proofSegments = proof.split("/").filter(Boolean);
  if (!currentSegments.length || !proofSegments.length) return false;

  return currentSegments.at(-1) === proofSegments.at(-1);
};

const spoofableHeadersPresent = (headers: Headers) =>
  SPOOFABLE_CLIENT_IP_HEADERS.filter((headerName) => !!toText(headers.get(headerName)));

export async function verifySignedNetworkProof(req: Request): Promise<SignedNetworkProofResult> {
  const headers = req.headers;
  const spoofableHeaders = spoofableHeadersPresent(headers);
  const proof = toText(headers.get(NETWORK_PROOF_HEADER));
  const signature = normalizeSignature(headers.get(NETWORK_PROOF_SIGNATURE_HEADER));
  const timestamp = toText(headers.get(NETWORK_PROOF_TIMESTAMP_HEADER));
  const version = toText(headers.get(NETWORK_PROOF_VERSION_HEADER)) || NETWORK_PROOF_VERSION;
  const anyProofHeader = !!(proof || signature || timestamp || headers.get(NETWORK_PROOF_VERSION_HEADER));

  if (!anyProofHeader) {
    return {
      error: "missing_trusted_proxy_proof",
      headerVersion: null,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "missing",
      verified: false,
    };
  }

  if (!proof || !signature || !timestamp || !version) {
    return {
      error: "malformed_trusted_proxy_proof_headers",
      headerVersion: version || null,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "malformed",
      verified: false,
    };
  }

  if (version !== NETWORK_PROOF_VERSION) {
    return {
      error: "unsupported_trusted_proxy_proof_version",
      headerVersion: version,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "malformed",
      verified: false,
    };
  }

  const secret = toText(Deno.env.get("CHILLYWOOD_NETWORK_PROOF_SECRET"));
  if (!secret) {
    return {
      error: "network_proof_secret_not_configured",
      headerVersion: version,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "invalid",
      verified: false,
    };
  }

  const timestampDate = parseProofTimestamp(timestamp);
  if (!timestampDate || Number.isNaN(timestampDate.getTime())) {
    return {
      error: "malformed_trusted_proxy_proof_timestamp",
      headerVersion: version,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "malformed",
      timestamp,
      verified: false,
    };
  }

  if (Math.abs(Date.now() - timestampDate.getTime()) > proofMaxAgeMs()) {
    return {
      error: "expired_trusted_proxy_proof",
      headerVersion: version,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "expired",
      timestamp: timestampDate.toISOString(),
      verified: false,
    };
  }

  const expected = await hmacSha256Hex(secret, `${version}.${timestamp}.${proof}`);
  if (!constantTimeEqual(expected, signature)) {
    return {
      error: "invalid_trusted_proxy_proof_signature",
      headerVersion: version,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "invalid",
      timestamp: timestampDate.toISOString(),
      verified: false,
    };
  }

  const decoded = base64UrlDecode(proof);
  const parsed = decoded ? parseJsonObject(decoded) : null;
  const payload = parsed ? normalizeNetworkProofPayload(parsed) : null;
  if (!payload || (payload.version && payload.version !== version)) {
    return {
      error: "malformed_trusted_proxy_proof_payload",
      headerVersion: version,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "malformed",
      timestamp: timestampDate.toISOString(),
      verified: false,
    };
  }

  const currentPath = safeShortText(new URL(req.url).pathname, 200);
  if (payload.requestPath && !pathMatchesSignedProof(currentPath, payload.requestPath)) {
    return {
      error: "trusted_proxy_proof_path_mismatch",
      headerVersion: version,
      requestPath: payload.requestPath,
      source: null,
      spoofableHeadersPresent: spoofableHeaders,
      state: "invalid",
      timestamp: timestampDate.toISOString(),
      verified: false,
    };
  }

  return {
    asnOrIsp: payload.asnOrIsp ?? null,
    cityApprox: payload.cityApprox ?? null,
    country: payload.country ?? null,
    headerVersion: version,
    ipHash: payload.ipHash,
    maskedIp: payload.maskedIp,
    nonce: payload.nonce ?? null,
    payload: payload.raw ?? null,
    region: payload.region ?? null,
    requestPath: payload.requestPath ?? currentPath,
    source: NETWORK_PROOF_SOURCE,
    spoofableHeadersPresent: spoofableHeaders,
    state: "verified",
    timestamp: timestampDate.toISOString(),
    userAgentHash: payload.userAgentHash ?? null,
    verified: true,
  };
};

const readPepper = () => toText(Deno.env.get("SECURITY_CONTEXT_HASH_PEPPER"));

const hashWithPepper = async (value: unknown, namespace: string, pepper: string | null) => {
  if (!pepper) return null;
  return hashSecurityText(`${pepper}|${toText(value)}`, namespace);
};

const sanitizeSource = (value: unknown) => {
  const source = toText(value).toLowerCase().replace(/[^a-z0-9:_-]/g, "_").slice(0, 120);
  return source || "unknown";
};

export const securityContextAuditMetadata = (context?: SecurityRequestContextResult | null): JsonObject => ({
  security_context_capture_status: context?.captureStatus ?? "unavailable",
  security_context_id: context?.id ?? null,
  security_context_network_proof_state: context?.networkProofState ?? "missing",
  security_context_network_proof_verified: context?.networkProofVerified ?? false,
  security_context_source: context?.source ?? null,
});

export async function attachDeviceHashToSecurityContext(
  adminClient: SupabaseClientLike,
  context: SecurityRequestContextResult | null | undefined,
  deviceHash: string | null | undefined,
) {
  if (!context?.id || !toText(deviceHash)) return;
  await adminClient
    .from("security_request_context")
    .update({ device_hash: toText(deviceHash) })
    .eq("id", context.id);
}

export async function captureSecurityRequestContext(
  adminClient: SupabaseClientLike,
  req: Request,
  input: {
    deviceHash?: string | null;
    retentionExpiresAt?: string | null;
    source: string;
    userId?: string | null;
  },
): Promise<SecurityRequestContextResult> {
  const source = sanitizeSource(input.source);
  const requestId = requestIdFromHeaders(req.headers);
  const pepper = readPepper();
  const networkProof = await verifySignedNetworkProof(req);
  const now = new Date().toISOString();
  const userId = normalizeUuid(input.userId);
  const authorization = toText(req.headers.get("authorization"));
  const userAgent = toText(req.headers.get("user-agent"));
  const captureStatus: SecurityRequestContextResult["captureStatus"] = networkProof.verified
    ? "captured"
    : networkProof.state === "malformed" ? "malformed" : "unavailable";
  const unavailableHashInput = [
    "unavailable",
    source,
    requestId,
    now,
    userId ?? "",
    networkProof.state,
    networkProof.error ?? "",
  ].join("|");

  const ipHash = networkProof.verified && networkProof.ipHash
    ? networkProof.ipHash
    : await hashSecurityText(unavailableHashInput, "security-request-context:ip-unavailable");
  const sessionId = authorization.toLowerCase().startsWith("bearer ")
    ? await hashWithPepper(authorization.replace(/^bearer\s+/i, ""), "security-request-context:session", pepper)
    : null;
  const userAgentHash = networkProof.verified && networkProof.userAgentHash
    ? networkProof.userAgentHash
    : userAgent
    ? await hashWithPepper(userAgent, "security-request-context:user-agent", pepper)
    : null;
  const displayMaskedIp = networkProof.verified
    ? networkProof.maskedIp
    : networkProof.state === "malformed" ? "Malformed trusted proxy proof"
      : networkProof.state === "expired" ? "Expired trusted proxy proof"
      : networkProof.state === "invalid" ? "Invalid trusted proxy proof"
      : "Missing trusted proxy proof";

  try {
    const { data, error } = await adminClient
      .from("security_request_context")
      .insert({
        asn_or_isp: networkProof.verified ? networkProof.asnOrIsp ?? null : null,
        capture_status: captureStatus,
        city_approx: networkProof.verified ? networkProof.cityApprox ?? null : null,
        country: networkProof.verified ? networkProof.country ?? null : null,
        device_hash: toText(input.deviceHash) || null,
        ip_hash: ipHash,
        ip_prefix_or_masked_ip: displayMaskedIp,
        metadata: {
          hash_pepper_present: !!pepper,
          network_proof_error: networkProof.error ?? null,
          network_proof_header_version: networkProof.headerVersion ?? null,
          network_proof_nonce: networkProof.nonce ?? null,
          network_proof_request_path: networkProof.requestPath ?? null,
          network_proof_state: networkProof.state,
          network_proof_verified: networkProof.verified,
          raw_ip_retained: false,
          spoofable_client_ip_headers_ignored: networkProof.spoofableHeadersPresent,
          trusted_header_reason: networkProof.verified ? "captured_from_signed_proxy_proof" : "direct_client_ip_headers_ignored",
        },
        network_proof_error: networkProof.verified ? null : networkProof.error ?? networkProof.state,
        network_proof_source: networkProof.verified ? NETWORK_PROOF_SOURCE : null,
        network_proof_timestamp: networkProof.timestamp ?? null,
        network_proof_verified: networkProof.verified,
        network_proof_version: networkProof.headerVersion ?? null,
        request_id: requestId,
        region: networkProof.verified ? networkProof.region ?? null : null,
        retention_expires_at: toText(input.retentionExpiresAt) || null,
        session_id: sessionId,
        source,
        trusted_header_source: networkProof.verified ? NETWORK_PROOF_SOURCE : null,
        user_agent_hash: userAgentHash,
        user_id: userId,
      })
      .select("id,capture_status,ip_prefix_or_masked_ip,network_proof_error,network_proof_source,network_proof_verified,request_id,source")
      .single();

    if (error) throw error;

    return {
      captureStatus: toText((data as JsonObject | null)?.capture_status) as SecurityRequestContextResult["captureStatus"] || captureStatus,
      id: toText((data as JsonObject | null)?.id) || null,
      ipMasked: toText((data as JsonObject | null)?.ip_prefix_or_masked_ip) || null,
      networkProofError: toText((data as JsonObject | null)?.network_proof_error) || null,
      networkProofSource: toText((data as JsonObject | null)?.network_proof_source) || null,
      networkProofState: networkProof.state,
      networkProofVerified: !!(data as JsonObject | null)?.network_proof_verified,
      requestId: toText((data as JsonObject | null)?.request_id) || requestId,
      source: toText((data as JsonObject | null)?.source) || source,
    };
  } catch (error) {
    return {
      captureStatus: "unavailable",
      error: error instanceof Error ? error.message.slice(0, 240) : "security_context_insert_failed",
      id: null,
      ipMasked: null,
      networkProofError: networkProof.error ?? "security_context_insert_failed",
      networkProofSource: null,
      networkProofState: networkProof.state,
      networkProofVerified: false,
      requestId,
      source,
    };
  }
}
