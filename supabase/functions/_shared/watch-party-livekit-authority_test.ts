import {
  parseWatchPartyLiveKitAuthority,
  resolveWatchPartyLiveKitTokenTtlSeconds,
} from "./watch-party-livekit-authority.ts";

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
};

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

Deno.test("LiveKit accepts only a schema-bound paid viewer proof", () => {
  const proof = parseWatchPartyLiveKitAuthority({
    allowed: true,
    expiresAt: "2026-08-25T12:00:25.000Z",
    hostAuthority: false,
    paidSeatRequired: true,
    reason: "exact_paid_seat_viewer_authority",
  }, NOW);
  assertEquals(proof?.reason, "exact_paid_seat_viewer_authority", "paid reason");
  assertEquals(proof?.hostAuthority, false, "no host authority");
  assertEquals(resolveWatchPartyLiveKitTokenTtlSeconds(proof!, 300, NOW), 25, "bounded TTL");
});

Deno.test("malformed, denied, mismatched, and stale authority fails closed", () => {
  const cases: unknown[] = [
    null,
    { allowed: false, paidSeatRequired: true, hostAuthority: false, expiresAt: null, reason: "exact_paid_seat_authority_required" },
    { allowed: true, paidSeatRequired: "true", hostAuthority: false, expiresAt: "2026-08-25T12:00:25.000Z", reason: "exact_paid_seat_viewer_authority" },
    { allowed: true, paidSeatRequired: true, hostAuthority: true, expiresAt: "2026-08-25T12:00:25.000Z", reason: "exact_paid_seat_viewer_authority" },
    { allowed: true, paidSeatRequired: true, hostAuthority: false, expiresAt: "2026-08-25T11:59:59.000Z", reason: "exact_paid_seat_viewer_authority" },
    { allowed: true, paidSeatRequired: true, hostAuthority: false, expiresAt: "2026-08-25T12:05:00.000Z", reason: "exact_paid_seat_viewer_authority" },
    { allowed: true, paidSeatRequired: false, hostAuthority: false, expiresAt: null, reason: "unrecognized" },
    { allowed: true, paidSeatRequired: false, hostAuthority: false, expiresAt: "2026-08-25T12:00:25.000Z", reason: "non_seat_room_authority" },
  ];
  for (const [index, value] of cases.entries()) {
    assertEquals(parseWatchPartyLiveKitAuthority(value, NOW), null, `case ${index}`);
  }
});

Deno.test("non-paid host and viewer proofs remain bounded by configured TTL", () => {
  const viewer = parseWatchPartyLiveKitAuthority({
    allowed: true,
    expiresAt: null,
    hostAuthority: false,
    paidSeatRequired: false,
    reason: "non_seat_room_authority",
  }, NOW);
  const host = parseWatchPartyLiveKitAuthority({
    allowed: true,
    expiresAt: null,
    hostAuthority: true,
    paidSeatRequired: false,
    reason: "non_seat_room_host_authority",
  }, NOW);
  assertEquals(resolveWatchPartyLiveKitTokenTtlSeconds(viewer!, 120, NOW), 120, "viewer TTL");
  assertEquals(resolveWatchPartyLiveKitTokenTtlSeconds(host!, null, NOW), 3600, "host default TTL");
});

Deno.test("Live Access stays viewer-only while Live Seat is only speaker eligible", () => {
  const access = parseWatchPartyLiveKitAuthority({
    allowed: true,
    expiresAt: "2026-08-25T12:00:25.000Z",
    hostAuthority: false,
    paidSeatRequired: true,
    speakerEligible: false,
    reason: "exact_live_access_viewer_authority",
  }, NOW);
  const seat = parseWatchPartyLiveKitAuthority({
    allowed: true,
    expiresAt: "2026-08-25T12:00:25.000Z",
    hostAuthority: false,
    paidSeatRequired: true,
    speakerEligible: true,
    reason: "exact_live_seat_eligibility_authority",
  }, NOW);
  assertEquals(access?.speakerEligible, false, "access pass cannot publish");
  assertEquals(seat?.speakerEligible, true, "seat pass can enter host approval flow");
  assertEquals(seat?.hostAuthority, false, "seat pass is not host authority");
});

Deno.test("missing paid seat eligibility preserves viewer entry but cannot publish", () => {
  const viewer = parseWatchPartyLiveKitAuthority({
    allowed: true,
    expiresAt: "2026-08-25T12:00:25.000Z",
    hostAuthority: false,
    paidSeatRequired: true,
    speakerEligible: false,
    reason: "exact_live_seat_eligibility_authority_required",
  }, NOW);
  assertEquals(viewer?.allowed, true, "viewer admission stays valid");
  assertEquals(viewer?.speakerEligible, false, "missing Seat Pass cannot publish");
  assertEquals(viewer?.hostAuthority, false, "missing Seat Pass cannot become host");
});
