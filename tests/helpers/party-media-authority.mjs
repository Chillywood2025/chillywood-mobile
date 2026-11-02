import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/roomSnapshotAuthority.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: module.exports, setTimeout, clearTimeout });
const intentModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/roomAttachmentIntent.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: intentModule.exports, setTimeout, clearTimeout });
export const createRoomAttachmentIntent = intentModule.exports.createRoomAttachmentIntent;

// Native media and transport are controlled boundaries; canonical source,
// generation and membership retirement use the actual production authority.
export async function installAdmittedPartyMediaOwner(runtime) {
  const partyId = runtime.target, userId = runtime.authority.userId;
  runtime.canonicalRoomSnapshot = {
    room: { partyId, hostUserId: 'host', isActive: true, roomGeneration: 'generation-one', startedAt: 'room-start', contentAccessRule: 'free', roomType: 'title', sourceType: 'platform_title', sourceId: 'title-one', titleId: 'title-one' },
    memberships: [{ partyId, userId, joinedAt: 'membership-start', membershipState: 'active', leftAt: null }],
  };
  const owned = module.exports.createRoomSnapshotAuthority({ partyId, userId,
    current: () => runtime.roomAuthority === owned,
    unavailable: () => { if (runtime.roomAuthority === owned) runtime.verifiedRoomOwner = null; },
    read: async () => runtime.canonicalRoomSnapshot,
  });
  runtime.roomAuthority = owned;
  owned.requireMembership();
  assert.ok(await owned.read(), 'fixture starts from an actually admitted canonical room');
  runtime.verifiedRoomOwner = owned;
}
