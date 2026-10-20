import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const path = 'app/admin.tsx';
const source = process.env.ADMIN_COMMAND_BASELINE
  ? execFileSync('git', ['show', `${process.env.ADMIN_COMMAND_BASELINE}:${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  : readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'runOwnerCommandCenterAction') initializer = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(initializer);
const compiled = ts.transpileModule(`exports.callback = ${initializer};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness(responses) {
  const context = {
    exports: {}, useCallback: callback => callback,
    canReviewAutonomousApprovals: true, ownerCommandBusy: null, ownerCommandText: 'report autonomous system health',
    setOwnerCommandBusy: value => { context.ownerCommandBusy = value; },
    setOwnerCommandNotice: value => { context.notice = value; },
    setOwnerCommandResult: value => { context.result = value; },
    formatAdminOperationFailure: (_error, fallback) => fallback,
    loadAutonomousApprovalRequests: async () => {}, calls: [],
    supabase: { functions: { invoke: async (_name, input) => { context.calls.push(input.body); return { data: responses.shift(), error: null }; } } },
  };
  vm.runInNewContext(compiled, context);
  return { context, run: action => context.exports.callback(action ?? 'create_command') };
}
const planned = () => ({ ok: true, command: { id: 'command', status: 'planned' }, plan: { blockers: [], approvalRequired: false } });

test('submit renders exact plan blockers and does not execute a blocked command', async () => {
  const h = harness([{ ok: false, command: { id: 'blocked' }, plan: { blockers: ['ambiguous_target_system'], approvalRequired: false } }]);
  await h.run(); assert.equal(h.context.calls.length, 1);
  assert.match(h.context.notice, /blocked: ambiguous_target_system/);
  assert.equal(h.context.result.classification.blockers[0], 'ambiguous_target_system');
});
test('false ok cannot execute even with empty blocker list', async () => {
  const h = harness([{ ...planned(), ok: false }]); await h.run();
  assert.equal(h.context.calls.length, 1); assert.match(h.context.notice, /not confirmed/);
});
test('approved-plan flow preserves exact safe execution result', async () => {
  const h = harness([planned(), { ok: true, result: 'safe_command_executed' }]); await h.run();
  assert.equal(h.context.calls.length, 2); assert.match(h.context.notice, /Safe owner command executed/);
  assert.equal(h.context.result.execution.result, 'safe_command_executed');
});
test('preflight-only success never claims execution', async () => {
  const h = harness([planned(), { ok: true, result: 'preflight_passed_target_operator_execution_required', executed: false }]); await h.run();
  assert.match(h.context.notice, /execution was not confirmed/);
});
test('execution blockers appear rather than a created/planned success', async () => {
  const h = harness([planned(), { ok: false, blockers: ['approval_expired'] }]); await h.run();
  assert.match(h.context.notice, /blocked: approval_expired/);
  assert.equal(h.context.result.classification.blockers[0], 'approval_expired');
});
test('approval-required plan does not execute and reports created approval', async () => {
  const h = harness([{ ok: true, command: { id: 'command' }, plan: { blockers: [], approvalRequired: true }, approvalRequest: { id: 'approval' } }]); await h.run();
  assert.equal(h.context.calls.length, 1); assert.match(h.context.notice, /Approval request created/);
});
test('display uses execution result and labels bounded/historical evidence honestly', () => {
  assert.match(source, /ownerCommandResult\.execution\?\.result \?\? ownerCommandResult\.command\?\.status/);
  assert.match(source, /Loaded Events \/ Actions in 24h/);
  assert.match(source, /not complete 24-hour totals/);
  assert.match(source, /Historical source evidence summary below/);
  assert.match(source, /not current production verification/);
});
