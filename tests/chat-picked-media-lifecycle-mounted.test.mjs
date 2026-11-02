import assert from 'node:assert/strict';
import test from 'node:test';
import { mountFullChatThread } from './assurance/helpers/chat-thread-full-mounted-harness.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const subject = runtime => ({accessToken: 'test', authority: {userId: runtime.userId, accountId: runtime.userId, sessionGeneration: runtime.sessionGeneration, state: 'ACTIVE', restoreOnly: false}});
const saved = body => ({id: 'saved', threadId: 'thread', senderUserId: 'local-user', body, attachments: []});
async function mount(t, options = {}) {
  let chosen = null, mounted = true;
  const h = await mountFullChatThread({ noActiveCall: true, invite: {status: 'ended'}, pickAttachment: async () => chosen, ...options });
  const cleaned = [], media = h.runtime.mediaResources;
  t.after(async () => { if (mounted) await h.unmount(); });
  const owned = name => {
    const file = {uri: `file:///owned-chat-${name}.png`, name: `${name}.png`, mimeType: 'image/png'};
    media.ownPickedMedia(file, async () => { cleaned.push(name); }); return file;
  };
  return {...h, media, owned, cleaned,
    async choose(file) {
      chosen = file;
      await h.run(() => { void h.runtime.snapshot.handlePickAttachment(); });
      const sheet = h.runtime.snapshot.mediaPickerSheet; assert.ok(sheet);
      await h.run(() => sheet.props.onChoose('photos')); await h.run(() => sheet.props.onDismiss());
    },
    async unmount() { await h.unmount(); mounted = false; },
  };
}

test('full Chat replacement, cancelled replacement, and actual Remove button retire only abandoned selected files', async t => {
  const h = await mount(t), first = h.owned('first'), second = h.owned('second');
  await h.choose(first); await h.choose(null); assert.equal(h.runtime.snapshot.attachmentFile, first); assert.deepEqual(h.cleaned, []);
  await h.choose(second); assert.deepEqual(h.cleaned, ['first']); assert.equal(h.runtime.snapshot.attachmentFile, second);
  await h.run(() => h.runtime.snapshot.removeAttachment()); assert.deepEqual(h.cleaned, ['first', 'second']);
});

test('full Chat owns file before composer clear and preflight await, then retires only after confirmed send', async t => {
  const preflight = deferred(); let captures = 0, sends = 0;
  const h = await mount(t, {
    captureMutationSubject: runtime => ++captures === 1 ? subject(runtime) : preflight.promise,
    chatApi: {sendChatMessage: async (_thread, body) => { sends++; return saved(body); }},
  });
  const file = h.owned('sent'); await h.choose(file); await h.run(() => h.runtime.snapshot.handleDraftChange('One attempt'));
  await h.run(() => { void h.runtime.snapshot.handleSend(); });
  assert.equal(h.runtime.snapshot.attachmentFile, null); assert.deepEqual(h.cleaned, []); assert.equal(sends, 0);
  await h.run(() => preflight.resolve(subject(h.runtime)));
  assert.equal(sends, 1); assert.deepEqual(h.cleaned, ['sent']);
});

test('full Chat preflight failure transfers exact file back to unchanged composer before send finally releases it', async t => {
  let captures = 0;
  const h = await mount(t, { captureMutationSubject: runtime => { if (++captures > 1) throw Error('Preflight unavailable'); return subject(runtime); } });
  const file = h.owned('restored'); await h.choose(file); await h.run(() => h.runtime.snapshot.handleDraftChange('Keep it'));
  await h.run(() => h.runtime.snapshot.handleSend());
  assert.equal(h.runtime.snapshot.attachmentFile, file); assert.equal(h.runtime.snapshot.draft, 'Keep it'); assert.deepEqual(h.cleaned, []);
  await h.run(() => h.runtime.snapshot.removeAttachment()); assert.deepEqual(h.cleaned, ['restored']);
});

test('full Chat unconfirmed snapshot retains its file through empty refresh and actual Dismiss retires it', async t => {
  let sends = 0;
  const h = await mount(t, {readMessages: async () => [], chatApi: {sendChatMessage: async () => { sends++; throw Error('Lost acknowledgement'); }}});
  const file = h.owned('unconfirmed'); await h.choose(file); await h.run(() => h.runtime.snapshot.handleDraftChange('Do not resend'));
  await h.run(() => h.runtime.snapshot.handleSend());
  const attempt = h.runtime.snapshot.messageSendRecoveries[0]; assert.equal(attempt.attachmentFile, file); assert.deepEqual(h.cleaned, []);
  await h.run(() => h.runtime.snapshot.loadThreadState()); assert.deepEqual(h.cleaned, []);
  await h.run(() => h.runtime.snapshot.handleSend()); assert.equal(sends, 1);
  await h.run(() => h.runtime.snapshot.dismissMessageRecovery(attempt)); assert.deepEqual(h.cleaned, ['unconfirmed']);
  assert.equal(h.runtime.snapshot.messageSendRecoveries.length, 0);
});

test('full Chat recovery dismissal cannot delete a file while the timed-out raw native reader still uses it', async t => {
  const raw = deferred(), timeout = deferred(); let h, reader;
  h = await mount(t, {chatApi: {sendChatMessage: async (_thread, _body, file) => {
    reader = h.media.withPickedMediaRead(file.uri, () => raw.promise);
    return Promise.race([reader, timeout.promise]);
  }}});
  const file = h.owned('raw-pending'); await h.choose(file); await h.run(() => h.runtime.snapshot.handleDraftChange('Pending'));
  await h.run(() => { void h.runtime.snapshot.handleSend(); });
  await h.run(() => timeout.reject(Error('Response timeout')));
  const attempt = h.runtime.snapshot.messageSendRecoveries[0]; assert.ok(attempt);
  await h.run(() => h.runtime.snapshot.dismissMessageRecovery(attempt)); assert.deepEqual(h.cleaned, []);
  await h.run(() => raw.resolve(saved('Pending'))); await reader;
  assert.deepEqual(h.cleaned, ['raw-pending']); assert.equal(h.runtime.snapshot.messageSendRecoveries.length, 0);
});

for (const replace of ['account', 'thread', 'unmount']) test(`full Chat ${replace} retirement drops UI ownership but not an already-started send`, async t => {
  const held = deferred(), h = await mount(t, {chatApi: {sendChatMessage: () => held.promise}});
  const file = h.owned(replace); await h.choose(file); await h.run(() => h.runtime.snapshot.handleDraftChange('Original target'));
  await h.run(() => { void h.runtime.snapshot.handleSend(); });
  if (replace === 'account') await h.rerender({userId: 'replacement', sessionGeneration: 'replacement'});
  if (replace === 'thread') await h.rerender({threadId: 'replacement'});
  if (replace === 'unmount') await h.unmount();
  assert.deepEqual(h.cleaned, []);
  await h.run(() => held.resolve(saved('Original target'))); assert.deepEqual(h.cleaned, [replace]);
  assert.equal(h.runtime.snapshot.messageSendRecoveries.length, 0);
});

test('full Chat known-saved parent outcome has no recovery owner and releases after send settlement', async t => {
  const h = await mount(t, {chatApi: {sendChatMessage: async () => { const error = Error('Saved parent'); error.name = 'AttachmentParentSavedError'; throw error; }}});
  const file = h.owned('saved-parent'); await h.choose(file); await h.run(() => h.runtime.snapshot.handleDraftChange('Saved once'));
  await h.run(() => h.runtime.snapshot.handleSend());
  assert.equal(h.runtime.snapshot.messageSendRecoveries.length, 0); assert.deepEqual(h.cleaned, ['saved-parent']);
});

test('a detached Chat send handler cannot reopen an already-replaced owned file or erase the new selection', async t => {
  let sends = 0;
  const h = await mount(t, {chatApi: {sendChatMessage: async (_thread, body) => { sends++; return saved(body); }}});
  const first = h.owned('old'), second = h.owned('new'); await h.choose(first);
  await h.run(() => h.runtime.snapshot.handleDraftChange('Current draft'));
  const staleSend = h.runtime.snapshot.handleSend;
  await h.choose(second); assert.deepEqual(h.cleaned, ['old']);
  await h.run(() => staleSend()); assert.equal(sends, 0); assert.equal(h.runtime.snapshot.attachmentFile, second);
  assert.equal(h.runtime.snapshot.draft, 'Current draft'); assert.deepEqual(h.cleaned, ['old']);
  assert.match(h.runtime.snapshot.error, /attachment changed/);
});

for (const replace of ['account', 'thread']) test(`full Chat final native-result handoff rechecks ${replace} before adopting and disposes the unadopted wrapper`, async t => {
  const gate = deferred(), cleaned = [], file = {uri: 'file:///native-handoff.png', name: 'native-handoff.png', mimeType: 'image/png'};
  let arrived = false;
  const h = await mount(t, {beforeMediaPickerHandoff: async () => { arrived = true; await gate.promise; },
    pickAttachment: async (_kind, _source, operation) => { operation.ownResource(file, async () => { cleaned.push('native'); }); return file; }});
  await h.choose(file); assert.equal(arrived, true); assert.equal(h.runtime.snapshot.attachmentFile, null);
  await h.rerender(replace === 'account' ? {userId: 'replacement', sessionGeneration: 'replacement'} : {threadId: 'replacement'});
  await h.run(() => gate.resolve());
  assert.equal(h.runtime.snapshot.attachmentFile, null); assert.deepEqual(cleaned, ['native']);
});

test('full Chat adopts the file lease before disposing its successful native wrapper and can still send it', async t => {
  const cleaned = [], file = {uri: 'file:///wrapped-native.png', name: 'wrapped-native.png', mimeType: 'image/png'};
  let h;
  h = await mount(t, {pickAttachment: async (_kind, _source, operation) => {
    operation.ownResource(file, async () => { cleaned.push('native'); }); return file;
  }, chatApi: {sendChatMessage: async (_thread, body, selected) => h.media.withPickedMediaRead(selected.uri, async () => saved(body))}});
  await h.choose(file); assert.equal(h.runtime.snapshot.attachmentFile, file); assert.deepEqual(cleaned, []);
  await h.run(() => h.runtime.snapshot.handleDraftChange('Retained wrapper file'));
  await h.run(() => h.runtime.snapshot.handleSend()); assert.deepEqual(cleaned, ['native']);
});
