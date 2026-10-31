import {
  parseWatchPartyLiveKitAuthority,
  parseWatchPartyLiveKitAuthorityDecision,
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

Deno.test("reserved room claims preserve bounded admission and eligibility without granting publish or host", () => {
  const raw = { allowed: true, expiresAt: "2026-08-25T12:00:25.000Z", hostAuthority: false,
    paidSeatRequired: true, speakerEligible: true, grantsPublish: false, reason: "verified_reserved_room_seat",
    reservedSeatClaimId: "11111111-1111-4111-8111-111111111111", partyId: "RESERVED",
    roomSessionId: "22222222-2222-4222-8222-222222222222" };
  const stage = parseWatchPartyLiveKitAuthority(raw, NOW);
  assertEquals(stage?.speakerEligible, true, "reserved Stage spot allows host review");
  assertEquals(stage?.hostAuthority, false, "payment cannot become host");
  assertEquals(resolveWatchPartyLiveKitTokenTtlSeconds(stage!, 3600, NOW), 25, "reserved TTL bounded");
  assertEquals(parseWatchPartyLiveKitAuthority({ ...raw, speakerEligible: false }, NOW)?.speakerEligible,
    false, "Party admission remains viewer only");
  for (const patch of [{ reservedSeatClaimId: null }, { roomSessionId: null }, { partyId: "" },
    { speakerEligible: undefined }, { grantsPublish: true }, { grantsPublish: undefined }, { hostAuthority: true },
    { paidSeatRequired: false }, { expiresAt: "2026-08-25T12:01:00.000Z" }]) {
    assertEquals(parseWatchPartyLiveKitAuthority({ ...raw, ...patch }, NOW), null, JSON.stringify(patch));
  }
});

Deno.test("canonical title recovery accepts host or viewer and preserves finite token TTL", () => {
  for (const hostAuthority of [false, true]) {
    const proof = parseWatchPartyLiveKitAuthority({
      allowed: true,
      expiresAt: "2026-08-25T12:00:25.000Z",
      hostAuthority,
      paidSeatRequired: false,
      speakerEligible: true,
      reason: "canonical_party_room_target_premium_authority",
    }, NOW);
    assertEquals(proof?.hostAuthority, hostAuthority, "exact host status retained");
    assertEquals(proof?.paidSeatRequired, false, "Premium does not invent a Seat Pass");
    assertEquals(resolveWatchPartyLiveKitTokenTtlSeconds(proof!, 300, NOW), 25, "Premium proof TTL");
    assertEquals(resolveWatchPartyLiveKitTokenTtlSeconds(proof!, 10, NOW), 10, "shorter cost guard TTL");
  }
});

Deno.test("title recovery cannot weaken paid boundaries or extend stale authority", () => {
  const base = {
    allowed: true,
    expiresAt: "2026-08-25T12:00:25.000Z",
    hostAuthority: false,
    paidSeatRequired: false,
    speakerEligible: true,
    reason: "canonical_party_room_target_premium_authority",
  };
  for (const mutation of [
    { paidSeatRequired: true },
    { speakerEligible: undefined },
    { speakerEligible: false },
    { hostAuthority: "true" },
    { expiresAt: null },
    { expiresAt: "invalid" },
    { expiresAt: "2026-08-25T12:00:00.000Z" },
    { expiresAt: "2026-08-25T12:00:36.000Z" },
    { reason: "unrecognized_recovery" },
  ]) {
    assertEquals(parseWatchPartyLiveKitAuthority({ ...base, ...mutation }, NOW), null, JSON.stringify(mutation));
  }
});

Deno.test("deployed denial aliases remain denials, never viewer authority", () => {
  for (const reason of ["viewer_authority_invalid", "exact_live_access_authority_required"]) {
    const value = { allowed: false, paidSeatRequired: true, hostAuthority: false, expiresAt: null, reason };
    assertEquals(parseWatchPartyLiveKitAuthorityDecision(value, NOW)?.allowed, false, reason);
    assertEquals(parseWatchPartyLiveKitAuthority(value, NOW), null, "denial cannot issue token");
    assertEquals(parseWatchPartyLiveKitAuthority({ ...value, allowed: true }, NOW), null, "denial reason cannot allow");
  }
});
