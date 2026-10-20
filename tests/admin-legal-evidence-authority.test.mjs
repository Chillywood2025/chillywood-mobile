import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual pure declarations and action guards without starting the
// Edge server. This proves policy branching, not session/RLS/database authority.
const path = 'supabase/functions/admin-legal-evidence/index.ts';
const source = readFileSync(path, 'utf8');
const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declarations = new Map();
for (const statement of syntax.statements) if (ts.isVariableStatement(statement)) {
  for (const declaration of statement.declarationList.declarations) {
    declarations.set(declaration.name.getText(syntax), declaration.initializer?.getText(syntax));
  }
}
const names = ['toText', 'sanitizeText', 'normalizePermission', 'requireReason',
  'canReleaseHold', 'hasPermission', 'hasAnyPermission', 'shouldWriteAppAudit', 'resolveLegalReason'];
const guards = [];
function visit(node) {
  if (ts.isIfStatement(node) && ts.isBlock(node.thenStatement)
    && node.expression.getText(syntax).startsWith('action ===')) {
    const guard = node.thenStatement.statements[0];
    assert.ok(ts.isIfStatement(guard), `action must start with permission guard: ${node.expression.getText(syntax)}`);
    assert.ok(ts.isPrefixUnaryExpression(guard.expression) && guard.expression.operator === ts.SyntaxKind.ExclamationToken);
    guards.push(`if (${node.expression.getText(syntax)}) return ${guard.expression.operand.getText(syntax)};`);
  }
  ts.forEachChild(node, visit);
}
visit(syntax);
assert.equal(guards.length, 5, 'all legal action branches are covered');
const code = names.map(name => {
  assert.ok(declarations.get(name), `missing production declaration ${name}`);
  return `const ${name} = ${declarations.get(name)};`;
}).join('\n') + `
const actionAllowed = (action, user) => {
  const auth = { user };
  ${guards.join('\n')}
  throw new Error("unknown test action");
};
Object.assign(exports, { actionAllowed, canReleaseHold, shouldWriteAppAudit, resolveLegalReason });`;
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { actionAllowed, canReleaseHold, shouldWriteAppAudit, resolveLegalReason } = context.exports;
const user = (role, permissions = [], activeBreakGlassSessionId = null) => ({
  role, permissions: new Set(permissions), activeBreakGlassSessionId,
});

test('actual legal action guards require independent grants for every nonowner scope', () => {
  const actions = ['preview_matrix', 'preview', 'search', 'export', 'place_hold', 'release_hold'];
  for (const action of actions) {
    assert.equal(actionAllowed(action, user('owner')), true, `owner ${action}`);
    assert.equal(actionAllowed(action, user('super_admin')), false, `ungranted Super Admin ${action}`);
    assert.equal(actionAllowed(action, user('operator')), false, `ungranted operator ${action}`);
    assert.equal(actionAllowed(action, user('super_admin', ['live_ops', 'audit_review'])), false, `unrelated grant ${action}`);
  }
  for (const role of ['super_admin', 'operator']) {
    for (const grant of ['legal_review', 'evidence_preview']) {
      for (const action of ['preview_matrix', 'preview', 'search']) {
        assert.equal(actionAllowed(action, user(role, [grant])), true, `${role} ${grant} ${action}`);
      }
      assert.equal(actionAllowed('export', user(role, [grant])), false, `${grant} cannot export`);
      assert.equal(actionAllowed('place_hold', user(role, [grant])), false, `${grant} cannot place hold`);
    }
    assert.equal(actionAllowed('export', user(role, ['evidence_export'])), true);
    assert.equal(actionAllowed('preview', user(role, ['evidence_export'])), false);
    assert.equal(actionAllowed('place_hold', user(role, ['legal_hold'])), true);
    assert.equal(actionAllowed('export', user(role, ['legal_hold'])), false);
    for (const action of actions.filter(value => value !== 'release_hold')) {
      assert.equal(actionAllowed(action, user(role, ['legal_ops'])), true, `${role} legal_ops ${action}`);
    }
  }
});

test('hold release requires owner or Super Admin with its exact legal scope', () => {
  assert.equal(canReleaseHold(user('owner')), true);
  for (const scope of ['legal_hold', 'legal_ops']) {
    assert.equal(actionAllowed('release_hold', user('super_admin', [scope])), true);
    for (const role of ['operator', 'moderator', 'member']) {
      assert.equal(canReleaseHold(user(role, [scope])), false, `${role} cannot release with ${scope}`);
    }
  }
  for (const scope of ['legal_review', 'evidence_preview', 'evidence_export', 'live_ops']) {
    assert.equal(canReleaseHold(user('super_admin', [scope])), false, `${scope} cannot release`);
  }
});

test('Super Admin legal actions retain reason and audit while ordinary owner behavior stays intact', () => {
  const owner = user('owner');
  assert.equal(shouldWriteAppAudit(owner), false);
  assert.equal(resolveLegalReason(owner, '', 'Owner fallback'), 'Owner fallback');
  for (const actor of [user('super_admin', ['legal_ops']), user('operator', ['legal_ops']), user('owner', [], 'break-glass')]) {
    assert.equal(shouldWriteAppAudit(actor), true);
    assert.throws(() => resolveLegalReason(actor, '', 'fallback'), /legal_reason_required/);
    assert.equal(resolveLegalReason(actor, 'Reviewed legal request', 'fallback'), 'Reviewed legal request');
  }
});
