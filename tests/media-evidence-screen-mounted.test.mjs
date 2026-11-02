import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { loadMediaPickerHost } from './helpers/media-picker-host.mjs';
const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const text = node => node == null ? '' : typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const owner = (sessionGeneration = 'one') => ({ userId: 'A', accountId: 'A', sessionGeneration, state: 'ACTIVE', restoreOnly: false });

async function mount(t, path, select = async () => [{ uri: 'file:evidence.png', name: 'evidence.png', mimeType: 'image/png', size: 10 }], options = {}) {
  const state = { authority: options.guest ? null : owner(), buttons: new Map(), labels: new Set(), modal: null, picks: [] };
  const host = name => function Host(props) {
    if (name === 'Modal') { state.modal = props; if (!props.visible) return null; }
    if (name === 'Text') state.labels.add(text(props.children));
    if (props.onPress) state.buttons.set(props.testID || text(props.children), props);
    return React.createElement(React.Fragment, null, React.Children.toArray(props.children).filter(React.isValidElement));
  };
  const native = { Platform: { OS: 'ios' }, StyleSheet: { create: value => value }, Alert: { alert: noop } };
  for (const name of ['ActivityIndicator', 'KeyboardAvoidingView', 'Text', 'TextInput', 'TouchableOpacity', 'View', 'Modal', 'Pressable', 'ScrollView']) native[name] = host(name);
  const account = { getCurrentAccountSessionAuthoritySnapshot: () => state.authority,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b) };
  const media = loadMediaPickerHost({ React, native, host, snapshot: account.getCurrentAccountSessionAuthoritySnapshot });
  const modules = {
    react: React, 'react-native': native, 'expo-router': { useLocalSearchParams: () => ({ caseId: 'case-A' }), router: { push: noop } },
    '../_lib/session': { useSession: () => ({ authority: state.authority, user: { id: 'A' }, isLoading: false, isSignedIn: true }) },
    '../hooks/useMediaPicker': media, '../_lib/accountSessionAuthority': account,
    '../hooks/useOwnedPickedMediaState': media, '../_lib/mediaPickerResources': media,
    '../_lib/deviceAttachmentPicker': { pickDeviceAttachments: async (source, options) => { state.picks.push({ source, options }); return select(); } },
    '../_lib/dmca': { DMCA_ATTACHMENT_ALLOWED_MIME_TYPES: ['image/png', 'application/pdf'], DMCA_ATTACHMENT_MAX_BYTES: 1024,
      DMCA_CONTENT_TYPES: ['creator_video'], validateDmcaAttachmentFile: input => { assert.equal(input.mimeType, 'image/png'); assert.equal(input.sizeBytes, 10); }, ...options.dmca },
    '../_lib/legalPolicies': { LEGAL_SUPPORT_EMAIL: 'legal@example.invalid' },
    '../_lib/userFacingErrors': { getUserFacingErrorMessage: error => error.message },
    '../_lib/userFacingProductCopy': { formatContentTypeLabel: value => value },
    '../components/legal/legal-page-shell': Object.fromEntries(['LegalMeta', 'LegalPageShell', 'LegalParagraph', 'LegalSection'].map(name => [name, host(name)])),
  };
  const scope = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, fetch: options.fetch ?? noop };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, scope);
  const root = createRoot(container());
  const render = async () => React.act(async () => { state.labels.clear(); state.buttons.clear(); root.render(React.createElement(scope.exports.default)); });
  t.after(() => React.act(async () => root.unmount())); await render();
  const press = async key => React.act(async () => { const button = state.buttons.get(key); assert.ok(button, `visible action ${key}`); void button.onPress(); });
  const dismiss = async () => React.act(async () => { state.modal.onDismiss(); });
  return { state, render, press, dismiss, media };
}

for (const path of ['app/copyright-report.tsx', 'app/counter-notice.tsx']) {
  test(`${path} mapped evidence wrapper owns the exact imported file until Remove`, async t => {
    const file = { uri: 'fixture:evidence-owned.png', name: 'evidence.png', mimeType: 'image/png', size: 10 }; let deleted = 0;
    const h = await mount(t, path, async () => [file], { guest: path.includes('copyright') });
    h.media.ownPickedMedia(file, async () => { deleted++; });
    await h.press('Add Evidence Files'); await h.press('media-source-files'); await h.dismiss();
    assert.equal(deleted, 0); assert.ok(h.state.labels.has('evidence.png'));
    await h.press('Remove'); assert.equal(deleted, 1);
  });
  test(`${path} evidence reader remains leased after account scope retires`, async t => {
    const file = { uri: 'fixture:evidence-pending.png', name: 'evidence.png', mimeType: 'image/png', size: 10 }; let deleted = 0, uploads = 0, settle;
    const read = new Promise(resolve => { settle = resolve; });
    const h = await mount(t, path, async () => [file], { guest: path.includes('copyright'), fetch: async () => ({ arrayBuffer: () => read }), dmca: {
      captureDmcaAttachmentMutationSubject: async () => ({}),
      submitDmcaNotice: async () => ({ id: 'case-A', caseNumber: 'A', attachmentToken: 'synthetic' }),
      readMyDmcaCounterNoticeCase: async () => ({ id: 'case-A', status: 'open', contentType: 'creator_video' }),
      submitUploaderDmcaCounterNotice: async () => ({ id: 'counter-A' }),
      uploadDmcaPublicNoticeAttachment: async () => { uploads++; }, uploadDmcaCounterNoticeAttachment: async () => { uploads++; },
    } });
    h.media.ownPickedMedia(file, async () => { deleted++; });
    await h.press('Add Evidence Files'); await h.press('media-source-files'); await h.dismiss();
    if (path.includes('counter')) await h.press('Load My Case');
    await h.press(path.includes('copyright') ? 'Submit Copyright Notice' : 'Submit Counter-Notice');
    h.state.authority = owner('two'); await h.render(); assert.equal(deleted, 0);
    await React.act(async () => settle(new ArrayBuffer(10))); assert.equal(deleted, 1); assert.equal(uploads, 0);
  });
}

for (const path of ['app/copyright-report.tsx', 'app/counter-notice.tsx']) {
  test(`${path} mounted evidence retains the six-file limit and disables a full picker`, async t => {
    const h = await mount(t, path, async () => Array.from({ length: 6 }, (_, index) => ({ uri: `file:evidence-${index}.png`, name: `evidence-${index}.png`, mimeType: 'image/png', size: 10 })));
    await h.press('Add Evidence Files'); await h.press('media-source-files'); await h.dismiss();
    const full = h.state.buttons.get('6 of 6 evidence files attached');
    assert.ok(full); assert.equal(full.disabled, true);
    await React.act(async () => { void full.onPress(); }); assert.equal(h.state.picks.length, 1);
  });
  for (const source of ['photos', 'camera', 'files']) {
    test(`${path} mounted evidence action exposes shared ${source} after real dismissal`, async t => {
      const h = await mount(t, path);
      await h.press('Add Evidence Files'); await h.press('Add Evidence Files');
      assert.equal(h.state.modal?.visible, true, 'authenticated form must render the source sheet');
      assert.equal(h.state.picks.length, 0);
      await h.press(`media-source-${source}`);
      assert.equal(h.state.modal.visible, false); assert.equal(h.state.picks.length, 0);
      await h.dismiss(); assert.equal(h.state.picks.length, 1);
      assert.equal(h.state.picks[0].source, source); assert.equal(h.state.picks[0].options.multiple, true);
      assert.equal(h.state.picks[0].options.selectionLimit, 6); assert.ok(h.state.picks[0].options.operation);
      assert.ok(h.state.labels.has('evidence.png'));
      await h.press('Add Evidence Files'); await h.press('media-source-cancel'); await h.dismiss();
      assert.equal(h.state.picks.length, 1); assert.ok(h.state.labels.has('evidence.png'), 'cancel retains existing evidence');
    });
  }
  test(`${path} mounted same-user session replacement discards delayed evidence`, async t => {
    let resolve;
    const held = new Promise(done => { resolve = done; });
    const h = await mount(t, path, () => held);
    await h.press('Add Evidence Files'); await h.press('media-source-photos'); await h.dismiss();
    assert.equal(h.state.picks.length, 1);
    h.state.authority = owner('two'); await h.render();
    await React.act(async () => { resolve([{ uri: 'file:retired.png', name: 'retired.png', mimeType: 'image/png', size: 10 }]); });
    assert.equal(h.state.labels.has('retired.png'), false);
  });
}
