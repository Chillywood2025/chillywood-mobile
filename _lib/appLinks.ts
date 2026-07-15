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

const MAX_LINK_LENGTH = 8_192;

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
      if (!params.has(key)) params.set(key, value);
    });
  }

  return params;
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
  if (PASSWORD_RESET_PATHS.has(pathname.toLowerCase())) return true;

  const authType = readAuthType(params, "type");
  const authFlow = readAuthType(params, "flow");
  if (RECOVERY_AUTH_TYPES.has(authType) || RECOVERY_AUTH_TYPES.has(authFlow)) return true;

  return params.has("access_token") && params.has("refresh_token");
};

const isAuthCallbackInput = (pathname: string, params: URLSearchParams) => {
  if (AUTH_CALLBACK_PATHS.has(pathname.toLowerCase())) return true;

  const authType = readAuthType(params, "type");
  const authFlow = readAuthType(params, "flow");
  if (KNOWN_AUTH_TYPES.has(authType) || KNOWN_AUTH_TYPES.has(authFlow)) return true;

  return AUTH_CALLBACK_PARAM_NAMES.some((name) => params.has(name));
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
    return {
      kind: "password_reset",
      pathname: "/reset-password",
      route: appendParams("/reset-password", input.authParams),
      source: input.source,
    };
  }

  if (isAuthCallbackInput(input.pathname, input.authParams)) {
    return {
      kind: "auth_callback",
      pathname: "/auth-callback",
      route: appendParams("/auth-callback", input.authParams),
      source: input.source,
    };
  }

  const normalizedPathname = input.pathname.toLowerCase();
  if (LEGAL_PATHS.has(normalizedPathname)) {
    return {
      kind: "legal",
      pathname: normalizedPathname,
      route: appendParams(normalizedPathname, input.routeParams),
      source: input.source,
    };
  }

  const contentPathname = resolveSupportedContentPath(input.pathname);
  if (!contentPathname) return null;

  return {
    kind: "content",
    pathname: contentPathname,
    route: appendParams(contentPathname, input.routeParams),
    source: input.source,
  };
};

export const resolveApplicationRoute = (value: unknown) => parseApplicationLink(value)?.route ?? null;

export const resolveApplicationRouteByKind = (
  value: unknown,
  kind: ApplicationLinkKind,
) => {
  const parsed = parseApplicationLink(value);
  return parsed?.kind === kind ? parsed.route : null;
};

export const isCreatorReplayApplicationLink = (value: unknown) => {
  const parsed = parseApplicationLink(value);
  return parsed?.kind === "content" && parsed.pathname.startsWith("/player/replay/");
};
