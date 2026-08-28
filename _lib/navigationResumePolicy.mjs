export const NAVIGATION_RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const AUTH_NAVIGATION_RESUME_BLOCKED_PATHS = [
  "/auth",
  "/auth-callback",
  "/auth/callback",
  "/auth/reset-password",
  "/auth/v1/verify",
  "/auth/verify",
  "/callback",
  "/confirm",
  "/forgot-password",
  "/login",
  "/reset-password",
  "/signup",
  "/v1/verify",
  "/verify",
];

export const TRANSIENT_NAVIGATION_RESUME_BLOCKED_PATHS = [
  "/communication",
  "/watch-party/live-stage",
];

export const CALL_SENSITIVE_NAVIGATION_PARAM_NAMES = [
  "callInviteId",
  "foregroundCallClaim",
  "nativeCallAction",
  "nativeCallClaim",
  "nativeCallUuid",
  "openCall",
  "startCall",
];

const matchesBlockedPath = (pathname, blockedPath) => (
  pathname === blockedPath || pathname.startsWith(`${blockedPath}/`)
);

export const normalizeNavigationResumePath = (
  pathname,
  legalPaths = [],
) => {
  const normalized = String(pathname ?? "").trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("?") || normalized.includes("#") || normalized.includes("\\")) return null;
  if (normalized.length > 512) return null;

  const lowerPath = normalized.toLowerCase();
  const blockedPaths = [
    ...AUTH_NAVIGATION_RESUME_BLOCKED_PATHS,
    ...TRANSIENT_NAVIGATION_RESUME_BLOCKED_PATHS,
    ...legalPaths.map((path) => String(path).toLowerCase()),
  ];

  if (blockedPaths.some((blockedPath) => matchesBlockedPath(lowerPath, blockedPath))) return null;
  return normalized;
};

const readParamValue = (params, name) => {
  if (!params || typeof params !== "object") return undefined;
  return params[name];
};

export const hasCallSensitiveNavigationParams = (pathname, params) => {
  const lowerPath = String(pathname ?? "").trim().toLowerCase();
  if (!(lowerPath === "/chat" || lowerPath.startsWith("/chat/"))) return false;

  return CALL_SENSITIVE_NAVIGATION_PARAM_NAMES.some((name) => {
    const value = readParamValue(params, name);
    if (Array.isArray(value)) return value.some((entry) => String(entry ?? "").trim().length > 0);
    return String(value ?? "").trim().length > 0;
  });
};

export const parseNavigationResumeRecord = (
  raw,
  legalPaths = [],
  now = Date.now(),
) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const pathname = normalizeNavigationResumePath(parsed?.pathname, legalPaths);
    const savedAt = Number(parsed?.savedAt);
    if (!pathname || !Number.isFinite(savedAt)) return null;
    if (savedAt > now || now - savedAt > NAVIGATION_RESUME_MAX_AGE_MS) return null;
    return { pathname, savedAt };
  } catch {
    return null;
  }
};
