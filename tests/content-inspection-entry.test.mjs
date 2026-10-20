import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync('app/admin.tsx', 'utf8');
const ast = ts.createSourceFile('admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  let value;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) value = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(value, name); return value;
}
function evaluate(expression, context) {
  const code = ts.transpileModule(`exports.value = ${expression};`, { fileName: 'entry.tsx', compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, ...context }; vm.runInNewContext(code, sandbox); return sandbox.exports.value;
}
const id = '00000000-0000-4000-8000-000000000011';
const valid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
const types = ['profile_post', 'chat_message', 'creator_video'];

test('actual inspection entry retires old account callbacks and rejects invalid identifiers', () => {
  const entries = [];
  const context = { useCallback: value => value, adminReadAuthorityKey: 'session-a', canOpenContentInspection: true, inspectionEntryAuthorityRef: { current: 'session-a' }, INSPECTION_TARGET_TYPES: types, isInspectionUuid: valid, setContentInspectionEntry: entry => entries.push(entry) };
  const open = evaluate(declaration('openContentInspection'), context);
  open(undefined, id); assert.equal(entries.length, 1); assert.equal(entries[0].initialSubjectUserId, id);
  open({ targetType: 'profile_post', targetId: id }); assert.equal(entries[1].initialTarget.targetId, id);
  open({ targetType: 'unknown_table', targetId: id }); open(undefined, 'invalid'); assert.equal(entries.length, 2);
  context.inspectionEntryAuthorityRef.current = 'session-b'; open(undefined, id); assert.equal(entries.length, 2);
  const revoked = evaluate(declaration('openContentInspection'), { ...context, canOpenContentInspection: false }); revoked(); assert.equal(entries.length, 2);
});

test('report references cannot silently turn unsupported entity types into another target', () => {
  const parse = evaluate(declaration('inspectionTargetFromReference'), { INSPECTION_TARGET_TYPES: types, isInspectionUuid: valid });
  assert.equal(parse('profile_post', id).targetId, id);
  assert.equal(parse('content_id', id), undefined);
  assert.equal(parse('report', id), undefined);
  assert.equal(parse('creator_video', 'bad'), undefined);
});

test('actual panel wiring hides and drops authority on access loss and closes through parent state', () => {
  let panel;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'ContentInspectionPanel') panel = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(panel);
  let entry = { authorityKey: 'role-owner', initialSubjectUserId: id };
  const authority = { userId: id, sessionGeneration: 'a' };
  const render = (allowed, authorityKey = 'role-owner') => evaluate(panel, { React: { createElement: (_type, props) => props }, ContentInspectionPanel: 'Panel', canOpenContentInspection: allowed, adminReadAuthorityKey: authorityKey, contentInspectionEntry: entry, authority, setContentInspectionEntry: value => { entry = value; } });
  assert.equal(render(true).initialSubjectUserId, id);
  assert.equal(render(false).visible, false); assert.equal(render(false).authority, null);
  assert.equal(render(true, 'role-super-admin').visible, false, 'role-only authority change retires content before effects');
  render(true).onClose(); assert.equal(entry, null); assert.equal(render(true).visible, false);
});
