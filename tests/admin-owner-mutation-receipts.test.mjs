import assert from 'node:assert/strict';
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
const afterScope = timestampAt(1000);
const helperCode = ts.transpileModule(readFileSync('_lib/adminOwnerControls.ts', 'utf8'), { compilerOptions: options }).outputText;
function helperHarness(data, error = null) {
  const calls = [];
  const scope = {
    exports: {}, Date: FixedDate,
    require(name) {
      if (name === './supabase') return { supabase: { functions: { invoke: async (endpoint, request) => {
        calls.push({ endpoint, request }); return { data, error };
      } } } };
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
  ['revokeTemporaryOwnerGrant', { grantId: 'grant-1', confirmation: 'REVOKE GRANT', reason: 'Synthetic test reason' }, { ok: true, grant: { id: 'grant-1', state: 'revoked', revokedAt: date } }, 'revoke_temporary_owner_grant'],
  ['revokeAllTemporaryOwnerGrants', { confirmation: 'REVOKE GRANTS', reason: 'Synthetic test reason' }, { ok: true, revokedCount: 2 }, 'revoke_all_temporary_owner_grants'],
  ['runOwnerControlCanary', undefined, { run: { id: 'run-1', status: 'completed', results: [canaryResult] }, summary: { passCount: 1, failCount: 0, manualRequiredCount: 0 } }, 'canary_run'],
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
    if (nested) {
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
  assert.equal((await helperHarness({ ok: true, revokedCount: 0 }).api.revokeAllTemporaryOwnerGrants(input)).revokedCount, 0);
  for (const revokedCount of [undefined, null, -1, 1.5, '0', false, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(helperHarness({ ok: true, revokedCount }).api.revokeAllTemporaryOwnerGrants(input), unverified);
  }
});

test('completed Canary execution may truthfully report failing or manual checks', async () => {
  for (const [status, resultStatus, failCount, manualRequiredCount] of [
    ['failed', 'fail', 1, 0], ['partial', 'manual_required', 0, 1], ['partial', 'unknown', 0, 1],
  ]) {
    const run = await helperHarness({
      run: { id: 'run-1', status, results: [{ ...canaryResult, status: resultStatus }] },
      summary: { passCount: 0, failCount, manualRequiredCount },
    }).api.runOwnerControlCanary();
    assert.equal(run.status, status);
  }
});

test('Canary summary and status must exactly match unique individual check evidence', async () => {
  const run = { id: 'run-1', status: 'completed', results: [canaryResult] };
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
  for (const data of [{ ok: true, revokedCount: 0 }, { ok: true, revokedCount: 405 }, {}, { ok: true, revokedCount: -1 }]) {
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
      assert.equal(notices.at(-1), `Revoked ${data.revokedCount} temporary grants present when this action started. Refresh to check current access.`);
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
  'revokeOwnerDevice', 'revokeTemporaryOwnerGrant', 'revokeAllTemporaryOwnerGrants',
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

const rawGrant = { id: 'grant-1', status: 'revoked', revoked_at: date, permission_key: 'legal_review' };
const rawCases = [
  ['breakGlassActivate', { reason: 'Synthetic emergency' }, { id: 'session-1', actor_user_id: 'actor-1', status: 'active', expires_at: date }],
  ['breakGlassEnd', { sessionId: 'session-1' }, { id: 'session-1', status: 'ended' }],
  ['legalRequestCreate', { requestingAgency: 'Synthetic agency', requestReason: 'Synthetic test reason' }, { id: 'request-1', status: 'received' }],
  ['legalRequestUpdate', { id: 'request-1', status: 'closed' }, { id: 'request-1', status: 'closed' }],
  ['trustCurrentOwnerDevice', {}, { id: 'device-1', owner_user_id: 'actor-1', trusted_at: date, revoked_at: null }],
  ['revokeOwnerDevice', cases.find(row => row[0] === 'revokeOwnerDevice')[1], { id: 'device-1', owner_user_id: 'actor-1', revoked_at: date }],
  ['revokeTemporaryOwnerGrant', cases.find(row => row[0] === 'revokeTemporaryOwnerGrant')[1], rawGrant],
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

test('bulk revocation validates raw rows without converting missing data into a zero receipt', async () => {
  const input = { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' };
  for (const data of [null, undefined, {}, 'ok', [], [null], [{}], [{ ...rawGrant, id: 'wrong-grant' }], [rawGrant, rawGrant]]) {
    const h = rowMutationHarness(data);
    await assert.rejects(h.call('revokeAllTemporaryOwnerGrants', input), unverified);
    assert.deepEqual(h.counts(), { mutations: 1, audits: 0 });
  }
  const response = await rowMutationHarness([rawGrant]).call('revokeAllTemporaryOwnerGrants', input);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revokedCount, 1);
});

test('bulk revocation requires the exact unique selected ID set before reporting completion', async () => {
  const input = { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' };
  const selected = [{ id: 'grant-1', state: 'active' }, { id: 'grant-2', state: 'active' }];
  const second = { ...rawGrant, id: 'grant-2' };
  const foreign = { ...rawGrant, id: 'foreign-grant' };
  for (const data of [[], [rawGrant], [second], [rawGrant, rawGrant], [rawGrant, foreign], [rawGrant, second, foreign], [rawGrant, second, second]]) {
    const h = rowMutationHarness(data, selected);
    await assert.rejects(h.call('revokeAllTemporaryOwnerGrants', input), unverified);
    assert.deepEqual(h.counts(), { mutations: 1, audits: 0 });
  }
  for (const data of [[rawGrant, second], [second, rawGrant]]) {
    const h = rowMutationHarness(data, selected);
    const response = await h.call('revokeAllTemporaryOwnerGrants', input);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revokedCount, 2);
    assert.equal(h.counts().mutations, 1);
  }
});

test('bulk revocation returns a legitimate zero only when the initial selection has no active grants', async () => {
  const input = { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' };
  for (const grants of [[], [{ id: 'grant-1', state: 'revoked' }], [{ id: 'grant-1', state: 'expired' }]]) {
    const h = rowMutationHarness(null, grants);
    const response = await h.call('revokeAllTemporaryOwnerGrants', input);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revokedCount, 0);
    assert.deepEqual(h.counts(), { mutations: 0, audits: 0 });
  }
});

test('bulk revocation traverses more than 200 active grants and verifies the entire cutoff scope', async () => {
  const selected = Array.from({ length: 405 }, (_, index) => ({ id: `grant-${String(index).padStart(4, '0')}`, state: 'active' }));
  const input = { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' };
  const h = rowMutationHarness(({ ids }) => ids.map(id => ({ ...rawGrant, id })), selected);
  const response = await h.call('revokeAllTemporaryOwnerGrants', input);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revokedCount, 405);
  assert.deepEqual(h.batches.map(ids => ids.length), [200, 200, 5]);
  assert.equal(new Set(h.batches.flat()).size, 405);
  assert.equal(h.reads.length, 5);
  assert.equal(h.reads[1].afterId, 'grant-0199');
  assert.equal(h.reads[2].afterId, 'grant-0399');
  assert.equal(h.reads.at(-1).afterId, undefined);
  assert.equal(new Set(h.reads.map(read => read.granted_at)).size, 1);
  assert.ok(h.reads.every(read => read.expiryFilter.endsWith(read.granted_at)));
  assert.equal(h.counts().mutations, 3);
});

test('bulk revocation rejects an incomplete later batch without retrying or claiming all succeeded', async () => {
  const selected = Array.from({ length: 201 }, (_, index) => ({ id: `grant-${String(index).padStart(4, '0')}`, state: 'active' }));
  for (const rejected of [false, true]) {
    const h = rowMutationHarness(({ ids, batch }) => {
      if (batch === 2) {
        if (rejected) throw new Error('Synthetic network interruption');
        return [];
      }
      return ids.map(id => ({ ...rawGrant, id }));
    }, selected);
    await assert.rejects(h.call('revokeAllTemporaryOwnerGrants', { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' }), unverified);
    assert.deepEqual(h.counts(), { mutations: 2, audits: 0 });
    assert.deepEqual(h.batches.map(ids => ids.length), [200, 1]);
  }
});

test('bulk revocation cannot claim success with an active remainder or concurrent pre-cutoff change', async () => {
  const input = { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' };
  const unchanged = rowMutationHarness([rawGrant], undefined, { keepActive: ['grant-1'] });
  await assert.rejects(unchanged.call('revokeAllTemporaryOwnerGrants', input), unverified);
  assert.deepEqual(unchanged.counts(), { mutations: 1, audits: 0 });

  const concurrent = rowMutationHarness(({ ids }) => ids.map(id => ({ ...rawGrant, id })), undefined, {
    beforeMutation: rows => { rows[0].updated_at = afterScope; },
  });
  await assert.rejects(concurrent.call('revokeAllTemporaryOwnerGrants', input), unverified);
  assert.deepEqual(concurrent.counts(), { mutations: 1, audits: 0 });

  const lateVisible = rowMutationHarness([rawGrant], undefined, {
    beforeRead: (read, rows) => { if (read === 3) rows.push({ ...rows[0], id: 'late-visible', status: 'active' }); },
  });
  await assert.rejects(lateVisible.call('revokeAllTemporaryOwnerGrants', input), unverified);
  assert.deepEqual(lateVisible.counts(), { mutations: 1, audits: 0 });

  const unavailableRemainder = rowMutationHarness([rawGrant], undefined, {
    readResponse: (rows, read) => { if (read === 3) throw new Error('Synthetic read interruption'); return rows; },
  });
  await assert.rejects(unavailableRemainder.call('revokeAllTemporaryOwnerGrants', input), unverified);
  assert.deepEqual(unavailableRemainder.counts(), { mutations: 1, audits: 0 });
});

test('bulk scope excludes post-cutoff grants and permanent grants while scanning past permanent rows', async () => {
  const permanent = Array.from({ length: 201 }, (_, index) => ({
    id: `grant-${String(index).padStart(4, '0')}`, state: 'active', expires_at: null,
  }));
  const h = rowMutationHarness([rawGrant], [...permanent, { id: 'grant-1', state: 'active' }, {
    id: 'new-grant', state: 'active', granted_at: afterScope,
  }]);
  const response = await h.call('revokeAllTemporaryOwnerGrants', { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' });
  assert.equal((await response.json()).revokedCount, 1);
  assert.deepEqual(h.batches, [['grant-1']]);
  assert.equal(h.reads.length, 6);
});

test('a short nonempty server page does not truncate bulk discovery', async () => {
  const selected = Array.from({ length: 201 }, (_, index) => ({ id: `grant-${String(index).padStart(4, '0')}`, state: 'active' }));
  const h = rowMutationHarness(({ ids }) => ids.map(id => ({ ...rawGrant, id })), selected, {
    readResponse: rows => rows.slice(0, 100),
  });
  const response = await h.call('revokeAllTemporaryOwnerGrants', { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' });
  assert.equal((await response.json()).revokedCount, 201);
  assert.equal(new Set(h.batches.flat()).size, 201);
});

test('bulk discovery fails closed on malformed or non-advancing pages before mutation', async () => {
  const input = { confirmation: 'REVOKE GRANTS', reason: 'Synthetic reason' };
  for (const readResponse of [() => null, () => [{}], rows => [rows[0], rows[0]]]) {
    const h = rowMutationHarness([rawGrant], undefined, { readResponse });
    await assert.rejects(h.call('revokeAllTemporaryOwnerGrants', input), unverified);
    assert.deepEqual(h.counts(), { mutations: 0, audits: 0 });
  }
});
