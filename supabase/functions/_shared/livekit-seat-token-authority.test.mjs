import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokenSource = readFileSync(new URL("../livekit-token/index.ts", import.meta.url), "utf8");
const successorMigration = readFileSync(
  new URL("../../migrations/20260824034109_creator_money_authority_integrity_closeout.sql", import.meta.url),
  "utf8",
);

test("LiveKit minting re-reads exact room authority and applies the bounded TTL", () => {
  const authorityIndex = tokenSource.indexOf('adminClient.rpc("resolve_watch_party_livekit_viewer_authority"');
  const ttlIndex = tokenSource.indexOf("resolveLiveKitTokenTtlSeconds({");
  const mintIndex = tokenSource.indexOf("new AccessToken(");
  assert.ok(authorityIndex >= 0, "authority RPC present");
  assert.ok(ttlIndex > authorityIndex, "TTL resolved after authority");
  assert.ok(mintIndex > ttlIndex, "token minted after TTL decision");
  assert.match(tokenSource, /ttl: `\$\{tokenTtlSeconds\}s`/u);
  assert.match(tokenSource, /p_session_generation: sessionGeneration/u);
  assert.match(tokenSource, /sessionGeneration: authResult\.sessionGeneration/u);
  assert.match(tokenSource, /canUpdateOwnMetadata: false/u);
  assert.doesNotMatch(tokenSource, /ttl: liveCostGuardDecision\.tokenTtlSeconds \?/u);
});

test("a paid Seat can only mint a viewer token", () => {
  const paidSeatBranch = tokenSource.match(
    /if \(viewerAuthority\.authority\.paidSeatRequired\) \{[\s\S]*?\n    \}/u,
  )?.[0] ?? "";
  assert.match(paidSeatBranch, /participantRole: "viewer"/u);
  assert.match(paidSeatBranch, /canPublish: false/u);
  assert.match(paidSeatBranch, /paidSeatRequired: true/u);
});

test("a paid watch-party host is re-authorized before retaining host grants", () => {
  const watchPartyBranch = tokenSource.match(
    /if \(room\.kind === "watch-party"\) \{[\s\S]*?\n  \}\n\n  if \(room\.hostUserId === userId\)/u,
  )?.[0] ?? "";
  const hostBranch = watchPartyBranch.match(
    /if \(room\.hostUserId === userId\) \{[\s\S]*?\n    \}/u,
  )?.[0] ?? "";
  assert.match(hostBranch, /readWatchPartyViewerAuthority\(/u);
  assert.match(hostBranch, /if \(!hostAuthority\.ok\) return hostAuthority/u);
  assert.match(hostBranch, /!hostAuthority\.authority\.hostAuthority/u);
  assert.match(hostBranch, /participantRole: "host"/u);
  assert.match(hostBranch, /canPublish: true/u);
  assert.match(hostBranch, /paidSeatRequired: hostAuthority\.authority\.paidSeatRequired/u);
});

test("participant-state enforcement revalidates the connected target's signed session", () => {
  const enforcement = tokenSource.match(
    /async function enforceParticipantState\([\s\S]*?\n\}\n\nconst readRequiredEnv/u,
  )?.[0] ?? "";
  const participantReadIndex = enforcement.indexOf("roomService.listParticipants(room.roomName)");
  const metadataReadIndex = enforcement.indexOf("readLiveKitParticipantSessionGeneration(targetParticipant.metadata");
  const authorityReadIndex = enforcement.indexOf("resolveEffectiveParticipantRole(");
  const removalIndex = enforcement.indexOf("roomService.removeParticipant(room.roomName, targetUserId)");
  assert.ok(participantReadIndex >= 0, "connected participant list is read");
  assert.ok(metadataReadIndex > participantReadIndex, "signed target metadata follows participant discovery");
  assert.ok(authorityReadIndex > metadataReadIndex, "authority is re-read after exact target session recovery");
  assert.ok(removalIndex > authorityReadIndex, "failed or stale target authority reaches removal");
  assert.match(enforcement, /targetUserId,\n\s+targetSessionGeneration,/u);
  assert.match(enforcement, /roomActive && targetConnected && targetSessionGeneration/u);
  assert.doesNotMatch(enforcement, /targetUserId,\n\s+null,\n\s+\{\}/u);
});

test("the token RPC is service-only and reuses exact durable Seat evidence", () => {
  const resolver = successorMigration.match(
    /create or replace function public\."resolve_watch_party_livekit_viewer_authority"\([\s\S]*?\n\$\$;/u,
  )?.[0] ?? "";
  assert.match(resolver, /security definer\s+set search_path = ''/u);
  assert.match(resolver, /watch_party_room_self_access_allowed_internal/u);
  assert.match(resolver, /provider_event\."status"='processed'/u);
  assert.match(resolver, /intent\."status"='consumed'/u);
  assert.match(resolver, /transaction_link\."binding_state"='exact'/u);
  assert.match(resolver, /not transaction_link\."terminal"/u);
  assert.match(resolver, /wave1_creator_money_subject_authorized_internal/u);
  assert.match(resolver, /paid_room_host_creator_authority_required/u);
  assert.match(resolver, /'hostAuthority',true/u);
  assert.match(resolver, /least\(ticket\."expires_at",grant_row\."expires_at",offer\."ends_at"\)/u);
  assert.match(resolver, /money_purchase_intent_session_authorized_internal/u);
  assert.match(successorMigration,
    /revoke all on function public\."resolve_watch_party_livekit_viewer_authority"\(text,uuid,uuid\) from public,anon,authenticated;/u);
  assert.match(successorMigration,
    /grant execute on function public\."resolve_watch_party_livekit_viewer_authority"\(text,uuid,uuid\) to service_role;/u);
});
