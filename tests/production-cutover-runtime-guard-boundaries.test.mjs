import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const roomMigration = fs.readFileSync(
  path.join(
    repositoryRoot,
    'supabase/migrations/202608250001_chilly_chat_room_authority_closure.sql',
  ),
  'utf8',
);

const normalize = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const normalizedRoomMigration = normalize(roomMigration);

test('paid-room cutover service provenance is bounded and explicitly cleared', () => {
  const transactionStart = normalizedRoomMigration.indexOf(
    'begin; alter table public."watch_party_room_memberships" disable trigger "enforce_watch_party_room_membership_block_guard";',
  );
  const temporaryGrant = normalizedRoomMigration.indexOf(
    'grant execute on function public."watch_party_room_self_access_allowed_internal"(text, text) to service_role;',
    transactionStart,
  );
  const start = normalizedRoomMigration.indexOf(
    'set local role service_role;',
    temporaryGrant,
  );
  const claims = normalizedRoomMigration.indexOf(
    `select pg_catalog.set_config( 'request.jwt.claims', '{"role":"service_role"}', true );`,
    start,
  );
  const paidRoomUpdate = normalizedRoomMigration.indexOf(
    'update public."watch_party_room_memberships" membership',
    claims,
  );
  const paidOfferPredicate = normalizedRoomMigration.indexOf(
    'from public."paid_watch_party_offers" offer',
    paidRoomUpdate,
  );
  const resetRole = normalizedRoomMigration.indexOf(
    'set local role postgres;',
    paidOfferPredicate,
  );
  const clearClaims = normalizedRoomMigration.indexOf(
    `select pg_catalog.set_config('request.jwt.claims', '{}', true);`,
    resetRole,
  );
  const restoreTrigger = normalizedRoomMigration.indexOf(
    'enable trigger "enforce_watch_party_room_membership_block_guard";',
    clearClaims,
  );
  const temporaryRevoke = normalizedRoomMigration.indexOf(
    'revoke execute on function public."watch_party_room_self_access_allowed_internal"(text, text) from service_role;',
    clearClaims,
  );
  const transactionCommit = normalizedRoomMigration.indexOf(
    'commit;',
    restoreTrigger,
  );

  assert.ok(transactionStart >= 0);
  assert.ok(temporaryGrant > transactionStart);
  assert.ok(start > temporaryGrant);
  assert.ok(claims > start);
  assert.ok(paidRoomUpdate > claims);
  assert.ok(paidOfferPredicate > paidRoomUpdate);
  assert.ok(resetRole > paidOfferPredicate);
  assert.ok(clearClaims > resetRole);
  assert.ok(temporaryRevoke > clearClaims);
  assert.ok(restoreTrigger > temporaryRevoke);
  assert.ok(transactionCommit > restoreTrigger);
  assert.equal(
    normalizedRoomMigration.match(/set local role service_role;/g)?.length,
    1,
  );
  assert.equal(
    normalizedRoomMigration.match(/\{"role":"service_role"\}/g)?.length,
    1,
  );
  assert.equal(normalizedRoomMigration.match(/begin;/g)?.length, 1);
  assert.equal(normalizedRoomMigration.match(/commit;/g)?.length, 1);
});

test('cutover does not create a permanent room-authority bypass', () => {
  assert.doesNotMatch(
    normalizedRoomMigration,
    /alter role .*request\.jwt\.claims/,
  );
  assert.doesNotMatch(
    normalizedRoomMigration,
    /alter database .*request\.jwt\.claims/,
  );
  assert.doesNotMatch(
    normalizedRoomMigration,
    /session_replication_role/,
  );
  assert.match(
    normalizedRoomMigration,
    /revoke all on function public\."watch_party_room_self_access_allowed_internal"\( text, text \) from public, anon, authenticated, service_role;/,
  );
});
