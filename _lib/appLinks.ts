export const APPLICATION_LINK_SCHEME = "chillywoodmobile:";
export const APPLICATION_LINK_HOST = "chillywoodstream.com";

export const APPLICATION_LEGAL_PATHS = [
  "/privacy",
  "/terms",
  "/account-deletion",
  "/support",
  "/community-guidelines",
  "/creator-rules",
  "/copyright",
  "/support-policy",
  "/premium-terms",
  "/live-rules",
  "/law-enforcement",
  "/moderation-policy",
  "/creator-monetization",
  "/copyright-report",
] as const;

export type ApplicationLegalPath = typeof APPLICATION_LEGAL_PATHS[number];

export type ApplicationLinkKind =
  | "auth_callback"
  | "content"
  | "legal"
  | "password_reset";

export type ApplicationLinkSource =
  | "custom_scheme"
  | "notification_path"
  | "universal_link";

export type ParsedApplicationLink = {
  kind: ApplicationLinkKind;
  pathname: string;
  route: string;
  source: ApplicationLinkSource;
};

export type AuthRedirectState = "PENDING_VALIDATION" | "VALID_INTERNAL" | "REJECTED_MALFORMED" | "REJECTED_STALE" | "CONSUMED";

export type AuthRedirectSessionBinding = {
  userId: string; accountId: string; sessionGeneration: string; restoreOnly: boolean;
};

export type AuthRedirectEnvelope = {
  id: string; route: string; intendedAccountId: string | null;
  userId: string | null; accountId: string | null; sessionGeneration: string | null;
  expiresAt: number; state: AuthRedirectState;
};

type ParsedInput = {
  authParams: URLSearchParams;
  pathname: string;
  routeParams: URLSearchParams;
  source: ApplicationLinkSource;
};

const LEGAL_PATHS = new Set<string>(APPLICATION_LEGAL_PATHS);

const AUTH_CALLBACK_PATHS = new Set([
  "/auth",
  "/auth-callback",
  "/auth/callback",
  "/auth/v1/verify",
  "/auth/verify",
  "/callback",
  "/confirm",
  "/verify",
  "/v1/verify",
]);

const PASSWORD_RESET_PATHS = new Set([
  "/auth/reset-password",
  "/reset-password",
]);

const KNOWN_AUTH_TYPES = new Set([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "reauthentication",
  "signup",
]);

const RECOVERY_AUTH_TYPES = new Set(["recover", "recovery"]);

const AUTH_CALLBACK_PARAM_NAMES = [
  "access_token",
  "code",
  "confirmation_token",
  "error",
  "error_code",
  "error_description",
  "recovery_token",
  "refresh_token",
  "token",
  "token_hash",
] as const;

const AUTH_INPUT_PARAM_NAMES = new Set<string>([...AUTH_CALLBACK_PARAM_NAMES, "email", "flow", "type"]);

const COMMON_NAVIGATION_QUERY_PARAM_NAMES = new Set(["from", "source"]);
const AUTHORITY_QUERY_PARAM_PATTERN = /(?:^|_)(?:account|admin|capability|creator|entitlement|jurisdiction|kyc|market|money|operation|owner|payout|premium|role|session|user)(?:_|$)/iu;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CLAIM_PATTERN = /^[0-9a-f]{64}$/u;
const NAVIGATION_VALUE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/iu;

const MAX_LINK_LENGTH = 8_192;
const AUTH_REDIRECT_TTL_MS = 10 * 60 * 1_000;
const pendingAuthRedirects = new Map<string, AuthRedirectEnvelope>();
const consumedAuthRedirectIds = new Set<string>();
const consumedAuthInputs = new Set<string>();

const hasUnsafeRawPathSegments = (value: string) => {
  const pathOnly = value.split(/[?#]/u, 1)[0] ?? "";
  try {
    return /(?:^|\/)\.{1,2}(?:\/|$)/u.test(decodeURIComponent(pathOnly));
  } catch {
    return true;
  }
};

const normalizeRoutePathname = (value: string) => {
  const withoutTrailingSlash = value === "/" ? value : value.replace(/\/+$/u, "");
  if (!withoutTrailingSlash.startsWith("/") || withoutTrailingSlash.startsWith("//")) return null;
  if (withoutTrailingSlash.includes("\\") || /[\u0000-\u001F\u007F]/u.test(withoutTrailingSlash)) return null;
  if (withoutTrailingSlash !== "/" && withoutTrailingSlash.includes("//")) return null;

  const normalizedSegments: string[] = [];
  for (const encodedSegment of withoutTrailingSlash.split("/").slice(1)) {
    if (!encodedSegment) continue;

    let decodedSegment = "";
    try {
      decodedSegment = decodeURIComponent(encodedSegment);
    } catch {
      return null;
    }

    if (
      !decodedSegment
      || decodedSegment === "."
      || decodedSegment === ".."
      || decodedSegment.includes("/")
      || decodedSegment.includes("\\")
      || /%[0-9a-f]{2}/iu.test(decodedSegment)
      || /[\u0000-\u001F\u007F]/u.test(decodedSegment)
    ) {
      return null;
    }

    normalizedSegments.push(encodeURIComponent(decodedSegment));
  }

  return normalizedSegments.length > 0 ? `/${normalizedSegments.join("/")}` : "/";
};

const mergeFragmentParams = (url: URL) => {
  const params = new URLSearchParams(url.search);
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;

  if (fragment) {
    const fragmentParams = new URLSearchParams(fragment);
    fragmentParams.forEach((value, key) => {
      if (params.has(key)) throw new Error("duplicate_link_parameter");
      params.set(key, value);
    });
  }

  return params;
};

const hasDuplicateParams = (params: URLSearchParams) => {
  const names = new Set<string>();
  for (const [name] of params) { if (names.has(name)) return true; names.add(name); }
  return false;
};

const hasAuthorityQueryParam = (params: URLSearchParams) => {
  for (const [name] of params) if (AUTHORITY_QUERY_PARAM_PATTERN.test(name)) return true;
  return false;
};

const readParsedInput = (value: unknown): ParsedInput | null => {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (
    !raw
    || raw.length > MAX_LINK_LENGTH
    || /[\u0000-\u001F\u007F]/u.test(raw)
    || hasUnsafeRawPathSegments(raw)
  ) {
    return null;
  }

  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return null;

    try {
      const url = new URL(raw, `https://${APPLICATION_LINK_HOST}`);
      const pathname = normalizeRoutePathname(url.pathname);
      if (!pathname) return null;

      return {
        authParams: mergeFragmentParams(url),
        pathname,
        routeParams: new URLSearchParams(url.search),
        source: "notification_path",
      };
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(raw);
    const protocol = url.protocol.toLowerCase();
    if (url.username || url.password) return null;

    if (protocol === APPLICATION_LINK_SCHEME) {
      const hostSegment = url.hostname ? `/${url.hostname}` : "";
      const customSchemePath = `${hostSegment}${url.pathname || ""}` || "/";
      const pathname = normalizeRoutePathname(customSchemePath);
      if (!pathname) return null;

      return {
        authParams: mergeFragmentParams(url),
        pathname,
        routeParams: new URLSearchParams(url.search),
        source: "custom_scheme",
      };
    }

    if (
      protocol !== "https:"
      || url.hostname.toLowerCase() !== APPLICATION_LINK_HOST
      || (url.port && url.port !== "443")
    ) {
      return null;
    }

    const pathname = normalizeRoutePathname(url.pathname);
    if (!pathname) return null;

    return {
      authParams: mergeFragmentParams(url),
      pathname,
      routeParams: new URLSearchParams(url.search),
      source: "universal_link",
    };
  } catch {
    return null;
  }
};

const appendParams = (pathname: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

const readAuthType = (params: URLSearchParams, name: "flow" | "type") => (
  String(params.get(name) ?? "").trim().toLowerCase()
);

const isPasswordRecoveryInput = (pathname: string, params: URLSearchParams) => {
  if (!PASSWORD_RESET_PATHS.has(pathname.toLowerCase()) && !AUTH_CALLBACK_PATHS.has(pathname.toLowerCase())) {
    return false;
  }
  if (PASSWORD_RESET_PATHS.has(pathname.toLowerCase())) return true;

  const authType = readAuthType(params, "type");
  const authFlow = readAuthType(params, "flow");
  if (RECOVERY_AUTH_TYPES.has(authType) || RECOVERY_AUTH_TYPES.has(authFlow)) return true;

  return params.has("access_token") && params.has("refresh_token");
};

const isAuthCallbackInput = (pathname: string, params: URLSearchParams) => {
  return AUTH_CALLBACK_PATHS.has(pathname.toLowerCase());
};

const hasValidAuthParams = (params: URLSearchParams) => {
  if (hasDuplicateParams(params)) return false;
  for (const [name] of params) {
    if (!AUTH_INPUT_PARAM_NAMES.has(name)) return false;
  }

  const type = readAuthType(params, "type");
  const flow = readAuthType(params, "flow");
  if (type && !KNOWN_AUTH_TYPES.has(type) && !RECOVERY_AUTH_TYPES.has(type)) return false;
  if (flow && !KNOWN_AUTH_TYPES.has(flow) && !RECOVERY_AUTH_TYPES.has(flow)) return false;

  const credentialKinds = [params.has("code"), params.has("token_hash"), params.has("token"),
    params.has("access_token") || params.has("refresh_token")].filter(Boolean).length;
  if (credentialKinds > 1) return false;
  if (params.has("access_token") !== params.has("refresh_token")) return false;
  if (params.has("token") !== params.has("email")) return false;
  return true;
};

const navigationParams = (pathname: string, params: URLSearchParams) => {
  const safe = new URLSearchParams();
  let valid = true;
  if (hasDuplicateParams(params) || hasAuthorityQueryParam(params)) return null;
  params.forEach((value, name) => {
    if (COMMON_NAVIGATION_QUERY_PARAM_NAMES.has(name) && NAVIGATION_VALUE_PATTERN.test(value)) {
      safe.set(name, value); return;
    }
    if (pathname === "/channel-studio" && (name === "tab" || name === "focus") && NAVIGATION_VALUE_PATTERN.test(value)) {
      safe.set(name, value); return;
    }
    if (pathname === "/settings" && name === "section" && NAVIGATION_VALUE_PATTERN.test(value)) {
      safe.set(name, value); return;
    }
    if (!pathname.startsWith("/chat/")) { valid = false; return; }
    if (name === "openCall" && value === "1") safe.set(name, value);
    else if (name === "startCall" && (value === "voice" || value === "video")) safe.set(name, value);
    else if ((name === "callInviteId") && UUID_PATTERN.test(value)) safe.set(name, value);
    else if ((name === "foregroundCallClaim" || name === "nativeCallClaim") && CLAIM_PATTERN.test(value)) safe.set(name, value);
    else if (name === "nativeCallUuid" && (UUID_PATTERN.test(value) || CLAIM_PATTERN.test(value))) safe.set(name, value);
    else if (name === "nativeCallAction" && (value === "answer" || value === "decline")) safe.set(name, value);
    else valid = false;
  });
  return valid ? safe : null;
};

const resolveExactDynamicPath = (pathname: string, root: string, dynamicSegmentCount = 1) => {
  const segments = pathname.split("/").filter(Boolean);
  const rootSegments = root.split("/").filter(Boolean);
  if (segments.length !== rootSegments.length + dynamicSegmentCount) return null;

  const rootMatches = rootSegments.every((segment, index) => segments[index]?.toLowerCase() === segment);
  if (!rootMatches) return null;

  return `/${[...rootSegments, ...segments.slice(rootSegments.length)].join("/")}`;
};

const resolveSupportedContentPath = (pathname: string) => {
  const normalized = pathname.toLowerCase();
  if ([
    "/",
    "/channel-studio",
    "/chat",
    "/settings",
    "/subscribe",
    "/watch-party",
    "/watch-party/live-stage",
  ].includes(normalized)) {
    return normalized;
  }

  for (const root of [
    "/channel",
    "/channel-subscription",
    "/chat",
    "/event",
    "/player",
    "/profile",
    "/spectate",
    "/title",
    "/vip-pass",
    "/watch-party",
  ]) {
    const resolved = resolveExactDynamicPath(pathname, root);
    if (resolved) return resolved;
  }

  return resolveExactDynamicPath(pathname, "/player/replay")
    ?? resolveExactDynamicPath(pathname, "/watch-party/live-stage");
};

export const parseApplicationLink = (value: unknown): ParsedApplicationLink | null => {
  const input = readParsedInput(value);
  if (!input) return null;

  if (isPasswordRecoveryInput(input.pathname, input.authParams)) {
    if (!hasValidAuthParams(input.authParams)) return null;
    return { kind: "password_reset", pathname: "/reset-password",
      route: appendParams("/reset-password", input.authParams), source: input.source };
  }

  if (isAuthCallbackInput(input.pathname, input.authParams)) {
    if (!hasValidAuthParams(input.authParams)) return null;
    return { kind: "auth_callback", pathname: "/auth-callback",
      route: appendParams("/auth-callback", input.authParams), source: input.source };
  }

  const normalizedPathname = input.pathname.toLowerCase();
  if (LEGAL_PATHS.has(normalizedPathname)) {
    if (input.authParams.toString() || hasAuthorityQueryParam(input.routeParams)) return null;
    return { kind: "legal", pathname: normalizedPathname, route: normalizedPathname, source: input.source };
  }

  const contentPathname = resolveSupportedContentPath(input.pathname);
  if (!contentPathname) return null;
  const safeParams = navigationParams(contentPathname, input.routeParams);
  if (!safeParams) return null;

  return { kind: "content", pathname: contentPathname,
    route: appendParams(contentPathname, safeParams), source: input.source };
};

export const resolveApplicationRoute = (value: unknown) => parseApplicationLink(value)?.route ?? null;

export const resolveApplicationRouteByKind = (
  value: unknown,
  kind: ApplicationLinkKind,
) => {
  const parsed = parseApplicationLink(value);
  return parsed?.kind === kind ? parsed.route : null;
};

const authInputFingerprint = (route: string) => {
  let hash = 2_166_136_261;
  for (let index = 0; index < route.length; index += 1) hash = Math.imul(hash ^ route.charCodeAt(index), 16_777_619);
  return `${route.length}:${(hash >>> 0).toString(16)}`;
};

export function consumeApplicationAuthInput(value: unknown, kind: "auth_callback" | "password_reset") {
  const parsed = parseApplicationLink(value);
  if (!parsed || parsed.kind !== kind || consumedAuthInputs.size >= 512) return null;
  const fingerprint = `${kind}:${authInputFingerprint(parsed.route)}`;
  if (consumedAuthInputs.has(fingerprint)) return null;
  consumedAuthInputs.add(fingerprint);
  return parsed;
}

export const isCreatorReplayApplicationLink = (value: unknown) => {
  const parsed = parseApplicationLink(value);
  return parsed?.kind === "content" && parsed.pathname.startsWith("/player/replay/");
};

const exactBinding = (binding: AuthRedirectSessionBinding) => ({
  userId: String(binding?.userId ?? "").trim(), accountId: String(binding?.accountId ?? "").trim(),
  sessionGeneration: String(binding?.sessionGeneration ?? "").trim(), restoreOnly: binding?.restoreOnly,
});

export function createAuthRedirectEnvelope(
  value: unknown,
  input: { id: string; intendedAccountId?: string | null; now?: number; ttlMs?: number },
): AuthRedirectEnvelope | null {
  if (typeof value !== "string" || !value.trim().startsWith("/")) return null;
  const parsed = parseApplicationLink(value);
  const id = String(input.id ?? "").trim();
  const intendedAccountId = String(input.intendedAccountId ?? "").trim() || null;
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const ttlMs = Number.isFinite(input.ttlMs)
    ? Math.max(1, Math.min(Number(input.ttlMs), AUTH_REDIRECT_TTL_MS))
    : AUTH_REDIRECT_TTL_MS;
  if (!parsed || parsed.kind === "auth_callback" || parsed.kind === "password_reset" || !id) return null;
  return { id, route: parsed.route, intendedAccountId, userId: null, accountId: null,
    sessionGeneration: null, expiresAt: now + ttlMs, state: "PENDING_VALIDATION" };
}

export function validateAuthRedirectEnvelope(
  envelope: AuthRedirectEnvelope,
  session: AuthRedirectSessionBinding,
  now = Date.now(),
): AuthRedirectEnvelope {
  const binding = exactBinding(session);
  const reparsed = parseApplicationLink(envelope?.route);
  const canonicalRoute = reparsed?.kind === "content" || reparsed?.kind === "legal" ? reparsed.route : null;
  if (!envelope || !canonicalRoute || canonicalRoute !== envelope.route
    || !binding.userId || !binding.accountId || !binding.sessionGeneration || binding.restoreOnly !== false
    || !Number.isFinite(envelope.expiresAt) || now >= envelope.expiresAt || envelope.state === "CONSUMED") {
    return { ...envelope, state: "REJECTED_STALE" };
  }
  if (envelope.intendedAccountId && envelope.intendedAccountId !== binding.accountId) {
    return { ...envelope, state: "REJECTED_STALE" };
  }
  if (envelope.state === "VALID_INTERNAL") {
    return envelope.userId === binding.userId
      && envelope.accountId === binding.accountId
      && envelope.sessionGeneration === binding.sessionGeneration
      ? envelope
      : { ...envelope, state: "REJECTED_STALE" };
  }
  if (envelope.state !== "PENDING_VALIDATION") return { ...envelope, state: "REJECTED_MALFORMED" };
  return { ...envelope, userId: binding.userId, accountId: binding.accountId,
    sessionGeneration: binding.sessionGeneration, state: "VALID_INTERNAL" };
}

export function consumeAuthRedirectEnvelope(
  envelope: AuthRedirectEnvelope,
  session: AuthRedirectSessionBinding,
  consumedIds: ReadonlySet<string> = new Set(),
  now = Date.now(),
): { envelope: AuthRedirectEnvelope; route: string | null } {
  if (consumedIds.has(envelope.id)) return { envelope: { ...envelope, state: "REJECTED_STALE" }, route: null };
  const validated = validateAuthRedirectEnvelope(envelope, session, now);
  if (validated.state !== "VALID_INTERNAL") return { envelope: validated, route: null };
  return { envelope: { ...validated, state: "CONSUMED" }, route: validated.route };
}

const createRedirectId = () => {
  if (typeof globalThis.crypto?.getRandomValues !== "function") return null;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

export function registerAuthRedirect(value: unknown, intendedAccountId?: string | null) {
  const id = createRedirectId();
  if (!id) return null;
  const envelope = createAuthRedirectEnvelope(value, { id, intendedAccountId });
  if (!envelope) return null;
  if (pendingAuthRedirects.size >= 64) pendingAuthRedirects.delete(pendingAuthRedirects.keys().next().value ?? "");
  pendingAuthRedirects.set(id, envelope);
  return id;
}

export function consumeRegisteredAuthRedirect(id: unknown, session: AuthRedirectSessionBinding) {
  const normalizedId = String(id ?? "").trim();
  const envelope = pendingAuthRedirects.get(normalizedId);
  if (!envelope) return null;
  const result = consumeAuthRedirectEnvelope(envelope, session, consumedAuthRedirectIds);
  pendingAuthRedirects.delete(normalizedId);
  if (!result.route) return null;
  if (consumedAuthRedirectIds.size >= 128) consumedAuthRedirectIds.clear();
  consumedAuthRedirectIds.add(normalizedId);
  return result.route;
}
