// Mount shipped loader declarations and their real lifecycle/session modules.
// API responses and surrounding screen state are controlled, not a native screen.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { createRoot } from 'react-dom/client';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const source = fs.readFileSync(process.env.ADMIN_SCOPED_READ_SOURCE || 'app/admin.tsx', 'utf8');
const ast = ts.createSourceFile('admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map(), ui = new Map();
function visit(node) {
  if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, node.getText(ast));
  }
  if (ts.isJsxElement(node)) {
    const id = node.openingElement.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === 'testID');
    if (id?.initializer && ts.isStringLiteral(id.initializer)) ui.set(id.initializer.text, node.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const compile = (code, mocks) => {
  const module = { exports: {} };
  const result = ts.transpileModule(code, { fileName: 'probe.tsx', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } });
  assert.equal(result.diagnostics.filter(row => row.category === ts.DiagnosticCategory.Error).length, 0);
  vm.runInNewContext(result.outputText, { module, exports: module.exports, ...mocks });
  return module.exports;
};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; };
const session = (id = 'one', generation = 'first') => ({ userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const payload = (lane, marker) => lane === 'security' ? { security: { marker }, safetyDashboard: { marker } } : [{ key: marker, label: marker, permissions: [] }];
const marker = (lane, rows) => lane === 'security' ? rows?.marker : rows[0]?.key;

async function mount(t, lane) {
  const pending = [], mutations = [];
  const authorityApi = loadStubbed('_lib/accountSessionAuthority.ts');
  const hook = loadStubbed(process.env.ADMIN_SCOPED_HOOK_SOURCE || 'hooks/use-admin-scoped-read.ts', {
    react: React, '../_lib/accountSessionAuthority': authorityApi,
  });
  let props = { scope: 'one:first:owner', authority: session(), allowed: true }, current, mounted = true;
  authorityApi.publishAccountSessionAuthoritySnapshot(props.authority);
  const integrationNames = ['clearPermissionTemplateRead', 'clearOwnerSecurityRead', 'permissionTemplateRead', 'ownerSecurityRead',
    'runPermissionTemplateRead', 'runOwnerSecurityRead', 'permissionTemplates', 'ownerSecurityStatus', 'ownerSafetyDashboard'];
  // The old-source control uses its original loaders, not substitute guarded loaders.
  const integration = declarations.has('permissionTemplateRead')
    ? integrationNames.map(name => declarations.get(name)).join('\n')
    : `const permissionTemplates = storedPermissionTemplates, ownerSecurityStatus = storedOwnerSecurityStatus;
       const ownerSecurityRead = { loading: ownerControlLoading, error: ownerControlNotice }, permissionTemplateRead = ownerSecurityRead;`;
  const harness = compile(`
    const { useState, useCallback } = require('react');
    ${declarations.get('formatAdminOperationFailure')}
    exports.Probe = function Probe() {
      const p = getProps(), adminReadAuthorityKey = p.scope, authority = p.authority;
      const canAccessOwnerSecurity = p.allowed, canManagePermissionTemplates = p.allowed;
      const [ownerControlLoading, setOwnerControlLoading] = useState(false);
      const [ownerControlNotice, setOwnerControlNotice] = useState(null);
      const [storedOwnerSecurityStatus, setOwnerSecurityStatus] = useState(null);
      const [storedOwnerSafetyDashboard, setOwnerSafetyDashboard] = useState(null);
      const [storedPermissionTemplates, setPermissionTemplates] = useState([]);
      const [permissionTemplateKey, setPermissionTemplateKey] = useState('support_agent');
      const [permissionTemplateBusy, setPermissionTemplateBusy] = useState(null);
      const permissionTemplateEmail = 'synthetic@example.test', permissionTemplateReason = 'Synthetic audit reason', permissionTemplateDuration = 'until_revoked';
      ${integration}
      ${declarations.get('loadOwnerSecurity')}
      ${declarations.get('loadPermissionTemplates')}
      ${declarations.get('runPermissionTemplateAction')}
      capture({ load: ${lane === 'security' ? 'loadOwnerSecurity' : 'loadPermissionTemplates'},
        state: ${lane === 'security' ? 'ownerSecurityRead' : 'permissionTemplateRead'},
        rows: ${lane === 'security' ? 'ownerSecurityStatus' : 'permissionTemplates'},
        notice: ownerControlNotice, setNotice: setOwnerControlNotice, selected: permissionTemplateKey, select: setPermissionTemplateKey,
        action: runPermissionTemplateAction, busy: permissionTemplateBusy });
      return null;
    };`, {
    require: () => React, useAdminScopedRead: hook.useAdminScopedRead,
    getProps: () => props, capture: value => { current = value; },
    readOwnerSecurityStatus: () => { const p = deferred(); pending.push(p); return p.promise; },
    listPermissionTemplates: () => { const p = deferred(); pending.push(p); return p.promise; },
    applyPermissionTemplate: async input => { mutations.push(['apply', input]); },
    revokePermissionTemplate: async input => { mutations.push(['revoke', input]); },
    loadPlatformRoles: async () => {}, maskOperatorIdentity: email => email,
  });
  const root = createRoot(container());
  const act = callback => React.act(async () => { await callback(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  const render = () => act(() => root.render(React.createElement(harness.Probe)));
  const unmount = async () => { if (mounted) { mounted = false; await act(() => root.unmount()); } };
  await render(); t.after(unmount);
  return { get current() { return current; }, pending, mutations, act, unmount,
    async start() { await act(() => { void current.load(); }); },
    async change(patch) { props = { ...props, ...patch }; await render(); },
    async publish(authority) { await act(() => authorityApi.publishAccountSessionAuthoritySnapshot(authority)); },
  };
}

for (const lane of ['security', 'templates']) {
  test(`${lane}: production read keeps latest refresh when completions finish backwards`, async t => {
    const h = await mount(t, lane); await h.start(); await h.start();
    await h.act(() => h.pending[1].resolve(payload(lane, 'current')));
    await h.act(() => h.pending[0].resolve(payload(lane, 'stale')));
    assert.equal(marker(lane, h.current.rows), 'current', 'older read must not overwrite current data');
    assert.equal(h.current.state.loading, false);
  });
  test(`${lane}: old error cannot stop the newer spinner or overwrite its successful recovery`, async t => {
    const h = await mount(t, lane); await h.start(); await h.start();
    await h.act(() => h.pending[0].reject(Error('old failure')));
    assert.equal(h.current.state.loading, true, 'current read must remain loading');
    assert.equal(h.current.state.error, null);
    await h.act(() => h.pending[1].resolve(payload(lane, 'current')));
    assert.equal(h.current.state.error, null); assert.equal(h.current.state.loading, false);
  });
  test(`${lane}: current denial clears stale data and keeps a sanitized retryable error`, async t => {
    const h = await mount(t, lane); await h.start(); await h.act(() => h.pending[0].resolve(payload(lane, 'seed')));
    await h.start(); await h.act(() => h.pending[1].reject({ code: '42501', message: 'private backend detail' }));
    assert.equal(marker(lane, h.current.rows), undefined);
    assert.match(h.current.state.error, /not allowed for the current backend role/);
    assert.doesNotMatch(h.current.state.error, /private backend detail/);
    assert.equal(h.current.state.loading, false);
    await h.start(); assert.equal(h.current.state.error, null);
    await h.act(() => h.pending[2].resolve(payload(lane, 'recovered')));
    assert.equal(marker(lane, h.current.rows), 'recovered');
  });
  test(`${lane}: latest denial cannot be overwritten by an older success`, async t => {
    const h = await mount(t, lane); await h.start(); await h.start();
    await h.act(() => h.pending[1].reject({ code: '42501' }));
    await h.act(() => h.pending[0].resolve(payload(lane, 'stale')));
    assert.equal(marker(lane, h.current.rows), undefined);
    assert.match(h.current.state.error, /not allowed for the current backend role/);
    assert.equal(h.current.state.loading, false);
  });
  for (const patch of [{ allowed: false }, { scope: null }, { scope: 'one:first:operator:new-permissions' },
    { scope: 'two:first:owner', authority: session('two') }, { scope: 'one:second:owner', authority: session('one', 'second') }]) {
    test(`${lane}: changed access/permission/account/session retires held data and old callback ${JSON.stringify(patch)}`, async t => {
      const h = await mount(t, lane), stale = h.current.load; await h.start(); await h.change(patch);
      await h.act(() => h.pending[0].resolve(payload(lane, 'retired')));
      assert.equal(marker(lane, h.current.rows), undefined, 'retired read must not publish');
      await h.act(() => { void stale(); }); assert.equal(h.pending.length, 1, 'retired callback must not dispatch');
    });
  }
  test(`${lane}: semantic equivalent authority rerender preserves current read`, async t => {
    const h = await mount(t, lane); await h.start(); await h.change({ authority: { ...session() } });
    await h.act(() => h.pending[0].resolve(payload(lane, 'current')));
    assert.equal(marker(lane, h.current.rows), 'current');
  });
  test(`${lane}: permission A/B/A never revives an old callback or completion`, async t => {
    const h = await mount(t, lane), stale = h.current.load; await h.start();
    await h.change({ scope: 'one:first:other-permissions' }); await h.change({ scope: 'one:first:owner' });
    await h.start(); await h.act(() => { void stale(); }); assert.equal(h.pending.length, 2);
    await h.act(() => h.pending[0].resolve(payload(lane, 'retired'))); assert.equal(h.current.state.loading, true);
    await h.act(() => h.pending[1].resolve(payload(lane, 'fresh'))); assert.equal(marker(lane, h.current.rows), 'fresh');
  });
  test(`${lane}: live session retirement and A/unavailable/A cannot revive work without prop changes`, async t => {
    const h = await mount(t, lane), stale = h.current.load; await h.start();
    await h.publish(null); assert.equal(h.current.state.loading, false); assert.equal(marker(lane, h.current.rows), undefined);
    await h.publish(session()); await h.start();
    await h.act(() => { void stale(); }); assert.equal(h.pending.length, 2);
    await h.act(() => h.pending[0].resolve(payload(lane, 'retired'))); assert.equal(h.current.state.loading, true);
    await h.act(() => h.pending[1].resolve(payload(lane, 'fresh'))); assert.equal(marker(lane, h.current.rows), 'fresh');
  });
  test(`${lane}: restore-only session cannot start or publish a read`, async t => {
    const h = await mount(t, lane), stale = h.current.load; await h.start();
    await h.publish({ ...session(), restoreOnly: true });
    await h.act(() => { void stale(); }); assert.equal(h.pending.length, 1);
    await h.act(() => h.pending[0].resolve(payload(lane, 'retired'))); assert.equal(marker(lane, h.current.rows), undefined);
  });
  test(`${lane}: unmount retires results and queued callbacks`, async t => {
    const h = await mount(t, lane), stale = h.current.load; await h.start(); await h.unmount();
    await h.act(() => h.pending[0].resolve(payload(lane, 'late')));
    await h.act(() => { void stale(); }); assert.equal(h.pending.length, 1);
  });
  test(`${lane}: read success or failure cannot clear newer mutation feedback`, async t => {
    const h = await mount(t, lane); await h.start();
    await h.act(() => h.current.setNotice('Confirmed new action'));
    await h.act(() => h.pending[0].reject(Error('read failed')));
    assert.equal(h.current.notice, 'Confirmed new action'); assert.match(h.current.state.error, /Failed to load/);
    await h.start(); await h.act(() => h.pending[1].resolve(payload(lane, 'recovered')));
    assert.equal(h.current.notice, 'Confirmed new action'); assert.equal(h.current.state.error, null);
  });
}

test('templates: actual successful action keeps confirmation through follow-up read and separate read failure', async t => {
  const h = await mount(t, 'templates'); await h.act(() => { void h.current.action('apply'); });
  assert.equal(h.mutations.length, 1); assert.equal(h.pending.length, 1);
  assert.match(h.current.notice, /Permission template applied/);
  await h.act(() => h.pending[0].reject(Error('read failed')));
  assert.match(h.current.notice, /Permission template applied/); assert.match(h.current.state.error, /Failed to load/);
  assert.equal(h.current.busy, null); assert.equal(h.mutations.length, 1, 'read failure must not retry a mutation');
});

test('templates: delayed catalog read preserves a newer valid selected template', async t => {
  const h = await mount(t, 'templates'); await h.start(); await h.act(() => h.current.select('legal_reviewer'));
  await h.act(() => h.pending[0].resolve([{ key: 'support_agent' }, { key: 'legal_reviewer' }]));
  assert.equal(h.current.selected, 'legal_reviewer');
});

for (const [id, label] of [['permission-template-read-error', 'Refresh templates'], ['owner-security-read-error', 'Refresh'], ['owner-safety-read-error', 'Refresh safety dashboard']]) {
  test(`${id}: shipped JSX exposes an accessible read error with its recovery action`, () => {
    assert.ok(ui.has(id), 'production error region must exist');
    const rendered = compile(`exports.tree = (${ui.get(id)});`, {
      React, View: 'View', Text: 'Text', styles: {},
      permissionTemplateRead: { error: 'Read unavailable.' }, ownerSecurityRead: { error: 'Read unavailable.' },
    }).tree;
    const text = React.Children.toArray(rendered.props.children)[0];
    assert.equal(text.props.accessibilityRole, 'alert'); assert.equal(text.props.accessibilityLiveRegion, 'polite');
    assert.match(React.Children.toArray(text.props.children).join(''), new RegExp(label));
  });
}

test('locked template explanation matches the real permission helper and gives a human next step', () => {
  assert.match(source, /active Owner session, or an active Admin or Moderator session with staff_permission_templates or admin_grants permission\. Ask an Owner to review your access/);
  assert.doesNotMatch(source, /staff_permission_template_manage/);
  assert.match(fs.readFileSync('_lib/moderation.ts', 'utf8'), /canManageStaffPermissionTemplates[\s\S]*?\["staff_permission_templates", "admin_grants"\]/);
});
