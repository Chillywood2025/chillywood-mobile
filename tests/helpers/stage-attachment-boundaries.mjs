// Production room-intent helper; only native AppState and canonical read APIs
// are controlled boundaries. These fixtures do not grant admission themselves.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export const stageAttachmentNames = ['stageAttachmentRequestRef', 'selectedStageAttachmentRequestRef', 'stageAttachmentAccessRef', 'stageAttachmentModeRef', 'retireStageAttachmentSelection'];
export const stageAttachmentSetup = `
  const room = runtime.stageSnapshot.room, stageMode = runtime.stageMode ?? 'live', canUseBetaStage = runtime.betaAllowed !== false,
    isFocused = runtime.focused !== false, roomMissing = runtime.roomMissing ?? false,
    blockedRoomAccess = runtime.blockedRoomAccess ?? null, liveMoneyAccess = runtime.liveMoneyAccess ?? {allowed: true};
  const membershipMapRef = useRef({}); membershipMapRef.current = Object.fromEntries(runtime.stageSnapshot.memberships.map(member => [member.userId, member]));
  const liveSurfaceRef = useRef('stage'); liveSurfaceRef.current = runtime.liveSurface ?? 'stage';
`;
export const isStageAttachmentLifecycle = text => text.startsWith('stageAttachmentAccessRef.current =') || text.startsWith('stageAttachmentModeRef.current =')
  || (text.startsWith('useEffect(') && (text.includes('[commentMediaContext, retireStageAttachmentSelection]')
    || text.includes('[stageMode, retireStageAttachmentSelection]')
    || text.includes('if (!stageAttachmentAccessRef.current) retireStageAttachmentSelection(')));

export function createStageAttachmentBoundaries(runtime) {
  const listeners = new Set();
  runtime.stageSnapshot ??= {
    room: { partyId: runtime.target, roomType: 'live', roomGeneration: 'original-generation', startedAt: '2026-11-01T00:00:00Z',
      isActive: true, sourceType: 'spectator_playback', sourceId: 'original-source', titleId: null, hostUserId: 'host', contentAccessRule: 'free' },
    memberships: [{ partyId: runtime.target, userId: runtime.authority.userId, joinedAt: '2026-11-01T00:01:00Z', membershipState: 'active', leftAt: null }],
  };
  runtime.stageReads = []; runtime.stageAccessReads = []; runtime.stageMoneyReads = []; runtime.stagePremiumReads = [];
  const scope = { exports: {}, setTimeout, clearTimeout };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/roomAttachmentIntent.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  const AppState = {
    get currentState() { return runtime.active === false ? 'background' : 'active'; },
    addEventListener(event, listener) {
      if (event !== 'change') throw Error(`Unexpected AppState event ${event}`);
      listeners.add(listener); return { remove: () => listeners.delete(listener) };
    },
  };
  return {
    emit(next) { runtime.active = next === 'active'; for (const listener of [...listeners]) listener(next); },
    listeners,
    scope: {
      ...scope.exports, AppState,
      getPartyRoomSnapshot: async partyId => {
        runtime.stageReads.push(partyId);
        return runtime.stageRead ? runtime.stageRead(partyId) : (runtime.canonicalSnapshot === undefined ? runtime.stageSnapshot : runtime.canonicalSnapshot);
      },
      resolveRoomAccess: async input => {
        runtime.stageAccessReads.push(input);
        return runtime.stageAccessRead ? runtime.stageAccessRead(input) : { isAllowed: runtime.canonicalAccessAllowed !== false };
      },
      readLiveWatchPartyMoneyAccess: async partyId => {
        runtime.stageMoneyReads.push(partyId);
        return runtime.stageMoneyRead ? runtime.stageMoneyRead(partyId) : { allowed: runtime.canonicalMoneyAllowed !== false };
      },
      requireLiveFirstPremium: async input => { runtime.stagePremiumReads.push({ kind: 'live_first', ...input }); return { allowed: runtime.canonicalPremiumAllowed !== false }; },
      requireLiveWatchPartyPremium: async input => { runtime.stagePremiumReads.push({ kind: 'live_watch_party', ...input }); return { allowed: runtime.canonicalPremiumAllowed !== false }; },
    },
  };
}
