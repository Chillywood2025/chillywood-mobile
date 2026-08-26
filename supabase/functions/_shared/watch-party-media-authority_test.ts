import {
  canReadWatchPartyMedia,
  WATCH_PARTY_MEDIA_MEMBERSHIP_WINDOW_MS,
} from "./watch-party-media-authority.ts";

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
};

const NOW = Date.parse("2026-08-25T12:00:00.000Z");
const ACTOR = "11111111-1111-4111-8111-111111111111";
const HOST = "22222222-2222-4222-8222-222222222222";

const currentMember = {
  lastSeenAt: new Date(NOW - WATCH_PARTY_MEDIA_MEMBERSHIP_WINDOW_MS + 1).toISOString(),
  membershipState: "active",
  userId: ACTOR,
};

Deno.test("watch-party media allows only host or current exact member", () => {
  assertEquals(canReadWatchPartyMedia({
    actorUserId: HOST,
    blockedByHost: false,
    contentAccessAllowed: true,
    hostUserId: HOST,
    membership: null,
    nowMillis: NOW,
    restricted: false,
  }), true, "host");
  assertEquals(canReadWatchPartyMedia({
    actorUserId: ACTOR,
    blockedByHost: false,
    contentAccessAllowed: true,
    hostUserId: HOST,
    membership: currentMember,
    nowMillis: NOW,
    restricted: false,
  }), true, "current member");
  assertEquals(canReadWatchPartyMedia({
    actorUserId: ACTOR,
    blockedByHost: false,
    contentAccessAllowed: true,
    hostUserId: HOST,
    membership: null,
    nowMillis: NOW,
    restricted: false,
  }), false, "outsider");
});

Deno.test("watch-party media fails closed for stale, removed, mismatched, blocked, and restricted authority", () => {
  const cases = [
    {
      label: "stale",
      value: {
        ...currentMember,
        lastSeenAt: new Date(NOW - WATCH_PARTY_MEDIA_MEMBERSHIP_WINDOW_MS - 1).toISOString(),
      },
      blockedByHost: false,
      restricted: false,
    },
    {
      label: "removed",
      value: { ...currentMember, membershipState: "removed" },
      blockedByHost: false,
      restricted: false,
    },
    {
      label: "wrong member",
      value: { ...currentMember, userId: HOST },
      blockedByHost: false,
      restricted: false,
    },
    {
      label: "blocked",
      value: currentMember,
      blockedByHost: true,
      restricted: false,
    },
    {
      label: "restricted",
      value: currentMember,
      blockedByHost: false,
      restricted: true,
    },
    {
      label: "entitlement revoked",
      value: currentMember,
      blockedByHost: false,
      contentAccessAllowed: false,
      restricted: false,
    },
  ];

  for (const testCase of cases) {
    assertEquals(canReadWatchPartyMedia({
      actorUserId: ACTOR,
      blockedByHost: testCase.blockedByHost,
      contentAccessAllowed: testCase.contentAccessAllowed ?? true,
      hostUserId: HOST,
      membership: testCase.value,
      nowMillis: NOW,
      restricted: testCase.restricted,
    }), false, testCase.label);
  }
});
