// Execute the shipped dialog JSX and action callbacks with controlled UI I/O.
// These are usability/state tests, not database authority or physical-device proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/admin.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map(), modals = [], templateButtons = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(parsed) === 'Modal'
    && node.openingElement.attributes.getText(parsed).includes('visible={ownerSecurityConfirmVisible}')) modals.push(node);
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === 'OwnerAdminActionButton'
    && node.attributes.getText(parsed).includes('canManagePermissionTemplates')) templateButtons.push(node);
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(modals.length, 1);
assert.equal(templateButtons.length, 2);
function compile(expression, context) {
  const result = ts.transpileModule(`globalThis.result = (${expression});`, {
    fileName: 'owner-security-dialog.tsx', reportDiagnostics: true,
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React},
  });
  assert.equal(result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  vm.runInContext(result.outputText, context);
  return context.result;
}
const elements = node => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
};
const text = node => {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (React.isValidElement(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
};
const one = (tree, predicate) => {
  const found = elements(tree).filter(predicate);
  assert.equal(found.length, 1);
  return found[0];
};
const action = {kind: 'revoke-grant', grantId: 'synthetic-grant', confirmation: 'REVOKE GRANT', title: 'Revoke selected grant?'};
function harness({failure, pending, kind = action, permitted = true} = {}) {
  const calls = [];
  const context = vm.createContext({
    React, String, Number, styles: new Proxy({}, {get: () => ({})}),
    Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', ScrollView: 'ScrollView',
    View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator',
    OwnerAdminActionButton: 'OwnerAdminActionButton', Platform: {OS: 'ios'}, safeAreaInsets: {top: 0, bottom: 0},
    canAccessOwnerSecurity: true, ownerSecurityActionBusy: null, ownerSecurityConfirmVisible: true,
    ownerSecurityDangerAction: kind, ownerSecurityReason: 'Review requested access', ownerSecurityConfirmText: kind.confirmation,
    ownerControlNotice: null, canManagePermissionTemplates: permitted, permissionTemplateBusy: null,
    async runPermissionTemplateAction(operation) {calls.push(['template', operation]);},
    async loadOwnerSecurity() {calls.push(['refresh']);},
  });
  for (const [setter, field] of Object.entries({
    setOwnerControlNotice: 'ownerControlNotice', setOwnerSecurityActionBusy: 'ownerSecurityActionBusy',
    setOwnerSecurityConfirmVisible: 'ownerSecurityConfirmVisible', setOwnerSecurityDangerAction: 'ownerSecurityDangerAction',
    setOwnerSecurityConfirmText: 'ownerSecurityConfirmText', setOwnerSecurityReason: 'ownerSecurityReason',
  })) context[setter] = value => {context[field] = value;};
  for (const name of ['revokeOwnerDevice', 'revokeTemporaryOwnerGrant', 'revokeAllTemporaryOwnerGrants']) {
    context[name] = async args => {
      calls.push([name, args]);
      if (pending) await pending;
      if (failure) throw failure;
      return {revokedCount: 3};
    };
  }
  context.formatAdminOperationFailure = compile(declarations.get('formatAdminOperationFailure').initializer.getText(parsed), context);
  const callback = name => {
    const initializer = declarations.get(name)?.initializer;
    assert.equal(initializer.expression.getText(parsed), 'useCallback');
    return initializer.arguments[0].getText(parsed);
  };
  context.openOwnerSecurityDangerAction = compile(callback('openOwnerSecurityDangerAction'), context);
  // React callbacks retain the state of their render while setters schedule a new render.
  // Capture those values for each invocation so asynchronous success follows that same contract.
  const fields = ['canAccessOwnerSecurity', 'ownerSecurityActionBusy', 'ownerSecurityDangerAction', 'ownerSecurityReason', 'ownerSecurityConfirmText'];
  const capture = compile(`state => { const {${fields.join(',')}} = state; return (${callback('runOwnerSecurityDangerConfirm')}); }`, context);
  let operation;
  context.runOwnerSecurityDangerConfirm = () => {
    operation = capture(Object.fromEntries(fields.map(field => [field, context[field]])))();
    return operation;
  };
  const render = compile(`() => (${modals[0].getText(parsed)})`, context);
  const templates = compile(`() => (<>${templateButtons.map(node => node.getText(parsed)).join('')}</>)`, context);
  const confirm = tree => one(tree, node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel !== 'Cancel security action');
  return {context, calls, render, templates, confirm, operation: () => operation};
}

test('a denied security change remains visible inside its open dialog with a recovery action', async () => {
  const h = harness({failure: {code: '42501', message: 'private denied detail'}});
  h.confirm(h.render()).props.onPress();
  await h.operation();
  const tree = h.render();
  const notice = one(tree, node => node.props.testID === 'owner-security-confirmation-notice');
  assert.match(text(notice), /not allowed for the current backend role/);
  assert.match(text(notice), /Cancel, then refresh Owner Security/);
  assert.doesNotMatch(text(notice), /private denied detail/);
  assert.equal(one(notice, node => node.props.accessibilityRole === 'alert').props.accessibilityLiveRegion, 'polite');
  assert.equal(h.context.ownerSecurityConfirmVisible, true);
  assert.equal(h.context.ownerSecurityActionBusy, null);
  const cancel = one(tree, node => node.props.accessibilityLabel === 'Cancel security action');
  assert.equal(cancel.props.disabled, false);
  cancel.props.onPress();
  assert.equal(h.context.ownerSecurityConfirmVisible, false);
  assert.equal(h.context.ownerSecurityReason, '');
  assert.equal(h.context.ownerSecurityDangerAction, null);
  assert.equal(h.calls.length, 1, 'closing the dialog does not retry the denied write');
  h.context.openOwnerSecurityDangerAction(action);
  assert.equal(h.context.ownerControlNotice, null, 'old notices must not masquerade as a new action failure');
});

test('an unverified action outcome is not presented as successful and asks for current-state refresh', async () => {
  const h = harness({failure: {code: 'owner_control_outcome_unverified'}});
  h.confirm(h.render()).props.onPress();
  await h.operation();
  const notice = one(h.render(), node => node.props.testID === 'owner-security-confirmation-notice');
  assert.match(text(notice), /did not verify this action’s outcome/);
  assert.match(text(notice), /Refresh the affected data before deciding whether to retry/);
  assert.equal(h.context.ownerSecurityConfirmVisible, true);
  assert.equal(h.calls.length, 1, 'no automatic retry or success refresh');
});

test('reason length and exact confirmation explain why the destructive action is disabled', () => {
  const h = harness();
  h.context.ownerSecurityReason = 'short';
  assert.equal(h.confirm(h.render()).props.disabled, true);
  assert.match(text(h.render()), /reason with at least 6 characters/);
  one(h.render(), node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Reason, at least 6 characters').props.onChangeText('A complete reason');
  h.context.ownerSecurityConfirmText = 'wrong';
  assert.equal(h.confirm(h.render()).props.disabled, true);
  one(h.render(), node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Type REVOKE GRANT to confirm').props.onChangeText('REVOKE GRANT');
  assert.equal(h.confirm(h.render()).props.disabled, false);
  assert.equal(h.confirm(h.render()).props.accessibilityLabel, 'Revoke selected grant');
  assert.equal(h.calls.length, 0);
});

test('pending bulk revocation has clear scope and progress and cannot be dismissed or edited', async () => {
  let finish;
  const pending = new Promise(resolve => {finish = resolve;});
  const bulk = {kind: 'bulk-revoke-grants', confirmation: 'REVOKE GRANTS', title: 'Revoke temporary and test grants?'};
  const h = harness({pending, kind: bulk});
  assert.match(text(h.render()), /Ordinary permanent permissions and grants added afterward are unchanged/);
  assert.match(text(h.render()), /grants identified as test or cleanup grants/);
  assert.equal(h.confirm(h.render()).props.accessibilityLabel, 'Revoke temporary and test grants');
  h.confirm(h.render()).props.onPress();
  const busy = h.render();
  assert.match(text(busy), /Applying security change/);
  assert.equal(h.confirm(busy).props.disabled, true);
  assert.equal(one(busy, node => node.props.accessibilityLabel === 'Cancel security action').props.disabled, true);
  assert.ok(elements(busy).filter(node => node.type === 'TextInput').every(node => node.props.editable === false));
  busy.props.onRequestClose();
  assert.equal(h.context.ownerSecurityConfirmVisible, true, 'hardware Back cannot conceal an in-flight change');
  finish();
  await h.operation();
  assert.equal(h.context.ownerSecurityConfirmVisible, false);
  assert.equal(h.context.ownerSecurityActionBusy, null);
  assert.match(h.context.ownerControlNotice, /Revoked 3 temporary or test grants present when this action started/);
  assert.deepEqual(h.calls.map(call => call[0]), ['revokeAllTemporaryOwnerGrants', 'refresh']);
});

test('hardware Back clears an idle device-trust form without performing its security action', () => {
  const h = harness({kind: {kind: 'revoke-device', deviceId: 'synthetic-device', confirmation: 'UNTRUST DEVICE', title: 'Mark device untrusted?'}});
  assert.match(text(h.render()), /It does not sign the device out/);
  assert.equal(h.confirm(h.render()).props.accessibilityLabel, 'Mark device untrusted');
  h.render().props.onRequestClose();
  assert.equal(h.context.ownerSecurityConfirmVisible, false);
  assert.equal(h.context.ownerSecurityReason, '');
  assert.equal(h.context.ownerSecurityConfirmText, '');
  assert.equal(h.context.ownerSecurityDangerAction, null);
  assert.equal(h.calls.length, 0);
});

test('staff template controls are disabled when locked or while either action is pending', () => {
  const h = harness({permitted: false});
  const buttons = () => elements(h.templates()).filter(node => node.type === 'OwnerAdminActionButton');
  assert.ok(buttons().every(node => node.props.label === 'Locked' && node.props.disabled));
  h.context.canManagePermissionTemplates = true;
  assert.ok(buttons().every(node => !node.props.disabled));
  for (const operation of ['apply', 'revoke']) {
    h.context.permissionTemplateBusy = operation;
    assert.ok(buttons().every(node => node.props.disabled));
  }
  assert.equal(h.calls.length, 0);
});
