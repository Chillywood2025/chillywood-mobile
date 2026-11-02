import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mountFullChatThread } from './assurance/helpers/chat-thread-full-mounted-harness.mjs';
const ts = createRequire(import.meta.url)('typescript');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const file = { uri: 'file:///retained.png', name: 'retained.png', mimeType: 'image/png' };
const subject = runtime => ({ accessToken: 'fixture', authority: { userId: runtime.userId, accountId: runtime.userId, sessionGeneration: runtime.sessionGeneration, state: 'ACTIVE', restoreOnly: false } });
const saved = body => ({ id: 'saved', threadId: 'thread', senderUserId: 'local-user', body, createdAt: '2026-11-01T00:00:00Z', attachments: [] });
async function mount(t, options = {}) {
  const h = await mountFullChatThread({ noActiveCall: true, invite: { status: 'ended' }, ...options });
  t.after(() => h.unmount()); return h;
}
async function attach(h) {
  await h.run(() => { void h.runtime.snapshot.handlePickAttachment(); });
  const sheet = h.runtime.snapshot.mediaPickerSheet;
  await h.run(() => sheet.props.onChoose('photos')); await h.run(() => sheet.props.onDismiss());
}
test('definite pre-call capture failure restores unchanged typed text and selected file without invoking send', async t => {
  let captures = 0, sends = 0;
  const h = await mount(t, { pickAttachment: async () => file,
    captureMutationSubject: runtime => { if (++captures > 1) throw Error('Preflight unavailable'); return subject(runtime); },
    chatApi: { sendChatMessage: async () => { sends++; return saved('unexpected'); } } });
  await attach(h); await h.run(() => h.runtime.snapshot.handleDraftChange('Do not lose this text'));
  await h.run(() => h.runtime.snapshot.handleSend());
  assert.equal(sends, 0); assert.equal(h.runtime.snapshot.draft, 'Do not lose this text');
  assert.equal(h.runtime.snapshot.attachmentFile, file); assert.equal(h.runtime.snapshot.messageSendRecoveries.length, 0);
});
test('held preflight failure preserves newer composition and keeps earlier attempted text separately', async t => {
  const held = deferred(); const h = await mount(t, { captureMutationSubject: () => held.promise });
  await h.run(() => h.runtime.snapshot.handleDraftChange('Earlier text'));
  await h.run(() => { void h.runtime.snapshot.handleSend(); });
  await h.run(() => h.runtime.snapshot.handleDraftChange('Newer text'));
  await h.run(() => held.reject(Error('Preflight unavailable')));
  assert.equal(h.runtime.snapshot.draft, 'Newer text');
  assert.equal(h.runtime.snapshot.messageSendRecoveries[0].body, 'Earlier text');
  assert.equal(h.runtime.snapshot.messageSendRecoveries[0].outcome, 'not_sent');
});
test('API rejection retains a visible non-resendable text/file snapshot; absent or matching refresh is not exact receipt proof', async t => {
  let sends = 0, rows = [];
  const h = await mount(t, { pickAttachment: async () => file, readMessages: async () => rows,
    chatApi: { sendChatMessage: async () => { sends++; throw Error('Transport response lost'); } } });
  await attach(h); await h.run(() => h.runtime.snapshot.handleDraftChange('Attempted text'));
  await h.run(() => h.runtime.snapshot.handleSend());
  assert.equal(h.runtime.snapshot.draft, ''); assert.equal(h.runtime.snapshot.attachmentFile, null);
  const recovery = h.runtime.snapshot.messageSendRecoveries[0];
  assert.equal(recovery.body, 'Attempted text'); assert.equal(recovery.attachmentFile, file); assert.equal(recovery.outcome, 'unconfirmed');
  assert.match(h.runtime.snapshot.error, /Send not confirmed/);
  await h.run(() => h.runtime.snapshot.handleSend()); assert.equal(sends, 1, 'there is no resendable composer');
  await h.run(() => h.runtime.snapshot.loadThreadState()); assert.equal(h.runtime.snapshot.messageSendRecoveries[0], recovery);
  rows = [saved('Attempted text')]; await h.run(() => h.runtime.snapshot.loadThreadState());
  assert.ok(h.runtime.snapshot.messages.some(message => message.id === 'saved'));
  assert.equal(h.runtime.snapshot.messageSendRecoveries[0], recovery, 'same text does not identify this attempt');
  assert.equal(sends, 1);
});
test('API failure does not overwrite newer typed text', async t => {
  const held = deferred(); const h = await mount(t, { chatApi: { sendChatMessage: () => held.promise } });
  await h.run(() => h.runtime.snapshot.handleDraftChange('Attempt one'));
  await h.run(() => { void h.runtime.snapshot.handleSend(); });
  await h.run(() => h.runtime.snapshot.handleDraftChange('New draft'));
  await h.run(() => held.reject(Error('Transport unavailable')));
  assert.equal(h.runtime.snapshot.draft, 'New draft'); assert.equal(h.runtime.snapshot.messageSendRecoveries[0].body, 'Attempt one');
});
test('known saved parent never erases newer composition or creates an unconfirmed retry copy', async t => {
  const held = deferred(); const h = await mount(t, { chatApi: { sendChatMessage: () => held.promise } });
  await h.run(() => h.runtime.snapshot.handleDraftChange('Confirmed parent'));
  await h.run(() => { void h.runtime.snapshot.handleSend(); });
  await h.run(() => h.runtime.snapshot.handleDraftChange('Keep this next message'));
  await h.run(() => { const error = Error('Message saved; attachment unconfirmed'); error.name = 'AttachmentParentSavedError'; held.reject(error); });
  assert.equal(h.runtime.snapshot.draft, 'Keep this next message'); assert.equal(h.runtime.snapshot.messageSendRecoveries.length, 0);
});
for (const phase of ['preflight', 'api']) test(`${phase} failure after account replacement cannot expose the old attempted draft`, async t => {
  const held = deferred(); const h = await mount(t, phase === 'preflight' ? { captureMutationSubject: () => held.promise } : { chatApi: { sendChatMessage: () => held.promise } });
  await h.run(() => h.runtime.snapshot.handleDraftChange('Private old-account text'));
  await h.run(() => { void h.runtime.snapshot.handleSend(); });
  await h.rerender({ userId: 'replacement-user', sessionGeneration: 'replacement-session' });
  await h.run(() => held.reject(Error('Old private failure')));
  assert.equal(h.runtime.snapshot.draft, ''); assert.equal(h.runtime.snapshot.messageSendRecoveries.length, 0);
  assert.notEqual(h.runtime.snapshot.error, 'Old private failure');
});
test('quick-reply override does not erase the independent current composer', async t => {
  const h = await mount(t, { chatApi: { sendChatMessage: async (_thread, body) => saved(body) } });
  await h.run(() => h.runtime.snapshot.handleDraftChange('Unrelated draft'));
  await h.run(() => h.runtime.snapshot.handleSend('Quick reply'));
  assert.equal(h.runtime.snapshot.draft, 'Unrelated draft');
});
test('recovery UI uses selectable attempted text/file and only refresh/dismiss actions, never Retry or Send', () => {
  const source = fs.readFileSync('app/chat/[threadId].tsx', 'utf8');
  const ast = ts.createSourceFile('chat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let recovery;
  const visit = node => { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'messageSendRecoveries.map') recovery = node; ts.forEachChild(node, visit); };
  visit(ast); assert.ok(recovery);
  const text = recovery.getText(ast);
  assert.match(text, /<Text selectable/); assert.match(text, /file=\{attempt\.attachmentFile\}/);
  assert.match(text, /Refresh conversation without resending/); assert.match(text, /Dismiss this attempted-message copy without sending/);
  assert.doesNotMatch(text, /handleSend|sendChatMessage|Retry/);
});
