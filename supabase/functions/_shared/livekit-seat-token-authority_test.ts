import {
  normalizeWatchPartyViewerAuthority,
  resolveLiveKitTokenTtlSeconds,
} from "./livekit-seat-token-authority.ts";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

Deno.test("paid Seat authority readback requires structured server truth", () => {
  assertEquals(normalizeWatchPartyViewerAuthority({
    allowed: true,
    hostAuthority: false,
    paidSeatRequired: true,
    speakerEligible: false,
    expiresAt: "2026-08-24T12:01:00.000Z",
    reason: "paid_seat_exact",
  }), {
    allowed: true,
    hostAuthority: false,
    paidSeatRequired: true,
    speakerEligible: false,
    expiresAt: "2026-08-24T12:01:00.000Z",
    reason: "paid_seat_exact",
  }, "exact authority");
  assertEquals(normalizeWatchPartyViewerAuthority({
    allowed: "true",
    hostAuthority: false,
    paidSeatRequired: true,
    reason: "paid_seat_exact",
  }), null, "string boolean rejected");
  assertEquals(normalizeWatchPartyViewerAuthority({
    allowed: true,
    hostAuthority: false,
    paidSeatRequired: true,
    reason: "",
  }), null, "missing reason rejected");
  assertEquals(normalizeWatchPartyViewerAuthority({
    allowed: true,
    paidSeatRequired: true,
    reason: "paid_room_host_authority",
  }), null, "missing host authority proof rejected");
  assertEquals(normalizeWatchPartyViewerAuthority({
    allowed: true,
    expiresAt: null,
    hostAuthority: false,
    paidSeatRequired: true,
    reason: "exact_paid_seat_viewer_authority",
  }), null, "missing paid authority expiry rejected");
});

Deno.test("ordinary room token TTL remains unchanged", () => {
  assertEquals(resolveLiveKitTokenTtlSeconds({
    baselineTtlSeconds: 900,
    paidSeatRequired: false,
    nowMillis: NOW,
  }), 900, "ordinary TTL");
});

Deno.test("paid Seat token TTL is capped to the short authoritative refresh interval", () => {
  assertEquals(resolveLiveKitTokenTtlSeconds({
    authorityExpiresAt: null,
    baselineTtlSeconds: 3600,
    nowMillis: NOW,
    paidSeatRequired: true,
  }), 30, "short Seat TTL");
});

Deno.test("paid Seat token TTL cannot outlive exact authority expiry", () => {
  assertEquals(resolveLiveKitTokenTtlSeconds({
    authorityExpiresAt: "2026-08-24T12:00:12.900Z",
    baselineTtlSeconds: 3600,
    nowMillis: NOW,
    paidSeatRequired: true,
  }), 12, "remaining Seat authority");
  assertEquals(resolveLiveKitTokenTtlSeconds({
    authorityExpiresAt: "2026-08-24T12:00:00.000Z",
    baselineTtlSeconds: 3600,
    nowMillis: NOW,
    paidSeatRequired: true,
  }), null, "expired Seat authority");
  assertEquals(resolveLiveKitTokenTtlSeconds({
    authorityExpiresAt: "malformed",
    baselineTtlSeconds: 3600,
    nowMillis: NOW,
    paidSeatRequired: true,
  }), null, "malformed Seat expiry");
});

Deno.test("a stricter global cost guard remains authoritative for paid Seats", () => {
  assertEquals(resolveLiveKitTokenTtlSeconds({
    authorityExpiresAt: "2026-08-24T12:05:00.000Z",
    baselineTtlSeconds: 10,
    nowMillis: NOW,
    paidSeatRequired: true,
  }), 10, "cost guard TTL");
});
