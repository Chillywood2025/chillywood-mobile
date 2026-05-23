type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

export type SecurityRequestContextResult = {
  captureStatus: "captured" | "malformed" | "unavailable";
  error?: string | null;
  id: string | null;
  ipMasked: string | null;
  requestId: string;
  source: string;
};

const DEFAULT_TRUSTED_IP_HEADERS = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for", "forwarded"] as const;

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

const trustedIpHeaderNames = () => {
  const configured = toText(Deno.env.get("SECURITY_CONTEXT_TRUSTED_IP_HEADERS"));
  if (configured) {
    return configured
      .split(",")
      .map(normalizeHeaderName)
      .filter(Boolean)
      .slice(0, 10);
  }

  const enableDefaults = toText(Deno.env.get("SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS")).toLowerCase();
  return ["1", "true", "yes"].includes(enableDefaults) ? [...DEFAULT_TRUSTED_IP_HEADERS] : [];
};

const requestIdFromHeaders = (headers: Headers) => {
  const candidate = toText(headers.get("x-request-id") ?? headers.get("cf-ray") ?? headers.get("fly-request-id"));
  if (candidate && /^[A-Za-z0-9._:-]{6,160}$/.test(candidate)) return candidate.slice(0, 160);
  return crypto.randomUUID();
};

const parseForwardedHeaderIp = (value: string) => {
  const first = value.split(",")[0] ?? "";
  const match = first.match(/(?:^|;)\s*for=(?:"?\[?)([^";,\]\s]+)(?:\]?"?)/i);
  return toText(match?.[1]);
};

const extractHeaderIp = (headerName: string, value: string) => {
  if (headerName === "forwarded") return parseForwardedHeaderIp(value);
  return toText(value.split(",")[0]);
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

const maskIp = (ip: string) => {
  if (ip.includes(".")) {
    const [a, b, c] = ip.split(".");
    return `${a}.${b}.${c}.0/24`;
  }

  const parts = ip.split(":").filter(Boolean);
  return `${parts.slice(0, 4).join(":") || "0000"}::/64`;
};

const readTrustedRequestIp = (headers: Headers) => {
  const names = trustedIpHeaderNames();
  if (!names.length) {
    return {
      configured: false,
      headerName: null,
      ip: null,
      malformed: false,
      reason: "trusted_ip_headers_not_configured",
    };
  }

  for (const headerName of names) {
    const headerValue = toText(headers.get(headerName));
    if (!headerValue) continue;
    const normalized = normalizeIp(extractHeaderIp(headerName, headerValue));
    if (normalized) {
      return {
        configured: true,
        headerName,
        ip: normalized,
        malformed: false,
        reason: "captured_from_trusted_header",
      };
    }
    return {
      configured: true,
      headerName,
      ip: null,
      malformed: true,
      reason: "trusted_ip_header_malformed",
    };
  }

  return {
    configured: true,
    headerName: null,
    ip: null,
    malformed: false,
    reason: "trusted_ip_header_missing",
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
  const trustedIp = readTrustedRequestIp(req.headers);
  const now = new Date().toISOString();
  const userId = normalizeUuid(input.userId);
  const authorization = toText(req.headers.get("authorization"));
  const userAgent = toText(req.headers.get("user-agent"));
  const capturedIp = trustedIp.ip && pepper ? trustedIp.ip : null;
  const captureStatus: SecurityRequestContextResult["captureStatus"] = capturedIp
    ? "captured"
    : trustedIp.malformed ? "malformed" : "unavailable";
  const unavailableHashInput = [
    "unavailable",
    source,
    requestId,
    now,
    userId ?? "",
    trustedIp.reason,
  ].join("|");

  const ipHash = capturedIp
    ? await hashWithPepper(capturedIp, "security-request-context:ip", pepper)
    : await hashSecurityText(unavailableHashInput, "security-request-context:ip-unavailable");
  const sessionId = authorization.toLowerCase().startsWith("bearer ")
    ? await hashWithPepper(authorization.replace(/^bearer\s+/i, ""), "security-request-context:session", pepper)
    : null;
  const userAgentHash = userAgent
    ? await hashWithPepper(userAgent, "security-request-context:user-agent", pepper)
    : null;

  try {
    const { data, error } = await adminClient
      .from("security_request_context")
      .insert({
        capture_status: captureStatus,
        device_hash: toText(input.deviceHash) || null,
        ip_hash: ipHash,
        ip_prefix_or_masked_ip: capturedIp ? maskIp(capturedIp) : captureStatus === "malformed" ? "Malformed" : "Not captured",
        metadata: {
          hash_pepper_present: !!pepper,
          raw_ip_retained: false,
          trusted_header_configured: trustedIp.configured,
          trusted_header_name: trustedIp.headerName,
          trusted_header_reason: trustedIp.reason,
        },
        request_id: requestId,
        retention_expires_at: toText(input.retentionExpiresAt) || null,
        session_id: sessionId,
        source,
        user_agent_hash: userAgentHash,
        user_id: userId,
      })
      .select("id,capture_status,ip_prefix_or_masked_ip,request_id,source")
      .single();

    if (error) throw error;

    return {
      captureStatus: toText((data as JsonObject | null)?.capture_status) as SecurityRequestContextResult["captureStatus"] || captureStatus,
      id: toText((data as JsonObject | null)?.id) || null,
      ipMasked: toText((data as JsonObject | null)?.ip_prefix_or_masked_ip) || null,
      requestId: toText((data as JsonObject | null)?.request_id) || requestId,
      source: toText((data as JsonObject | null)?.source) || source,
    };
  } catch (error) {
    return {
      captureStatus: "unavailable",
      error: error instanceof Error ? error.message.slice(0, 240) : "security_context_insert_failed",
      id: null,
      ipMasked: null,
      requestId,
      source,
    };
  }
}
