import { supabase } from "./supabase";

export type UsernameAvailabilityStatus =
  | "idle"
  | "available"
  | "taken"
  | "reserved"
  | "too_short"
  | "invalid"
  | "not_allowed"
  | "checking";

export type UsernameAvailability = {
  username: string;
  available: boolean;
  status: UsernameAvailabilityStatus;
  message: string;
};

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "owner",
  "system",
  "support",
  "help",
  "legal",
  "dmca",
  "privacy",
  "copyright",
  "security",
  "api",
  "root",
  "moderator",
  "mod",
  "staff",
  "official",
  "verified",
  "chillywood",
  "chiwood",
  "rachi",
  "rachi_official",
  "chillywood.rachi",
  "money",
  "payments",
  "premium",
  "live",
  "watchparty",
  "watch_party",
  "platform",
  "studio",
]);

const BLOCKED_USERNAME_PATTERN =
  /(slur|nazi|terror|kill|abuse|chillywoodofficial|officialchillywood|supportchillywood|legalchillywood|adminchillywood|ownerchillywood|rachiofficial)/i;

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]*[a-z0-9])$/;

const toText = (value: unknown) => String(value ?? "").trim();

const usernameRpc = supabase as unknown as {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

export function normalizeUsernameHandle(value: unknown) {
  return toText(value).replace(/^@+/, "").toLowerCase();
}

export function formatUsernameHandle(value: unknown) {
  const username = normalizeUsernameHandle(value);
  return username ? `@${username}` : "";
}

export function validateUsernameHandle(value: unknown): UsernameAvailability {
  const username = normalizeUsernameHandle(value);

  if (username.length < 3) {
    return { username, available: false, status: "too_short", message: "Too short" };
  }

  if (username.length > 24 || !USERNAME_PATTERN.test(username) || username.includes("..") || username.includes("__") || username.includes("._") || username.includes("_.")) {
    return {
      username,
      available: false,
      status: "invalid",
      message: "Use letters, numbers, underscores, or dots",
    };
  }

  if (BLOCKED_USERNAME_PATTERN.test(username)) {
    return { username, available: false, status: "not_allowed", message: "Not allowed" };
  }

  if (RESERVED_USERNAMES.has(username)) {
    return { username, available: false, status: "reserved", message: "This username is reserved" };
  }

  return { username, available: true, status: "available", message: "Available" };
}

type UsernameAvailabilityRpcPayload = {
  username?: unknown;
  available?: unknown;
  status?: unknown;
  message?: unknown;
};

export async function checkUsernameAvailability(value: unknown): Promise<UsernameAvailability> {
  const local = validateUsernameHandle(value);
  if (!local.available) return local;

  const { data, error } = await usernameRpc.rpc("check_username_availability", {
    p_username: local.username,
  });

  if (error || !data) {
    return {
      username: local.username,
      available: false,
      status: "not_allowed",
      message: "Not available",
    };
  }

  const payload = data as UsernameAvailabilityRpcPayload;
  const status = toText(payload.status) as UsernameAvailabilityStatus;
  return {
    username: normalizeUsernameHandle(payload.username) || local.username,
    available: payload.available === true && status === "available",
    status: status || "not_allowed",
    message: toText(payload.message) || "Not available",
  };
}

type UsernameUpdateRpcPayload = {
  username?: unknown;
  message?: unknown;
};

export function getUsernameErrorMessage(error: unknown) {
  const raw = String(
    (error as { message?: unknown; code?: unknown } | null)?.message
    ?? (error as { code?: unknown } | null)?.code
    ?? "",
  ).toLowerCase();

  if (raw.includes("reserved")) return "This username is reserved";
  if (raw.includes("taken") || raw.includes("23505") || raw.includes("duplicate")) return "Already taken";
  if (raw.includes("not_allowed")) return "Not allowed";
  if (raw.includes("invalid") || raw.includes("23514")) return "Use letters, numbers, underscores, or dots";
  if (raw.includes("sign_in_required")) return "Sign in before updating your username.";
  return "Couldn't update username. Try again.";
}

export async function updateMyUsername(value: unknown): Promise<{ username: string; message: string }> {
  const local = validateUsernameHandle(value);
  if (!local.available) throw new Error(local.message);

  const { data, error } = await usernameRpc.rpc("update_my_username", {
    p_username: local.username,
  });

  if (error) throw new Error(getUsernameErrorMessage(error));

  const payload = (data ?? {}) as UsernameUpdateRpcPayload;
  return {
    username: normalizeUsernameHandle(payload.username) || local.username,
    message: toText(payload.message) || "Username updated",
  };
}

export function buildUsernameSuggestions(displayName: unknown) {
  const compact = toText(displayName)
    .toLowerCase()
    .replace(/[^a-z0-9 ._]+/g, "")
    .replace(/\s+/g, "");
  const dotted = toText(displayName)
    .toLowerCase()
    .replace(/[^a-z0-9 ._]+/g, "")
    .replace(/\s+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/(^[._]+|[._]+$)/g, "");
  const base = normalizeUsernameHandle(compact).replace(/(^[._]+|[._]+$)/g, "");
  const suffix = Math.floor(10 + Math.random() * 90);

  return Array.from(new Set([base, dotted, `${base}${suffix}`]))
    .map(normalizeUsernameHandle)
    .filter((candidate) => validateUsernameHandle(candidate).available)
    .slice(0, 3);
}
