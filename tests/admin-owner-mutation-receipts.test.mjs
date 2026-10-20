import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const FIXED_NOW = Date.parse('2026-10-20T02:00:00.000Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
}
const timestampAt = offset => new FixedDate(FIXED_NOW + offset).toISOString();
const date = timestampAt(60 * 60 * 1000);
const pastDate = timestampAt(-60 * 60 * 1000);
const REQUEST_ID = '__request_id__';
const transaction = (mode, grantIds, grant = null) => ({ ok: true, requestId: REQUEST_ID, mode, scopeAsOf: date,
  revokedAt: date, revokedCount: grantIds.length, grantIds, grant });
const helperCode = ts.transpileModule(readFileSync('_lib/adminOwnerControls.ts', 'utf8'), { compilerOptions: options }).outputText;
function helperHarness(data, error = null, controls = {}) {
  const calls = [];
  const scope = {
    exports: {}, Date: FixedDate, crypto: webcrypto,
    require(name) {
      if (name === './supabase') return { supabase: { functions: { invoke: async (endpoint, request) => {
        calls.push({ endpoint, request });
        const value = typeof data === 'function' ? await data(request, calls.length) : data;
        return { data: value === undefined ? undefined : JSON.parse(JSON.stringify(value).replaceAll(REQUEST_ID, request.body.requestId ?? REQUEST_ID)), error };
      } } } };
      if (name === 'react-native-get-random-values') return {};
      if (name === './accountBoundSupabaseMutation') return {
        captureAccountBoundSupabaseMutationSubject: async () => ({ accessToken: 'synthetic-access-token', authority: {
          userId: 'actor-1', accountId: 'actor-1', sessionGeneration: controls.generation ?? 'session-1', state: 'ACTIVE', restoreOnly: false,
        } }),
        assertAccountBoundSupabaseMutationSubjectCurrent: () => { if (controls.changed) throw Object.assign(new Error('account changed'), {code: 'account_changed'}); },
      };
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: {} } };
      if (['expo-application', 'expo-device'].includes(name)) return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(helperCode, scope);
  return { api: scope.exports, calls };
}

const ownerInput = { reason: 'Synthetic test reason', targetEmail: 'target@example.test' };
const successorInput = {
  challengeId: 'challenge-1', passcode: '123456', passcodeSalt: 'synthetic-salt', reason: 'Synthetic succession reason',
  successorOwnerMembershipId: 'successor-1', targetOwnerMembershipId: 'owner-1', typedConfirmation: 'STEP DOWN FIRST OWNER',
};
const permission = { id: 'grant-1', target_user_id: 'target-1', permission_key: 'legal_review', status: 'active' };
const canaryResult = { key: 'check', label: 'Check', message: 'Synthetic evidence', status: 'pass' };
const cases = [
  ['firstOwnerGrantOwner', ownerInput, { result: { ok: true, membershipId: 'owner-2', role: 'owner', status: 'active' } }, 'first_owner_grant_owner'],
  ['firstOwnerRevokeOwner', ownerInput, { result: { ok: true, membershipId: 'owner-2', role: 'owner', status: 'revoked' } }, 'first_owner_revoke_owner'],
  ['firstOwnerStartStepDown', { password: 'synthetic', reason: 'Synthetic test reason', successorEmail: 'successor@example.test' }, {
    challenge: { ok: true, challengeId: 'challenge-1', expiresAt: date, passcodeSalt: 'synthetic-salt', successorOwnerMembershipId: 'successor-1', targetOwnerMembershipId: 'owner-1', typedConfirmationRequired: 'STEP DOWN FIRST OWNER' },
    passcode: '123456', passcodePlaintextStored: false,
  }, 'first_owner_start_step_down'],
  ['firstOwnerCompleteStepDown', successorInput, { result: { ok: true, newFirstOwnerMarkerId: 'marker-1', successorMembershipId: 'successor-1', previousOwnerStatus: 'revoked' } }, 'first_owner_complete_step_down'],
  ['applyPermissionTemplate', { ...ownerInput, templateKey: 'legal_reviewer' }, { ok: true, permissions: [permission], template: { key: 'legal_reviewer', label: 'Legal Reviewer', permissions: ['legal_review'] } }, 'template_apply'],
  ['revokePermissionTemplate', { ...ownerInput, templateKey: 'legal_reviewer' }, { ok: true, revoked: [{ ...permission, status: 'revoked' }] }, 'template_revoke'],
  ['activateBreakGlass', { reason: 'Synthetic emergency' }, { ok: true, session: { id: 'session-1', status: 'active', expires_at: date } }, 'break_glass_activate'],
  ['endBreakGlass', { sessionId: 'session-1' }, { ok: true, session: { id: 'session-1', status: 'ended' } }, 'break_glass_end'],
  ['createLegalRequest', { requestingAgency: 'Synthetic agency' }, { ok: true, request: { id: 'request-1', status: 'received' } }, 'legal_request_create'],
  ['updateLegalRequest', { id: 'request-1', status: 'closed' }, { ok: true, request: { id: 'request-1', status: 'closed' } }, 'legal_request_update'],
  ['trustCurrentOwnerDevice', undefined, { ok: true, device: { id: 'device-1', trustStatus: 'trusted', trustedAt: date, revokedAt: null } }, 'trust_current_owner_device'],
  ['revokeOwnerDevice', { deviceId: 'device-1', confirmation: 'UNTRUST DEVICE', reason: 'Synthetic test reason' }, { ok: true, device: { id: 'device-1', trustStatus: 'revoked', revokedAt: date } }, 'revoke_owner_device'],
  ['revokeTemporaryOwnerGrant', { grantId: 'grant-1', confirmation: 'REVOKE GRANT', reason: 'Synthetic test reason' }, transaction('single', ['grant-1'], { id: 'grant-1', state: 'revoked', revokedAt: date }), 'revoke_temporary_owner_grant'],
  ['revokeAllTemporaryOwnerGrants', { confirmation: 'REVOKE GRANTS', reason: 'Synthetic test reason' }, transaction('bulk', ['grant-1', 'grant-2']), 'revoke_all_temporary_owner_grants'],
  ['runOwnerControlCanary', undefined, { run: { id: REQUEST_ID, status: 'completed', results: [canaryResult] }, summary: { passCount: 1, failCount: 0, manualRequiredCount: 0 } }, 'canary_run'],
];

const unverified = error => {
  assert.equal(error.code, 'owner_control_outcome_unverified');
  assert.match(error.message, /Refresh the affected data before deciding whether to retry/);
  return true;
};
const invalidEnvelopes = [null, undefined, false, 0, 1, 'ok', [], [{}], {}, { error: 'denied' }, { ok: false }, { ok: true }];

for (const [name, input, receipt, action] of cases) {
  test(`${name}: production helper rejects malformed/error/negative transport success without retrying`, async () => {
    for (const data of invalidEnvelopes) {
      const h = helperHarness(data);
      await assert.rejects(h.api[name](input), unverified);
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0].endpoint, 'admin-owner-controls');
      assert.equal(h.calls[0].request.body.action, action);
    }
  });
  test(`${name}: actual action-specific positive receipt resolves`, async () => {
    const h = helperHarness(receipt);
    await h.api[name](input);
    assert.equal(h.calls.length, 1);
  });
  test(`${name}: positive-looking receipt cannot override an explicit negative result`, async () => {
    for (const negative of [{ error: 'denied' }, { ok: false }, { success: false }]) {
      await assert.rejects(helperHarness({ ...receipt, ...negative }).api[name](input), unverified);
    }
    const nested = ['result', 'challenge', 'template', 'session', 'request', 'device', 'grant', 'run'].find(key => key in receipt);
    if (nested && receipt[nested] !== null) {
      for (const negative of [null, [], {}, { ...receipt[nested], error: 'denied' }, { ...receipt[nested], ok: false }]) {
        await assert.rejects(helperHarness({ ...receipt, [nested]: negative }).api[name](input), unverified);
      }
    }
  });
}

test('identity-bearing receipts must match the requested target and expected status', async () => {
  const changes = [
    ['firstOwnerGrantOwner', data => { data.result.status = 'revoked'; }],
    ['firstOwnerRevokeOwner', data => { data.result.membershipId = ' '; }],
    ['firstOwnerCompleteStepDown', data => { data.result.successorMembershipId = 'other-successor'; }],
    ['firstOwnerStartStepDown', data => { data.challenge.targetOwnerMembershipId = data.challenge.successorOwnerMembershipId; }],
    ['firstOwnerStartStepDown', data => { data.passcode = ''; }],
    ['firstOwnerStartStepDown', data => { data.challenge.expiresAt = 'invalid'; }],
    ['applyPermissionTemplate', data => { data.template.key = 'different_template'; }],
    ['applyPermissionTemplate', data => { data.permissions[0].permission_key = 'different_permission'; }],
    ['applyPermissionTemplate', data => { data.permissions = []; }],
    ['revokePermissionTemplate', data => { data.revoked[0].status = 'active'; }],
    ['activateBreakGlass', data => { data.session.status = 'ended'; }],
    ['endBreakGlass', data => { data.session.id = 'other-session'; }],
    ['createLegalRequest', data => { data.request.status = 'unknown'; }],
    ['updateLegalRequest', data => { data.request.id = 'other-request'; }],
    ['updateLegalRequest', data => { data.request.status = 'received'; }],
    ['trustCurrentOwnerDevice', data => { data.device.trustStatus = 'not_recorded'; }],
    ['revokeOwnerDevice', data => { data.device.id = 'other-device'; }],
    ['revokeTemporaryOwnerGrant', data => { data.grant.id = 'other-grant'; }],
    ['revokeTemporaryOwnerGrant', data => { data.grant.state = 'active'; }],
    ['runOwnerControlCanary', data => { data.run.results = []; }],
    ['runOwnerControlCanary', data => { data.run.status = 'failed'; }],
  ];
  for (const [name, change] of changes) {
    const [, input, valid] = cases.find(entry => entry[0] === name);
    const data = structuredClone(valid); change(data);
    await assert.rejects(helperHarness(data).api[name](input), unverified, name);
  }
});

test('legitimate empty revokes succeed while absent, fractional, negative, and string counts fail', async () => {
  await helperHarness({ ok: true, revoked: [] }).api.revokePermissionTemplate({ ...ownerInput, templateKey: 'legal_reviewer' });
  const input = { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' };
  assert.equal((await helperHarness(transaction('bulk', [])).api.revokeAllTemporaryOwnerGrants(input)).revokedCount, 0);
  for (const revokedCount of [undefined, null, -1, 1.5, '0', false, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(helperHarness({ ok: true, revokedCount }).api.revokeAllTemporaryOwnerGrants(input), unverified);
  }
});

test('completed Canary execution may truthfully report failing or manual checks', async () => {
  for (const [status, resultStatus, failCount, manualRequiredCount] of [
    ['failed', 'fail', 1, 0], ['partial', 'manual_required', 0, 1], ['partial', 'unknown', 0, 1],
  ]) {
    const run = await helperHarness({
      run: { id: REQUEST_ID, status, results: [{ ...canaryResult, status: resultStatus }] },
      summary: { passCount: 0, failCount, manualRequiredCount },
    }).api.runOwnerControlCanary();
    assert.equal(run.status, status);
  }
});

test('Canary summary and status must exactly match unique individual check evidence', async () => {
  const run = { id: REQUEST_ID, status: 'completed', results: [canaryResult] };
  const summary = { passCount: 1, failCount: 0, manualRequiredCount: 0 };
  const invalid = [
    { run: { ...run, results: [{ ...canaryResult, status: 'fail' }] }, summary },
    { run: { ...run, results: [{ ...canaryResult, status: 'unknown' }] }, summary },
    { run, summary: { ...summary, passCount: 2 } },
    { run: { ...run, status: 'failed' }, summary: { passCount: 0, failCount: 1, manualRequiredCount: 0 } },
    { run: { ...run, status: 'partial' }, summary: { passCount: 0, failCount: 0, manualRequiredCount: 1 } },
    { run: { ...run, results: [canaryResult, canaryResult] }, summary: { ...summary, passCount: 2 } },
    { run: { ...run, results: [canaryResult, { ...canaryResult, key: ' check ' }] }, summary: { ...summary, passCount: 2 } },
    { run, summary: { ...summary, fail: 1 } },
    { run: { ...run, summary: { ...summary, pass: 9 } }, summary },
    { run: { ...run, summary: { passCount: 0, failCount: 1, manualRequiredCount: 0 } }, summary },
  ];
  for (const receipt of invalid) await assert.rejects(helperHarness(receipt).api.runOwnerControlCanary(), unverified);

  const results = [canaryResult, { ...canaryResult, key: 'unknown-check', status: 'unknown' },
    { ...canaryResult, key: 'manual-check', status: 'manual_required' }];
  const verifiedSummary = { passCount: 1, failCount: 0, manualRequiredCount: 2, pass: 1, fail: 0, manualRequired: 2, unknownCount: 2 };
  const verified = await helperHarness({
    run: { ...run, status: 'partial', results, summary: verifiedSummary }, summary: verifiedSummary,
  }).api.runOwnerControlCanary();
  assert.equal(verified.status, 'partial');
  assert.equal(verified.results.length, 3);
});

test('legal receipt accepts the backend status aliases and omitted update status', async () => {
  await helperHarness({ ok: true, request: { id: 'request-1', status: 'under_review' } }).api.updateLegalRequest({ id: 'request-1', status: 'reviewing' });
  await helperHarness({ ok: true, request: { id: 'request-1', status: 'closed' } }).api.updateLegalRequest({ id: 'request-1', notes: 'Synthetic note' });
});

test('backend unverified error survives FunctionsHttpError while other invocation errors remain unchanged', async () => {
  const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(JSON.stringify({ error: 'owner_control_outcome_unverified' }), { status: 502 }),
  });
  const h = helperHarness(null, error);
  await assert.rejects(h.api.firstOwnerGrantOwner(ownerInput), unverified);
  assert.equal(h.calls.length, 1);
  const network = new Error('network unavailable');
  await assert.rejects(helperHarness(null, network).api.firstOwnerGrantOwner(ownerInput), actual => actual === network);
});

function declaration(path, name) {
  const source = readFileSync(path, 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(result, `Missing production declaration ${name}`); return result;
}

test('real Admin grant callback cannot emit success or clear inputs after an unverified receipt', async () => {
  for (const data of [null, {}, { result: { ok: false } }, cases[0][2]]) {
    const h = helperHarness(data);
    const notices = [];
    const scope = {
      exports: {}, Date: FixedDate, useCallback: callback => callback, firstOwnerControlsEnabled: true, firstOwnerBusy: null,
      firstOwnerTargetEmail: ownerInput.targetEmail, firstOwnerReason: ownerInput.reason,
      looksLikeEmail: () => true, firstOwnerGrantOwner: h.api.firstOwnerGrantOwner,
      setFirstOwnerBusy() {}, setOwnerControlNotice: value => notices.push(value),
      setFirstOwnerTargetEmail: value => { scope.firstOwnerTargetEmail = value; },
      setFirstOwnerReason: value => { scope.firstOwnerReason = value; },
      loadFirstOwnerAuthority: async () => {}, loadPlatformRoles: async () => {},
    };
    const code = `const formatAdminOperationFailure = ${declaration('app/admin.tsx', 'formatAdminOperationFailure')}; exports.run = ${declaration('app/admin.tsx', 'runFirstOwnerGrantOwner')};`;
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: options }).outputText, scope);
    await scope.exports.run();
    assert.equal(h.calls.length, 1);
    if (data === cases[0][2]) {
      assert.equal(notices.at(-1), 'Owner role granted by First Owner authority.');
      assert.equal(scope.firstOwnerTargetEmail, '');
    } else {
      assert.ok(notices.every(message => !message?.includes('Owner role granted')));
      assert.match(notices.at(-1), /Refresh.*before.*retry/i);
      assert.equal(scope.firstOwnerTargetEmail, ownerInput.targetEmail);
      assert.equal(scope.firstOwnerReason, ownerInput.reason);
    }
  }
});

test('real Admin bulk callback reports verified count and cutoff scope, never an unverified completion', async () => {
  for (const data of [transaction('bulk', []), transaction('bulk', Array.from({length:405}, (_,i)=>`grant-${i}`)), {}, { ok: true, revokedCount: -1 }]) {
    const h = helperHarness(data);
    const notices = [];
    const changes = {};
    const scope = {
      exports: {}, Date: FixedDate, useCallback: callback => callback, canAccessOwnerSecurity: true, ownerSecurityActionBusy: null,
      ownerSecurityDangerAction: { kind: 'revoke-all-grants', confirmation: 'REVOKE GRANTS' },
      ownerSecurityReason: 'Synthetic test reason', ownerSecurityConfirmText: 'REVOKE GRANTS',
      revokeAllTemporaryOwnerGrants: h.api.revokeAllTemporaryOwnerGrants,
      revokeOwnerDevice() { throw new Error('Unexpected device mutation'); },
      revokeTemporaryOwnerGrant() { throw new Error('Unexpected single-grant mutation'); },
      loadOwnerSecurity: async () => {}, setOwnerSecurityActionBusy() {},
      setOwnerControlNotice: value => notices.push(value),
      setOwnerSecurityConfirmVisible: value => { changes.visible = value; },
      setOwnerSecurityDangerAction: value => { changes.action = value; },
      setOwnerSecurityConfirmText: value => { changes.confirmation = value; },
      setOwnerSecurityReason: value => { changes.reason = value; },
    };
    const code = `const formatAdminOperationFailure = ${declaration('app/admin.tsx', 'formatAdminOperationFailure')}; exports.run = ${declaration('app/admin.tsx', 'runOwnerSecurityDangerConfirm')};`;
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: options }).outputText, scope);
    await scope.exports.run();
    assert.equal(h.calls.length, 1);
    if (data.ok === true && data.revokedCount >= 0) {
      assert.equal(notices.at(-1), `Revoked ${data.revokedCount} temporary or test grants present when this action started. Refresh to check current access.`);
      assert.equal(changes.visible, false);
    } else {
      assert.ok(notices.every(message => !message?.startsWith('Revoked ')));
      assert.match(notices.at(-1), /Refresh.*before.*retry/i);
      assert.deepEqual(changes, {});
    }
  }
});

const edgePath = 'supabase/functions/admin-owner-controls/index.ts';
const edgeNames = [
  'CORS_HEADERS', 'JSON_HEADERS', 'toText', 'isRecord', 'json', 'normalizeEmail', 'redactText', 'sanitizeValue', 'sanitizeObject',
  'hasMutationReceiptId', 'hasMutationReceiptDate', 'mutationOutcomeUnverified', 'requireMutationReceipt',
  'firstOwnerGrantOwner', 'firstOwnerRevokeOwner', 'firstOwnerStartStepDown', 'firstOwnerCompleteStepDown',
  'LEGAL_REQUEST_STATUSES', 'normalizeLegalRequestStatus', 'normalizeLegalRequestType', 'ownerDeviceTrustStatus', 'normalizeOwnerDevice', 'normalizeTemporaryGrant', 'isTemporaryGrantRow',
  'breakGlassActivate', 'breakGlassEnd', 'legalRequestCreate', 'legalRequestUpdate', 'trustCurrentOwnerDevice',
  'revokeOwnerDevice', 'bindOwnerSecurityMutationContext', 'revokeOwnerSecurityGrants', 'revokeTemporaryOwnerGrant', 'revokeAllTemporaryOwnerGrants',
];
const edgeCode = ts.transpileModule(edgeNames.map(name => `const ${name} = ${declaration(edgePath, name)};`).join('\n')
  + `\nObject.assign(exports, { ${edgeNames.filter(name => /^(firstOwner|breakGlass|legalRequest|trustCurrent|revoke)/.test(name)).join(', ')} });`, { compilerOptions: options }).outputText;

function edgeHarness(result) {
  const calls = [];
  const admin = { from: () => ({ select() { return this; }, eq() { return this; }, async limit() { return { data: [
    { id: 'owner-1', user_id: 'actor-1' }, { id: 'successor-1', user_id: 'successor-user' },
  ], error: null }; } }) };
  const actor = { rpc: async (name, input) => { calls.push({ name, input }); return { error: null, data: typeof result === 'function' ? result(input) : result }; } };
  const scope = {
    exports: {}, Date: FixedDate, Response, requireFirstOwner: async () => null, requireReason: value => value,
    readExactTargetStaffSubject: async () => ({ userId: 'successor-user' }),
    generatePasscode: () => '123456', randomHex: () => 'synthetic-salt', hashFirstOwnerPasscode: async () => 'synthetic-hash',
  };
  vm.runInNewContext(edgeCode, scope);
  const user = { id: 'actor-1', email: 'actor@example.test', role: 'owner', isFirstOwner: true };
  const anon = { auth: { signInWithPassword: async () => ({ error: null, data: { user: { id: user.id } } }) } };
  return {
    calls,
    call(name) {
      if (name === 'firstOwnerStartStepDown') return scope.exports[name](admin, actor, anon, user, cases[2][1]);
      return scope.exports[name](admin, actor, user, name === 'firstOwnerCompleteStepDown' ? successorInput : ownerInput);
    },
  };
}

for (const name of ['firstOwnerGrantOwner', 'firstOwnerRevokeOwner', 'firstOwnerStartStepDown', 'firstOwnerCompleteStepDown']) {
  test(`${name}: actual backend handler rejects malformed RPC data before sanitizing it`, async () => {
    for (const result of invalidEnvelopes) {
      const h = edgeHarness(result);
      await assert.rejects(h.call(name), unverified);
      assert.equal(h.calls.length, 1);
    }
  });
  test(`${name}: backend accepts its deployed RPC success contract`, async () => {
    const result = name === 'firstOwnerStartStepDown'
      ? input => ({ ok: true, challengeId: 'challenge-1', expiresAt: input.p_expires_at, typedConfirmationRequired: 'STEP DOWN FIRST OWNER' })
      : cases.find(entry => entry[0] === name)[2].result;
    const response = await edgeHarness(result).call(name);
    assert.equal(response.status, 200);
    const payload = await response.json();
    if (name === 'firstOwnerStartStepDown') assert.equal(payload.challenge.challengeId, 'challenge-1');
    else assert.equal(payload.result.ok, true);
  });
}

test('backend rejects wrong succession identity and incorrect grant/revoke status', async () => {
  await assert.rejects(edgeHarness({ ...cases[3][2].result, successorMembershipId: 'wrong-successor' }).call('firstOwnerCompleteStepDown'), unverified);
  await assert.rejects(edgeHarness({ ...cases[0][2].result, status: 'revoked' }).call('firstOwnerGrantOwner'), unverified);
  await assert.rejects(edgeHarness({ ...cases[1][2].result, status: 'active' }).call('firstOwnerRevokeOwner'), unverified);
  await assert.rejects(edgeHarness({ ok: true, challengeId: 'challenge-1', expiresAt: 'invalid', typedConfirmationRequired: 'STEP DOWN FIRST OWNER' }).call('firstOwnerStartStepDown'), unverified);
});

function rowMutationHarness(data, temporaryGrants = [{ id: 'grant-1', state: 'active' }], options = {}) {
  let mutations = 0;
  let audits = 0;
  const reads = [];
  const batches = [];
  const grantRows = temporaryGrants.map(row => ({
    status: row.state === 'revoked' ? 'revoked' : 'active',
    granted_at: pastDate, updated_at: pastDate,
    expires_at: row.state === 'expired' ? pastDate : date,
    target_email: 'synthetic@example.test', metadata: {}, ...row,
  }));
  const admin = {
    rpc: async () => { audits += 1; return { error: null }; },
    from(table) {
      let mutation = false;
      const filters = {};
      const cutoffs = {};
      let selectedIds;
      let afterId;
      let limit;
      let expiryFilter;
      const response = () => {
        if (table !== 'platform_staff_permission_grants') return { data, error: null };
        if (!mutation) {
          reads.push({ ...cutoffs, afterId, limit, expiryFilter });
          options.beforeRead?.(reads.length, grantRows);
          let rows = grantRows.filter(row => row.status === filters.status && row.granted_at <= cutoffs.granted_at
            && (row.expires_at == null || row.expires_at > cutoffs.granted_at) && (!afterId || row.id > afterId));
          rows = rows.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
          return { data: options.readResponse ? options.readResponse(rows, reads.length) : rows, error: null };
        }
        options.beforeMutation?.(grantRows);
        const ids = selectedIds ?? [filters.id];
        batches.push([...ids]);
        const eligible = grantRows.filter(row => ids.includes(row.id)
          && (!filters.status || row.status === filters.status)
          && (!cutoffs.granted_at || row.granted_at <= cutoffs.granted_at)
          && (!cutoffs.updated_at || row.updated_at <= cutoffs.updated_at));
        const receipt = typeof data === 'function' ? data({ ids: eligible.map(row => row.id), rows: eligible, batch: batches.length }) : data;
        for (const row of eligible) if (!options.keepActive?.includes(row.id)) row.status = 'revoked';
        return { data: receipt, error: null };
      };
      return {
        insert() { mutation = true; if (table.endsWith('_audit')) audits += 1; else mutations += 1; return this; },
        update() { mutation = true; mutations += 1; return this; },
        select() { return this; }, eq(key, value) { filters[key] = value; return this; },
        in(_key, values) { selectedIds = values; return this; },
        lte(key, value) { cutoffs[key] = value; return this; },
        gt(_key, value) { afterId = value; return this; },
        or(value) { expiryFilter = value; return this; }, order() { return this; },
        limit(value) { limit = value; return this; },
        single: async () => response(),
        maybeSingle: async () => !mutation && table === 'legal_request_intake'
          ? { data: { id: 'request-1', status: 'received' }, error: null } : response(),
        then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); },
      };
    },
  };
  const writeAudit = async () => { audits += 1; };
  const scope = {
    exports: {}, Date: FixedDate, Response, requireFirstOwner: async () => null, requireReason: value => value,
    hasAnyPermission: () => true, requireTrustedCurrentOwnerDevice: async () => ({ error: null }),
    upsertCurrentOwnerDevice: async () => ({ currentDevice: { id: 'device-1', deviceLabel: 'Synthetic device' } }),
    listTemporaryGrants: async () => temporaryGrants,
    resolveExpiresAt: () => date, resolveAdminReason: (_user, value, fallback) => value || fallback,
    writeBreakGlassAudit: writeAudit, writePlatformAudit: writeAudit, writeSecurityAudit: writeAudit, writeLegalRequestEvent: writeAudit,
    securityContextAuditMetadata: () => ({}),
  };
  vm.runInNewContext(edgeCode, scope);
  return {
    call: (name, input) => scope.exports[name](admin, { id: 'actor-1', role: 'owner', email: 'actor@example.test', activeBreakGlassSessionId: null }, input),
    counts: () => ({ mutations, audits }), reads, batches,
  };
}

const rawCases = [
  ['breakGlassActivate', { reason: 'Synthetic emergency' }, { id: 'session-1', actor_user_id: 'actor-1', status: 'active', expires_at: date }],
  ['breakGlassEnd', { sessionId: 'session-1' }, { id: 'session-1', status: 'ended' }],
  ['legalRequestCreate', { requestingAgency: 'Synthetic agency', requestReason: 'Synthetic test reason' }, { id: 'request-1', status: 'received' }],
  ['legalRequestUpdate', { id: 'request-1', status: 'closed' }, { id: 'request-1', status: 'closed' }],
  ['trustCurrentOwnerDevice', {}, { id: 'device-1', owner_user_id: 'actor-1', trusted_at: date, revoked_at: null }],
  ['revokeOwnerDevice', cases.find(row => row[0] === 'revokeOwnerDevice')[1], { id: 'device-1', owner_user_id: 'actor-1', revoked_at: date }],
];

for (const [name, input, valid] of rawCases) {
  test(`${name}: real database handler checks raw mutation receipt before follow-on audits and normalization`, async () => {
    for (const data of [[], [{}], 'ok', {}, { error: 'denied' }, { ...valid, ok: false }, { ...valid, id: '' }]) {
      const h = rowMutationHarness(data);
      await assert.rejects(h.call(name, input), unverified);
      assert.deepEqual(h.counts(), { mutations: 1, audits: 0 });
    }
    const h = rowMutationHarness(valid);
    const response = await h.call(name, input);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(h.counts().mutations, 1);
  });
}

// These tests exercise adapter orchestration and receipts. Real locking,
// authority revocation, CHECK constraints, and atomic rollback are qualified by
// the isolated Postgres/Auth/PostgREST concurrency runner, not this harness.
const ids = { request: '11111111-1111-4111-8111-111111111111', grant: '22222222-2222-4222-8222-222222222222',
  context: '33333333-3333-4333-8333-333333333333', actor: '44444444-4444-4444-8444-444444444444',
  session: '55555555-5555-4555-8555-555555555555', device: '66666666-6666-4666-8666-666666666666' };
const rawGrant = { id: ids.grant, status: 'revoked', revoked_at: date, revoked_by: ids.actor, permission_key: 'legal_review' };
const validRpcReceipt = mode => ({ ...transaction(mode, mode === 'single' ? [ids.grant] : [], mode === 'single' ? rawGrant : null), requestId: ids.request });
function transactionHarness(result, options = {}) {
  const calls = [], writes = [];
  const admin = { from(table) {
    assert.equal(table, 'security_request_context', 'Edge must never write grants or post-commit audits');
    let patch;
    return { select() { return this; }, eq() { return this; }, update(value) { patch = value; writes.push(value); return this; },
      async maybeSingle() { return options.contextError ? {error: new Error('context unavailable')} : {
        error: null, data: patch ? {id: ids.context} : {metadata: {network_proof_verified: false}},
      }; },
    };
  } };
  const actor = {rpc: async (name, args) => { calls.push({name, args});
    if (options.transportFailure) throw new Error('lost response');
    return {data: result, error: options.rpcError ?? null};
  }};
  const scope = {exports: {}, Date: FixedDate, Response,
    normalizeExactSubjectId: value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : '',
    requireTrustedCurrentOwnerDevice: async () => ({currentDevice: {id: ids.device}, error: options.untrusted ? new Response('{}', {status:403}) : null}),
    writeOwnerSecurityDeniedEvent: async () => {},
  };
  vm.runInNewContext(edgeCode, scope);
  return {calls, writes, async call(mode = 'bulk', overrides = {}) {
    return scope.exports[mode === 'single' ? 'revokeTemporaryOwnerGrant' : 'revokeAllTemporaryOwnerGrants'](admin, actor,
      {id: ids.actor, role: options.role ?? 'owner', authenticatedSessionId: ids.session, securityContext: {id: ids.context}},
      {requestId: ids.request, grantId: ids.grant, confirmation: mode === 'single' ? 'REVOKE GRANT' : 'REVOKE GRANTS', reason: 'Synthetic revoke reason', ...overrides});
  }};
}

for (const mode of ['single', 'bulk']) {
  test(`${mode} revoke passes one actor RPC with exact request/device/context and no follow-on write`, async () => {
    const h = transactionHarness(validRpcReceipt(mode));
    const response = await h.call(mode);
    assert.equal(response.status, 200);
    const receipt = await response.json();
    assert.equal(receipt.requestId, ids.request);
    assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), {name:'owner_security_revoke_grants', args: {
      p_request_id: ids.request, p_mode: mode, p_grant_id: mode === 'single' ? ids.grant : null,
      p_reason:'Synthetic revoke reason', p_device_id:ids.device, p_security_context_id:ids.context,
    }});
    assert.equal(h.writes[0].metadata.auth_session_id, ids.session);
    assert.equal(h.writes[0].metadata.network_proof_verified, false);
  });
  test(`${mode} revoke rejects partial, wrong-request, duplicate, or absent database receipts`, async () => {
    const valid = validRpcReceipt(mode);
    for (const receipt of [null, {}, [], {...valid, requestId:'other'}, {...valid, mode:'other'},
      {...valid, scopeAsOf:null}, {...valid, revokedAt:null}, {...valid, revokedCount:99},
      {...valid, grantIds:[ids.grant, ids.grant], revokedCount:2},
      {...valid, grant: mode === 'single' ? {...rawGrant, revoked_by:'other'} : rawGrant}]) {
      const h = transactionHarness(receipt);
      await assert.rejects(h.call(mode), unverified);
      assert.equal(h.calls.length, 1);
    }
  });
  test(`${mode} revoke keeps typed confirmation, reason, request ID, trusted-device and Owner gates before mutation`, async () => {
    for (const [options, overrides, status] of [[{role:'operator'}, {},403], [{untrusted:true},{},403],
      [{},{confirmation:'WRONG'},400], [{},{reason:'x'},400], [{},{requestId:null},400]]) {
      const h = transactionHarness(validRpcReceipt(mode), options);
      assert.equal((await h.call(mode, overrides)).status, status); assert.equal(h.calls.length,0);
    }
    const context = transactionHarness(validRpcReceipt(mode), {contextError:true});
    await assert.rejects(context.call(mode), unverified); assert.equal(context.calls.length,0);
    const lost = transactionHarness(null, {transportFailure:true});
    await assert.rejects(lost.call(mode), unverified); assert.equal(lost.calls.length,1);
  });
}

test('client retries ambiguous identical input with same request ID and frozen token, then gives a confirmed new action a new scope', async () => {
  const input = {confirmation:'REVOKE GRANTS', reason:'Synthetic same action'};
  const h = helperHarness((_request, count) => count === 1 ? null : transaction('bulk', []));
  await assert.rejects(h.api.revokeAllTemporaryOwnerGrants(input), unverified);
  await h.api.revokeAllTemporaryOwnerGrants(input);
  await h.api.revokeAllTemporaryOwnerGrants(input);
  assert.equal(h.calls[0].request.body.requestId, h.calls[1].request.body.requestId);
  assert.notEqual(h.calls[1].request.body.requestId, h.calls[2].request.body.requestId);
  assert.equal(h.calls[0].request.headers.Authorization, 'Bearer synthetic-access-token');
});

test('ambiguous request IDs cannot cross account session generation or changed action input', async () => {
  const controls = {};
  const h = helperHarness(null, null, controls);
  const input = {confirmation:'REVOKE GRANTS', reason:'Synthetic same action'};
  await assert.rejects(h.api.revokeAllTemporaryOwnerGrants(input), unverified);
  controls.generation = 'new-session';
  await assert.rejects(h.api.revokeAllTemporaryOwnerGrants(input), unverified);
  await assert.rejects(h.api.revokeAllTemporaryOwnerGrants({...input,reason:'Different approved reason'}), unverified);
  assert.equal(new Set(h.calls.map(call=>call.request.body.requestId)).size,3);
});

test('account switch after transport cannot deliver a stale verified completion', async () => {
  const controls = {};
  const h = helperHarness(() => { controls.changed = true; return transaction('bulk', []); }, null, controls);
  await assert.rejects(h.api.revokeAllTemporaryOwnerGrants({confirmation:'REVOKE GRANTS',reason:'Synthetic test reason'}), error => error.code === 'account_changed');
});

const canaryScopeExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('supabase/functions/_shared/canary-proof-scope.ts', 'utf8'), {compilerOptions:options}).outputText,
  {exports:canaryScopeExports, crypto:webcrypto});
const canaryHelperNames = ['toText','isRecord','redactText','hasMutationReceiptId','hasMutationReceiptDate','mutationOutcomeUnverified',
  'requireMutationReceipt','readCanaryProofScope','cleanupProofAccess'];
const canaryHelperCode = ts.transpileModule(canaryHelperNames.map(name => `const ${name} = ${declaration(edgePath,name)};`).join('\n')
  + '\nObject.assign(exports,{readCanaryProofScope,cleanupProofAccess});', {compilerOptions:options}).outputText;
const canaryHelpers = {};
vm.runInNewContext(canaryHelperCode, {exports:canaryHelpers, ...canaryScopeExports,
  normalizeExactSubjectId:value=>typeof value==='string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : ''});
const manifest = {runId:ids.request, deadline:date, users:canaryScopeExports.CANARY_PROOF_LABELS.map((label,index)=>({
  label,userId:`77777777-7777-4777-8777-${String(index).padStart(12,'0')}`,
  email:`liveops.proof+${label}.${ids.request}@chillywoodstream.com`,registered:true,authPresent:true,
}))};
const cleanupReceipt = {ok:true,runId:ids.request,status:'closed',activeCount:0,roleIds:[101],grantIds:[ids.grant],users:manifest.users};

for (const [label, receipt] of [ ['missing',null], ['foreign run',{...cleanupReceipt,runId:ids.grant}],
  ['active remainder',{...cleanupReceipt,activeCount:1}], ['foreign user',{...cleanupReceipt,users:[{...manifest.users[0],userId:ids.actor},...manifest.users.slice(1)]}],
  ['partial manifest',{...cleanupReceipt,users:manifest.users.slice(1)}], ['duplicate authority ID',{...cleanupReceipt,roleIds:[101,101]}],
]) {
  test(`actual cleanup adapter refuses Auth deletion after ${label} receipt`, async()=>{
    const calls=[];
    const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:receipt,error:null};},auth:{admin:{deleteUser:async()=>{throw new Error('Auth deletion crossed unverified authority cleanup');}}}};
    const result=await canaryHelpers.cleanupProofAccess(admin,canaryHelpers.readCanaryProofScope(manifest,ids.request),'Synthetic cleanup');
    assert.equal(result.ok,false); assert.equal(result.activeCount,null); assert.equal(calls.length,1);
    assert.equal(calls[0].name,'cleanup_admin_canary_run'); assert.equal(calls[0].args.p_run_id,ids.request);
  });
}

test('actual cleanup adapter uses only exact receipt users, and Auth failure never appears green',async()=>{
  for(const failure of [false,true]) {
    const removed=[];
    const admin={rpc:async(name)=>({data:name==='read_admin_canary_manifest'
      ? {...manifest,status:'closed',cleanupVerified:true,registeredActiveCount:0,users:manifest.users.map(row=>({...row,authPresent:false}))}
      : {...cleanupReceipt,users:manifest.users.map((row,index)=>({...row,authPresent:index===0}))},error:null}),
      auth:{admin:{deleteUser:async(id)=>{removed.push(id);return {error:failure?new Error('Synthetic Auth deletion failure'):null};}}}};
    const result=await canaryHelpers.cleanupProofAccess(admin,canaryHelpers.readCanaryProofScope(manifest,ids.request),'Synthetic cleanup');
    assert.deepEqual(removed,[manifest.users[0].userId]); assert.equal(result.ok,!failure); assert.equal(result.activeCount,0);
    assert.match(result.summary,failure?/incomplete/:/passed/);
  }
});

test('successful Auth delete acknowledgements still require final absent-user manifest proof',async()=>{
  const removed=[];
  const admin={rpc:async(name)=>({data:name==='read_admin_canary_manifest'
    ? {...manifest,status:'closed',cleanupVerified:true,registeredActiveCount:0}
    : cleanupReceipt,error:null}),
    auth:{admin:{deleteUser:async(id)=>{removed.push(id);return {error:null};}}}};
  const result=await canaryHelpers.cleanupProofAccess(admin,canaryHelpers.readCanaryProofScope(manifest,ids.request),'Synthetic cleanup');
  assert.equal(removed.length,5); assert.equal(result.ok,false); assert.match(result.summary,/incomplete/);
});

test('explicit canary recovery binds transport and final run receipt to the same persisted run ID',async()=>{
  const h=helperHarness({run:{id:REQUEST_ID,status:'completed',results:[canaryResult]},summary:{passCount:1,failCount:0,manualRequiredCount:0}});
  const run=await h.api.runOwnerControlCanary(ids.request);
  assert.equal(h.calls[0].request.body.resumeRunId,ids.request);
  assert.equal(h.calls[0].request.body.requestId,ids.request); assert.equal(run.id,ids.request);
});

test('pending Canary response exposes its exact recovery ID without retrying or reporting success',async()=>{
  for (const code of ['canary_run_in_progress','admin_canary_pending_run']) {
    const error=Object.assign(new Error('FunctionsHttpError'),{context:new Response(JSON.stringify({
      error:code,runId:ids.request,deadline:date,
    }),{status:409})});
    const h=helperHarness(null,error);
    await assert.rejects(h.api.runOwnerControlCanary(),failure=>{
      assert.equal(failure.code,code); assert.equal(failure.runId,ids.request);
      assert.match(failure.message,new RegExp(ids.request)); return true;
    });
    assert.equal(h.calls.length,1);
  }
});

const pendingCanary = {id:ids.request,resumeRunId:ids.request,deadline:date,status:'partial',cleanupVerified:false,
  summary:{passCount:0,failCount:0,manualRequiredCount:1},results:[{...canaryResult,status:'manual_required'}]};
const failedCanary = {id:ids.request,status:'failed',results:[{...canaryResult,status:'fail'}]};
const deferredUi = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function canaryUiHarness({read=async()=>[pendingCanary],mutate=async()=>failedCanary,loaded=true}={}) {
  const notices=[],actions=[];
  const session={userId:ids.actor,accountId:ids.actor,sessionGeneration:ids.session,state:'ACTIVE',restoreOnly:false};
  const scope={exports:{},Date:FixedDate,useCallback:value=>value,authority:session,currentSession:session,
    canAccessCanaryChecks:true,canaryReadAuthorityKey:'actor:session',canaryLoadedAuthorityKey:loaded?'actor:session':null,
    canaryHistoryVerified:loaded,canaryBusy:false,canaryRuns:loaded?[pendingCanary]:[],
    canaryAuthorityRef:{current:{authorityKey:'actor:session',readGeneration:0,actionPending:false}},
    getCurrentAccountSessionAuthoritySnapshot:()=>scope.currentSession,
    sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration,
    listOwnerControlCanaries:read,runOwnerControlCanary:async(id)=>{actions.push(id);return mutate(id);},
    formatAdminOperationFailure:(error,fallback)=>error?.message||fallback,
  };
  for(const key of ['canaryRuns','canaryBusy','canaryLoadedAuthorityKey','canaryHistoryVerified','canaryHistoryLoading']) {
    scope[`set${key[0].toUpperCase()}${key.slice(1)}`]=value=>{scope[key]=typeof value==='function'?value(scope[key]):value;};
  }
  scope.setOwnerControlNotice=value=>{notices.push(value);scope.notice=value;};
  const code=`const canaryRecoveryRunId=${declaration('app/admin.tsx','canaryRecoveryRunId')};
    const loadCanaries=${declaration('app/admin.tsx','loadCanaries')};
    const runCanaryChecks=${declaration('app/admin.tsx','runCanaryChecks')};
    Object.assign(exports,{loadCanaries,runCanaryChecks,canaryRecoveryRunId});`;
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:options}).outputText,scope);
  return {scope,notices,actions,...scope.exports, reset() {
    assert.ok(canaryResetEffect);
    vm.runInNewContext(ts.transpileModule(`exports.reset=${canaryResetEffect};`,{compilerOptions:options}).outputText,scope);
    return scope.exports.reset();
  }};
}

const adminUiAst=ts.createSourceFile('admin.tsx',readFileSync('app/admin.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let recoverButtonPress, recoverButtonDisabled, canaryResetEffect;
function findCanaryRecoveryButton(node) {
  if(ts.isCallExpression(node)&&node.expression.getText(adminUiAst)==='useEffect'
    &&node.arguments[1]?.getText(adminUiAst)==='[canaryReadAuthorityKey]') {
    canaryResetEffect=node.arguments[0].getText(adminUiAst);
  }
  if(ts.isJsxOpeningElement(node)&&node.attributes.properties.some(prop=>ts.isJsxAttribute(prop)
    &&prop.name.getText(adminUiAst)==='testID'&&prop.initializer?.text==='admin-canary-recover-cleanup')) {
    recoverButtonPress=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(adminUiAst)==='onPress')?.initializer?.expression?.getText(adminUiAst);
    recoverButtonDisabled=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(adminUiAst)==='disabled')?.initializer?.expression?.getText(adminUiAst);
  }
  ts.forEachChild(node,findCanaryRecoveryButton);
}
findCanaryRecoveryButton(adminUiAst);

test('actual recovery button after history reload passes only the backend pending run ID and retains failed checks',async()=>{
  let reads=0;
  const h=canaryUiHarness({loaded:false,read:async()=>++reads===1?[pendingCanary]:[failedCanary]});
  await h.loadCanaries(); assert.equal(h.scope.canaryHistoryVerified,true);
  const resumeRunId=h.canaryRecoveryRunId(h.scope.canaryRuns[0]);assert.equal(resumeRunId,ids.request);
  assert.ok(recoverButtonPress);assert.equal(recoverButtonDisabled,'disabled');
  let action;
  const button={exports:{},resumeRunId,runCanaryChecks:id=>{action=h.runCanaryChecks(id);}};
  vm.runInNewContext(ts.transpileModule(`exports.press=${recoverButtonPress};`,{compilerOptions:options}).outputText,button);
  button.exports.press();await action;
  assert.deepEqual(h.actions,[ids.request]); assert.equal(h.scope.canaryRuns[0].status,'failed');
  assert.match(h.scope.notice,/Cleanup recovery finished/);assert.match(h.scope.notice,/remain failed/);
});

test('pending Canary blocks a new run and arbitrary recovery IDs before any mutation',async()=>{
  const h=canaryUiHarness();
  await h.runCanaryChecks(); await h.runCanaryChecks(ids.grant);
  assert.equal(h.actions.length,0);assert.match(h.scope.notice,/Recover the pending Canary/);
  for(const row of [{...pendingCanary,id:ids.grant},{...pendingCanary,cleanupVerified:true},{...pendingCanary,deadline:'invalid'},{...pendingCanary,id:'11111111-1111-0111-8111-111111111111',resumeRunId:'11111111-1111-0111-8111-111111111111'}]) {
    assert.equal(h.canaryRecoveryRunId(row),null);
  }
});

test('cleanup failure remains pending after real callback refresh and never emits completion',async()=>{
  const h=canaryUiHarness();await h.runCanaryChecks(ids.request);
  assert.equal(h.scope.canaryRuns[0].resumeRunId,ids.request);
  assert.match(h.scope.notice,/still incomplete/);assert.ok(h.notices.every(value=>!value?.includes('recovery finished')));
});

test('unknown recovery outcome refreshes pending evidence and keeps retry scoped to that same run',async()=>{
  const h=canaryUiHarness({mutate:async()=>{throw new Error('Recovery outcome unverified');}});
  await h.runCanaryChecks(ids.request);
  assert.deepEqual(h.actions,[ids.request]);assert.equal(h.scope.canaryRuns[0].resumeRunId,ids.request);
  assert.equal(h.scope.notice,'Recovery outcome unverified');assert.equal(h.scope.canaryBusy,false);
});

test('failed history refresh keeps pending evidence but disables further recovery',async()=>{
  const h=canaryUiHarness({read:async()=>{throw new Error('history offline');}});
  await h.runCanaryChecks(ids.request);
  assert.equal(h.scope.canaryRuns[0].resumeRunId,ids.request);assert.equal(h.scope.canaryHistoryVerified,false);
  assert.equal(h.scope.canaryHistoryLoading,false);
  assert.match(h.scope.notice,/cleanup is not confirmed/);
  await h.runCanaryChecks(ids.request);assert.equal(h.actions.length,1);
});

test('late history from another session cannot restore its pending run or unlock recovery',async()=>{
  const pending=deferredUi();const h=canaryUiHarness({loaded:false,read:()=>pending.promise});
  const loading=h.loadCanaries();
  h.scope.currentSession={...h.scope.authority,sessionGeneration:ids.grant};
  h.scope.canaryAuthorityRef.current={authorityKey:'actor:new-session',readGeneration:0,actionPending:false};
  pending.resolve([pendingCanary]);await loading;
  assert.equal(h.scope.canaryRuns.length,0);assert.equal(h.scope.canaryHistoryVerified,false);
  await h.runCanaryChecks(ids.request);assert.equal(h.actions.length,0);
});

test('authority change during recovery suppresses its late result and notices',async()=>{
  const pending=deferredUi();const h=canaryUiHarness({mutate:()=>pending.promise});
  const recovery=h.runCanaryChecks(ids.request);
  h.scope.currentSession={...h.scope.authority,sessionGeneration:ids.grant};
  h.scope.canaryAuthorityRef.current={authorityKey:'actor:new-session',readGeneration:0,actionPending:false};
  h.scope.canaryRuns=[];h.scope.canaryHistoryVerified=false;h.scope.canaryBusy=false;
  pending.resolve(failedCanary);await recovery;
  assert.equal(h.scope.canaryRuns.length,0);assert.equal(h.scope.canaryHistoryVerified,false);
  assert.ok(h.notices.every(value=>value===null));
});

test('actual Canary authority reset clears its loading flag and retires the previous history read',async()=>{
  const pending=deferredUi();const h=canaryUiHarness({read:()=>pending.promise});
  const loading=h.loadCanaries();assert.equal(h.scope.canaryHistoryLoading,true);
  h.scope.canaryReadAuthorityKey='actor:new-session';
  h.scope.currentSession={...h.scope.authority,sessionGeneration:ids.grant};
  h.reset();
  assert.equal(h.scope.canaryHistoryLoading,false);assert.equal(h.scope.canaryLoadedAuthorityKey,null);
  pending.resolve([pendingCanary]);await loading;
  assert.equal(h.scope.canaryRuns.length,0);assert.equal(h.scope.canaryHistoryVerified,false);
  assert.equal(h.scope.canaryHistoryLoading,false);
});
