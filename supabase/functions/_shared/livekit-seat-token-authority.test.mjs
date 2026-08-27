import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokenSource = readFileSync(new URL("../livekit-token/index.ts", import.meta.url), "utf8");
const currentAuthorityMigration = readFileSync(
  new URL("../../migrations/202608250001_chilly_chat_room_authority_closure.sql", import.meta.url),
  "utf8",
);

test("LiveKit minting re-reads exact room authority and applies the bounded TTL", () => {
  const handler = tokenSource.slice(tokenSource.indexOf("Deno.serve(async (req)"));
  const authorityIndex = handler.indexOf("await resolveEffectiveParticipantRole(");
  const ttlIndex = handler.indexOf("resolveWatchPartyLiveKitTokenTtlSeconds(");
  const mintIndex = handler.indexOf("new AccessToken(");
  assert.ok(authorityIndex >= 0, "exact authority resolver called by token handler");
  assert.ok(ttlIndex > authorityIndex, "TTL resolved from exact authority after role resolution");
  assert.ok(mintIndex > ttlIndex, "token minted after TTL decision");
  assert.match(tokenSource, /adminClient\.rpc\(\n\s+"resolve_watch_party_livekit_viewer_authority"/u);
  assert.match(tokenSource, /ttl: `\$\{tokenTtlSeconds\}s`/u);
  assert.match(tokenSource, /p_session_generation: sessionGeneration/u);
  assert.match(tokenSource, /sessionGeneration: authResult\.sessionGeneration/u);
  assert.match(tokenSource, /canUpdateOwnMetadata: false/u);
  assert.doesNotMatch(tokenSource, /ttl: liveCostGuardDecision\.tokenTtlSeconds \?/u);
});

test("a paid Seat can only mint a viewer token", () => {
  const roleResolver = tokenSource.match(
    /async function resolveEffectiveParticipantRole\([\s\S]*?\n\}\n\nDeno\.serve/u,
  )?.[0] ?? "";
  const paidSeatBranch = roleResolver.match(
    /if \(authority\.allowed && authority\.paidSeatRequired\) \{[\s\S]*?\n    \}/u,
  )?.[0] ?? "";
  assert.match(paidSeatBranch, /participantRole: "viewer"/u);
  assert.match(paidSeatBranch, /canPublish: false/u);
  assert.match(paidSeatBranch, /watchPartyAuthority: authority/u);
  assert.doesNotMatch(paidSeatBranch, /participantRole: "(?:host|speaker)"/u);
});

test("a paid watch-party host is re-authorized before retaining host grants", () => {
  const watchPartyBranch = tokenSource.match(
    /if \(room\.kind === "watch-party"\) \{[\s\S]*?\n  \}\n\n  if \(room\.hostUserId === userId\)/u,
  )?.[0] ?? "";
  const hostBranch = watchPartyBranch.match(
    /if \(room\.hostUserId === userId\) \{[\s\S]*?\n    \}/u,
  )?.[0] ?? "";
  const authorityReadIndex = watchPartyBranch.indexOf("resolveCurrentWatchPartyLiveKitAuthority(");
  const hostBranchIndex = watchPartyBranch.indexOf("if (room.hostUserId === userId)");
  assert.ok(authorityReadIndex >= 0, "current exact room authority is read");
  assert.ok(hostBranchIndex > authorityReadIndex, "host grants follow exact room authority");
  assert.match(hostBranch, /!authority\.allowed \|\| !authority\.hostAuthority/u);
  assert.match(hostBranch, /participantRole: "host"/u);
  assert.match(hostBranch, /canPublish: true/u);
  assert.match(hostBranch, /watchPartyAuthority: authority/u);
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
  const resolver = currentAuthorityMigration.match(
    /create or replace function public\."resolve_watch_party_livekit_viewer_authority"\([\s\S]*?\n\$\$;/u,
  )?.[0] ?? "";
  const roomAccessResolver = currentAuthorityMigration.match(
    /create or replace function public\."watch_party_room_self_access_allowed_internal"\([\s\S]*?\n\$\$;/u,
  )?.[0] ?? "";
  assert.match(resolver, /security definer\s+set search_path = ''/u);
  assert.match(resolver, /watch_party_room_self_access_allowed_internal/u);
  assert.match(resolver, /p_session_generation is null\s+and auth\.role\(\) = 'service_role'/u);
  assert.match(resolver, /session_row\."id" = p_session_generation/u);
  assert.match(resolver, /session_row\."user_id" = p_user_id/u);
  assert.match(resolver, /session_row\."not_after" > now\(\)/u);
  assert.match(resolver, /paid_room_host_creator_authority_required/u);
  assert.match(resolver, /'hostAuthority', true/u);
  assert.match(resolver, /least\(\s+coalesce\(ticket\."expires_at"[\s\S]*?coalesce\(grant_row\."expires_at"[\s\S]*?coalesce\(offer\."ends_at"/u);
  assert.match(roomAccessResolver, /security definer\s+set search_path = ''/u);
  assert.match(roomAccessResolver, /provider_event\."status" = 'processed'/u);
  assert.match(roomAccessResolver, /intent\."status" = 'consumed'/u);
  assert.match(roomAccessResolver, /intent\."source_type" = 'watch_party_live'/u);
  assert.match(roomAccessResolver, /intent\."source_id" = offer\."id"/u);
  assert.match(roomAccessResolver, /intent\."creator_id" = offer\."creator_id"/u);
  assert.match(roomAccessResolver, /grant_row\."metadata" -> 'viewer_access_only' = 'true'::jsonb/u);
  assert.match(roomAccessResolver, /ticket\."metadata" -> 'grants_livekit_publish'[\s\S]*?= 'false'::jsonb/u);
  assert.match(roomAccessResolver, /link\."original_transaction_id" =[\s\S]*?provider_event\."metadata" ->> 'original_transaction_id'/u);
  assert.match(currentAuthorityMigration,
    /revoke all on function public\."resolve_watch_party_livekit_viewer_authority"\(\s+text, uuid, uuid\s+\) from public, anon, authenticated;/u);
  assert.match(currentAuthorityMigration,
    /grant execute on function public\."resolve_watch_party_livekit_viewer_authority"\(\s+text, uuid, uuid\s+\) to service_role;/u);
});
