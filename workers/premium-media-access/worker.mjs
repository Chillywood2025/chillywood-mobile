export const PREMIUM_MEDIA_ALLOWED_PREFIX_DEFAULT = "playback/premium/";
export const PREMIUM_MEDIA_PROTECTED_PREFIXES = [
  "playback/premium/",
  "playback/protected/premium/",
];

const PREMIUM_RENDITIONS = new Set(["720p", "1080p"]);
const FREE_RENDITIONS = new Set(["360p", "480p"]);
const FORBIDDEN_SEGMENTS = new Set([
  "original",
  "originals",
  "master",
  "masters",
  "source",
  "sources",
  "uploads",
  "private",
  "processing",
  "unscanned",
  "moderation-blocked",
  "moderation_blocked",
]);

const encoder = new TextEncoder();

const toText = (value) => String(value ?? "").trim();
const toLowerText = (value) => toText(value).toLowerCase();

const normalizePath = (value) => (
  toText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
);

const normalizeAllowedPrefix = (value) => {
  const normalized = normalizePath(value) || PREMIUM_MEDIA_ALLOWED_PREFIX_DEFAULT;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
};

const isInvalidPath = (path) => (
  !path
  || path.includes("..")
  || /^https?:\/\//i.test(path)
  || /[\u0000-\u001F\u007F]/u.test(path)
);

const isProtectedPremiumPath = (path) => (
  PREMIUM_MEDIA_PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))
);

const isPublicFreePath = (path) => (
  path.startsWith("playback/public/")
  && [...FREE_RENDITIONS].some((label) => path.split("/").includes(label))
);

const findForbiddenSegment = (path) => (
  path.split("/").map(toLowerText).find((segment) => FORBIDDEN_SEGMENTS.has(segment)) ?? null
);

const extractScopeFromPath = (path) => {
  const segments = path.split("/").filter(Boolean);
  const premiumIndex = segments[0] === "playback" && segments[1] === "premium"
    ? 1
    : (
      segments[0] === "playback"
      && segments[1] === "protected"
      && segments[2] === "premium"
        ? 2
        : -1
    );
  if (premiumIndex < 0) {
    return {
      sourceType: "",
      sourceId: "",
      renditionLabel: segments.find((segment) => PREMIUM_RENDITIONS.has(segment) || FREE_RENDITIONS.has(segment)) ?? "",
    };
  }
  return {
    sourceType: segments[premiumIndex + 1] ?? "",
    sourceId: segments[premiumIndex + 2] ?? "",
    renditionLabel: segments.find((segment) => PREMIUM_RENDITIONS.has(segment) || FREE_RENDITIONS.has(segment)) ?? "",
  };
};

const base64UrlEncodeBytes = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlEncodeText = (value) => base64UrlEncodeBytes(encoder.encode(value));

const base64UrlDecodeText = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const timingSafeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

const importHmacKey = async (keyMaterial) => (
  crypto.subtle.importKey(
    "raw",
    encoder.encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
);

const signCompactParts = async (headerPart, payloadPart, keyMaterial) => {
  const key = await importHmacKey(keyMaterial);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerPart}.${payloadPart}`));
  return base64UrlEncodeBytes(new Uint8Array(signature));
};

export async function signPremiumMediaAccessTokenForProof(claims, keyMaterial) {
  const header = {
    alg: "HS256",
    typ: "premium-media-access",
    version: 1,
  };
  const headerPart = base64UrlEncodeText(JSON.stringify(header));
  const payloadPart = base64UrlEncodeText(JSON.stringify(claims));
  const signaturePart = await signCompactParts(headerPart, payloadPart, keyMaterial);
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

export async function parseAndVerifyPremiumMediaToken(token, keyMaterial) {
  const compactToken = toText(token);
  if (!compactToken) return { valid: false, reason: "missing_token", claims: null };
  const parts = compactToken.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed_token", claims: null };

  const [headerPart, payloadPart, signaturePart] = parts;
  let header;
  let claims;
  try {
    header = JSON.parse(base64UrlDecodeText(headerPart));
    claims = JSON.parse(base64UrlDecodeText(payloadPart));
  } catch {
    return { valid: false, reason: "malformed_token", claims: null };
  }

  if (header.alg !== "HS256" || header.typ !== "premium-media-access" || header.version !== 1) {
    return { valid: false, reason: "token_header_mismatch", claims: null };
  }

  const expectedSignature = await signCompactParts(headerPart, payloadPart, keyMaterial);
  if (!timingSafeEqual(signaturePart, expectedSignature)) {
    return { valid: false, reason: "token_signature_invalid", claims: null };
  }

  return { valid: true, reason: null, claims };
}

const readBearerToken = (requestUrl, request) => {
  const auth = toText(request.headers.get("authorization"));
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return toText(requestUrl.searchParams.get("token") ?? requestUrl.searchParams.get("premium_token"));
};

const responseForDenied = (reason, status = 403) => (
  new Response(JSON.stringify({ ok: false, reason }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
);

const contentTypeFor = (path) => {
  if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (path.endsWith(".ts")) return "video/mp2t";
  if (path.endsWith(".m4s")) return "video/iso.segment";
  return "application/octet-stream";
};

const cacheControlFor = (path) => (
  path.endsWith(".m3u8")
    ? "private, max-age=60"
    : "private, max-age=31536000, immutable"
);

const safeNowEpochSeconds = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return Math.floor(Date.now() / 1000);
};

export function buildRedactedPremiumMediaLog(decision) {
  return {
    allowed: decision.allowed,
    reason: decision.reason,
    path: decision.path,
    sourceType: decision.sourceType,
    sourceId: decision.sourceId ? "[REDACTED_SOURCE]" : "",
    renditionLabel: decision.renditionLabel,
    tokenPresent: decision.tokenPresent,
    tokenRedacted: decision.tokenPresent,
  };
}

export async function verifyPremiumMediaRequest(input) {
  const request = input.request;
  const env = input.env ?? {};
  const nowEpochSeconds = safeNowEpochSeconds(input.nowEpochSeconds);
  const requestUrl = new URL(request.url);
  const path = normalizePath(requestUrl.pathname);
  const allowedPrefix = normalizeAllowedPrefix(env.PREMIUM_MEDIA_ALLOWED_PREFIX);
  const scope = extractScopeFromPath(path);
  const token = readBearerToken(requestUrl, request);
  const baseDecision = {
    allowed: false,
    reason: null,
    path,
    objectKey: "",
    sourceType: scope.sourceType,
    sourceId: scope.sourceId,
    renditionLabel: scope.renditionLabel,
    tokenPresent: !!token,
    claims: null,
  };

  if (isPublicFreePath(path)) {
    return { ...baseDecision, reason: "public_free_path_bypasses_premium_worker" };
  }
  if (isInvalidPath(path)) return { ...baseDecision, reason: "invalid_path" };
  if (!isProtectedPremiumPath(path)) return { ...baseDecision, reason: "outside_premium_prefix" };
  if (!path.startsWith(allowedPrefix)) return { ...baseDecision, reason: "outside_allowed_prefix" };
  const forbiddenSegment = findForbiddenSegment(path);
  if (forbiddenSegment) return { ...baseDecision, reason: `${forbiddenSegment}_path_blocked` };
  if (FREE_RENDITIONS.has(scope.renditionLabel)) {
    return { ...baseDecision, reason: "free_rendition_does_not_need_premium_worker" };
  }
  if (!PREMIUM_RENDITIONS.has(scope.renditionLabel)) {
    return { ...baseDecision, reason: "premium_rendition_required" };
  }
  if (!token) return { ...baseDecision, reason: "missing_token" };

  const keyMaterial = toText(env.PREMIUM_CDN_TOKEN_SECRET);
  if (!keyMaterial) return { ...baseDecision, reason: "missing_token_verifier" };
  const verified = await parseAndVerifyPremiumMediaToken(token, keyMaterial);
  if (!verified.valid || !verified.claims) return { ...baseDecision, reason: verified.reason ?? "invalid_token" };

  const claims = verified.claims;
  if (claims.tokenType !== "premium_cdn_playback" || claims.version !== 1) {
    return { ...baseDecision, claims, reason: "token_type_mismatch" };
  }
  if (claims.premiumEntitlement !== true) {
    return { ...baseDecision, claims, reason: "premium_entitlement_missing" };
  }
  if (Number(claims.expiresAtEpochSeconds) <= nowEpochSeconds) {
    return { ...baseDecision, claims, reason: "token_expired" };
  }
  if (Number(claims.issuedAtEpochSeconds) > nowEpochSeconds + 30) {
    return { ...baseDecision, claims, reason: "token_not_yet_valid" };
  }
  const requestUserId = toText(request.headers.get("x-premium-user-id"));
  if (env.PREMIUM_MEDIA_REQUIRE_USER_HEADER === "true" && !requestUserId) {
    return { ...baseDecision, claims, reason: "missing_user_session_scope" };
  }
  if (requestUserId && claims.userId !== requestUserId) {
    return { ...baseDecision, claims, reason: "user_scope_mismatch" };
  }
  if (claims.sourceType !== scope.sourceType || claims.sourceId !== scope.sourceId) {
    return { ...baseDecision, claims, reason: "source_scope_mismatch" };
  }
  if (claims.renditionLabel !== scope.renditionLabel) {
    return { ...baseDecision, claims, reason: "rendition_scope_mismatch" };
  }
  if (normalizePath(claims.path) !== path) {
    return { ...baseDecision, claims, reason: "path_scope_mismatch" };
  }

  return {
    ...baseDecision,
    allowed: true,
    reason: "allowed",
    objectKey: path,
    tokenPresent: true,
    claims,
  };
}

export async function fetchPremiumMediaObject(decision, env) {
  const bucket = env?.PREMIUM_MEDIA_R2_BUCKET;
  if (!decision.allowed) return responseForDenied(decision.reason);
  if (!bucket || typeof bucket.get !== "function") {
    return responseForDenied("premium_media_bucket_unavailable", 503);
  }
  const object = await bucket.get(decision.objectKey);
  if (!object) return responseForDenied("premium_media_object_not_found", 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": object.httpMetadata?.contentType ?? contentTypeFor(decision.objectKey),
      "cache-control": cacheControlFor(decision.objectKey),
      "x-premium-media-access": "allowed",
    },
  });
}

export default {
  async fetch(request, env) {
    const decision = await verifyPremiumMediaRequest({ request, env });
    if (!decision.allowed) return responseForDenied(decision.reason);
    return fetchPremiumMediaObject(decision, env);
  },
};
