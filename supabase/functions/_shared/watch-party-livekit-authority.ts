export type WatchPartyLiveKitAuthority = {
  allowed: true;
  paidSeatRequired: boolean;
  speakerEligible: boolean;
  hostAuthority: boolean;
  expiresAt: string | null;
  reason:
    | "exact_paid_seat_viewer_authority"
    | "exact_live_access_viewer_authority"
    | "exact_live_seat_eligibility_authority"
    | "exact_live_seat_eligibility_authority_required"
    | "non_seat_room_authority"
    | "non_seat_room_host_authority"
    | "paid_room_host_authority";
};

export type WatchPartyLiveKitAuthorityDecision = WatchPartyLiveKitAuthority | {
  allowed: false;
  paidSeatRequired: boolean;
  speakerEligible: boolean;
  hostAuthority: boolean;
  expiresAt: null;
  reason:
    | "exact_paid_seat_authority_required"
    | "exact_live_pass_authority_required"
    | "paid_room_host_creator_authority_required"
    | "room_viewer_authority_required"
    | "viewer_session_authority_invalid";
};

const ALLOWED_REASONS = new Set<WatchPartyLiveKitAuthority["reason"]>([
  "exact_paid_seat_viewer_authority",
  "exact_live_access_viewer_authority",
  "exact_live_seat_eligibility_authority",
  "exact_live_seat_eligibility_authority_required",
  "non_seat_room_authority",
  "non_seat_room_host_authority",
  "paid_room_host_authority",
]);
const DENIED_REASONS = new Set<Extract<WatchPartyLiveKitAuthorityDecision, { allowed: false }>["reason"]>([
  "exact_paid_seat_authority_required",
  "exact_live_pass_authority_required",
  "paid_room_host_creator_authority_required",
  "room_viewer_authority_required",
  "viewer_session_authority_invalid",
]);

const isExactBoolean = (value: unknown): value is boolean =>
  value === true || value === false;

export const parseWatchPartyLiveKitAuthorityDecision = (
  value: unknown,
  nowMillis = Date.now(),
): WatchPartyLiveKitAuthorityDecision | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const speakerEligible = isExactBoolean(row.speakerEligible)
    ? row.speakerEligible
    : row.hostAuthority === true || row.paidSeatRequired === false;
  if (
    !isExactBoolean(row.allowed)
    || !isExactBoolean(row.paidSeatRequired)
    || !isExactBoolean(row.hostAuthority)
    || typeof row.reason !== "string"
  ) return null;

  if (row.allowed === false) {
    if (
      row.expiresAt !== null
      || !DENIED_REASONS.has(
        row.reason as Extract<WatchPartyLiveKitAuthorityDecision, { allowed: false }>["reason"],
      )
    ) return null;
    return {
      allowed: false,
      paidSeatRequired: row.paidSeatRequired,
      speakerEligible: false,
      hostAuthority: row.hostAuthority,
      expiresAt: null,
      reason: row.reason as Extract<WatchPartyLiveKitAuthorityDecision, { allowed: false }>["reason"],
    };
  }

  if (!ALLOWED_REASONS.has(row.reason as WatchPartyLiveKitAuthority["reason"])) return null;

  const reason = row.reason as WatchPartyLiveKitAuthority["reason"];
  if (!row.paidSeatRequired) {
    if (
      row.expiresAt !== null
      || (reason !== "non_seat_room_authority"
        && reason !== "non_seat_room_host_authority")
      || row.hostAuthority !== (reason === "non_seat_room_host_authority")
    ) return null;
    return {
      allowed: true,
      paidSeatRequired: false,
      speakerEligible,
      hostAuthority: row.hostAuthority,
      expiresAt: null,
      reason,
    };
  }

  if (
    typeof row.expiresAt !== "string"
    || (reason !== "exact_paid_seat_viewer_authority"
      && reason !== "exact_live_access_viewer_authority"
      && reason !== "exact_live_seat_eligibility_authority"
      && reason !== "exact_live_seat_eligibility_authority_required"
      && reason !== "paid_room_host_authority")
    || row.hostAuthority !== (reason === "paid_room_host_authority")
  ) return null;
  const expiresAtMillis = Date.parse(row.expiresAt);
  // DB authority intentionally expires within 30 seconds. A small skew margin
  // prevents clock jitter from turning a valid proof into a false denial.
  if (
    !Number.isFinite(expiresAtMillis)
    || expiresAtMillis <= nowMillis
    || expiresAtMillis > nowMillis + 35_000
  ) return null;
  return {
    allowed: true,
    paidSeatRequired: true,
    speakerEligible: reason === "exact_live_seat_eligibility_authority" && speakerEligible,
    hostAuthority: row.hostAuthority,
    expiresAt: row.expiresAt,
    reason,
  };
};

export const parseWatchPartyLiveKitAuthority = (
  value: unknown,
  nowMillis = Date.now(),
): WatchPartyLiveKitAuthority | null => {
  const decision = parseWatchPartyLiveKitAuthorityDecision(value, nowMillis);
  return decision?.allowed === true ? decision : null;
};

export const resolveWatchPartyLiveKitTokenTtlSeconds = (
  authority: WatchPartyLiveKitAuthority,
  configuredTtlSeconds: number | null,
  nowMillis = Date.now(),
) => {
  const configured = Number.isFinite(configuredTtlSeconds)
    ? Math.max(1, Math.floor(Number(configuredTtlSeconds)))
    : 3600;
  if (!authority.paidSeatRequired || !authority.expiresAt) return configured;
  const authoritySeconds = Math.max(
    1,
    Math.floor((Date.parse(authority.expiresAt) - nowMillis) / 1000),
  );
  return Math.min(configured, authoritySeconds, 30);
};
