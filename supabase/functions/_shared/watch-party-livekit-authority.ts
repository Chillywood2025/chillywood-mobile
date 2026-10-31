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
    | "canonical_party_room_target_premium_authority"
    | "paid_room_host_authority"
    | "verified_reserved_room_seat";
  reservedSeatClaimId?: string;
  partyId?: string;
  roomSessionId?: string;
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
    | "exact_live_access_authority_required"
    | "paid_room_host_creator_authority_required"
    | "room_viewer_authority_required"
    | "viewer_session_authority_invalid"
    | "viewer_authority_invalid";
};

const ALLOWED_REASONS = new Set<WatchPartyLiveKitAuthority["reason"]>([
  "exact_paid_seat_viewer_authority",
  "exact_live_access_viewer_authority",
  "exact_live_seat_eligibility_authority",
  "exact_live_seat_eligibility_authority_required",
  "non_seat_room_authority",
  "non_seat_room_host_authority",
  "canonical_party_room_target_premium_authority",
  "paid_room_host_authority",
  "verified_reserved_room_seat",
]);
const DENIED_REASONS = new Set<Extract<WatchPartyLiveKitAuthorityDecision, { allowed: false }>["reason"]>([
  "exact_paid_seat_authority_required",
  "exact_live_pass_authority_required",
  "exact_live_access_authority_required",
  "paid_room_host_creator_authority_required",
  "room_viewer_authority_required",
  "viewer_session_authority_invalid",
  "viewer_authority_invalid",
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
  if (reason === "verified_reserved_room_seat") {
    if (row.paidSeatRequired !== true || row.hostAuthority !== false
      || !isExactBoolean(row.speakerEligible) || row.grantsPublish !== false
      || typeof row.reservedSeatClaimId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.reservedSeatClaimId)
      || typeof row.roomSessionId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.roomSessionId)
      || typeof row.partyId !== "string" || !row.partyId.trim()
      || typeof row.expiresAt !== "string" || !isCurrentBoundedExpiry(row.expiresAt, nowMillis)) return null;
    // Reserved Stage seats are eligibility, not permission to publish. Party
    // admission returns speakerEligible=false. Both still need the token
    // handler's fresh membership and persisted host-approved speaker checks.
    return { allowed: true, paidSeatRequired: true, speakerEligible: row.speakerEligible,
      hostAuthority: false, expiresAt: row.expiresAt, reason, reservedSeatClaimId: row.reservedSeatClaimId,
      partyId: row.partyId, roomSessionId: row.roomSessionId };
  }
  // The canonical title-room recovery RPC proves exact current Premium and
  // membership authority for either host or viewer. Its proof is intentionally
  // finite even though no paid Seat Pass is required. Do not generalize this
  // exception to arbitrary non-seat responses or discard its expiry.
  if (reason === "canonical_party_room_target_premium_authority") {
    if (
      row.paidSeatRequired !== false
      || row.speakerEligible !== true
      || typeof row.expiresAt !== "string"
      || !isCurrentBoundedExpiry(row.expiresAt, nowMillis)
    ) return null;
    return {
      allowed: true,
      paidSeatRequired: false,
      speakerEligible: true,
      hostAuthority: row.hostAuthority,
      expiresAt: row.expiresAt,
      reason,
    };
  }
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
  if (!isCurrentBoundedExpiry(row.expiresAt, nowMillis)) return null;
  return {
    allowed: true,
    paidSeatRequired: true,
    speakerEligible: reason === "exact_live_seat_eligibility_authority" && speakerEligible,
    hostAuthority: row.hostAuthority,
    expiresAt: row.expiresAt,
    reason,
  };
};

const isCurrentBoundedExpiry = (expiresAt: string, nowMillis: number) => {
  const expiresAtMillis = Date.parse(expiresAt);
  // DB authority intentionally expires within 30 seconds. A small skew margin
  // prevents clock jitter from turning a valid proof into a false denial.
  return Number.isFinite(expiresAtMillis)
    && expiresAtMillis > nowMillis
    && expiresAtMillis <= nowMillis + 35_000;
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
  if (!authority.expiresAt) return configured;
  const authoritySeconds = Math.max(
    1,
    Math.floor((Date.parse(authority.expiresAt) - nowMillis) / 1000),
  );
  return Math.min(configured, authoritySeconds, 30);
};
