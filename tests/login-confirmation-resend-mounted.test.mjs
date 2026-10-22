import assert from 'node:assert/strict';
// Mount the actual Login hooks and resend handler. Only rendering and external
// dependencies are substituted; no real accounts, email, or legal writes occur.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { createActionSingleFlightLatch } from '../_lib/actionSingleFlight.mjs';
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {
};
const documentStub = { addEventListener: noop, defaultView: globalThis, documentElement: null, nodeType: 9, removeEventListener: noop };
const container = () => ({ addEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: documentStub, parentNode: null, removeEventListener: noop, tagName: 'DIV' });
documentStub.documentElement = container();
globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {
};
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    return { resolve, reject, promise };
};
const settle = async () => {
    for (let i = 0; i < 40; i++)
        await Promise.resolve();
};
const act = async (fn) => React.act(async () => {
    await fn();
    await settle();
});
function load(file, mocks, snapshot) {
    let source = fs.readFileSync(process.env.LOGIN_RESEND_AUDIT_SOURCE || file, 'utf8');
    source = source.slice(0, source.indexOf('  return (\n    <ChillywoodBrandedSurface')) + `\nglobalThis.snapshot=(${snapshot});return null;\n}`;
    const context = { URL, URLSearchParams, Date: mocks.clock ?? Date, console, exports: {}, setTimeout: mocks.timers?.setTimeout ?? setTimeout, clearTimeout: mocks.timers?.clearTimeout ?? clearTimeout, require: s => s === 'react' ? React : mocks[s] ?? {} };
    context.globalThis = context;
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }, fileName: file }).outputText, context);
    return { Component: context.exports.default, read: () => context.snapshot };
}

async function harness({ resend = async () => ({ error: null }), signIn, sdkClient, now = () => Date.now() } = {}) {
  const calls = [], signIns = [], alerts = [];
  const timers = new Map();
  let nextTimer = 0;
  let focusCallback, blurCallback;
  const module = load('app/(auth)/login.tsx', {
    clock: class extends Date { static now() { return now(); } },
    timers: {
      setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id),
    },
    'expo-router': {
      useRouter: () => ({}), useLocalSearchParams: () => ({}),
      useFocusEffect: callback => React.useEffect(() => {
        focusCallback = callback; blurCallback = callback();
        return () => blurCallback?.();
      }, [callback]),
    },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../_lib/actionSingleFlight.mjs': { createActionSingleFlightLatch },
    '../../_lib/analytics': { trackEvent: noop },
    '../../_lib/logger': { reportRuntimeError: noop },
    '../../_lib/runtimeConfig': { isClosedBetaEnvironment: () => false },
    '../../_lib/signupProfileCompletion': { completePendingSignupProfile: async () => ({ ok: true }) },
    '../../_lib/userFacingErrors': { getUserFacingErrorMessage: () => 'Confirm your email, then try signing in again.' },
    '../../_lib/supabase': { supabase: { auth: {
      resend: async parameters => {
        calls.push(parameters);
        return sdkClient ? sdkClient.auth.resend(parameters) : resend(parameters);
      },
      signInWithPassword: async parameters => {
        signIns.push(parameters);
        return signIn ? signIn(parameters) : { data: {}, error: { message: 'Email not confirmed' } };
      },
    } } },
  }, '{resendConfirmation,changeEmail,setPassword,signIn,resending,resendWaitExpired,resendMessage,email}');
  const root = createRoot(container());
  await act(() => root.render(React.createElement(module.Component)));
  return {
    read: module.read, calls, signIns, alerts,
    timers,
    expireWait: () => act(() => {
      for (const [id, timer] of [...timers]) {
        assert.equal(timer.delay, 15_000);
        timers.delete(id);
        timer.callback();
      }
    }),
    blur: () => act(() => blurCallback()),
    focus: () => act(() => { blurCallback = focusCallback(); }),
    unmount: () => act(() => root.unmount()),
  };
}

test('mount and unconfirmed login error never automatically send email', async () => {
  const h = await harness();
  assert.equal(h.calls.length, 0);
  await act(() => { h.read().changeEmail('person@example.com'); h.read().setPassword('password'); });
  await act(() => h.read().signIn());
  assert.equal(h.signIns.length, 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.alerts.length, 1);
  await h.unmount();
});

test('explicit resend needs only a valid email and uses canonical signup SDK parameters', async () => {
  const h = await harness();
  await act(() => h.read().resendConfirmation());
  assert.equal(h.calls.length, 0);
  await act(() => h.read().changeEmail('invalid'));
  await act(() => h.read().resendConfirmation());
  assert.equal(h.calls.length, 0);
  await act(() => h.read().changeEmail(' Person@Example.com '));
  await act(() => h.read().resendConfirmation());
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [{
    type: 'signup', email: 'person@example.com',
    options: { emailRedirectTo: 'https://chillywoodstream.com/auth-callback' },
  }]);
  assert.match(h.read().resendMessage, /If this email is eligible/);
  assert.equal(h.signIns.length, 0);
  await h.unmount();
});

test('real installed SDK sends one signup resend POST to synthetic transport', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const transport = [];
  const sdkClient = createClient('https://fixture.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      transport.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const h = await harness({ sdkClient });
  await act(() => h.read().changeEmail('person@example.com'));
  await act(() => h.read().resendConfirmation());
  assert.equal(transport.length, 1);
  const request = transport[0];
  const url = new URL(request.url);
  assert.equal(url.origin, 'https://fixture.invalid');
  assert.equal(url.pathname, '/auth/v1/resend');
  assert.equal(url.searchParams.get('redirect_to'), 'https://chillywoodstream.com/auth-callback');
  assert.equal(request.method, 'POST');
  assert.equal(request.body.email, 'person@example.com');
  assert.equal(request.body.type, 'signup');
  assert.equal(request.body.password, undefined);
  await h.unmount();
});

test('same-frame repeats and post-settlement cooldown never dispatch duplicate requests', async () => {
  const gate = deferred();
  const h = await harness({ resend: () => gate.promise });
  await act(() => h.read().changeEmail('person@example.com'));
  let pending;
  await act(() => { pending = h.read().resendConfirmation(); void h.read().resendConfirmation(); });
  assert.equal(h.calls.length, 1);
  await act(() => gate.resolve({ error: null }));
  await pending;
  await act(() => h.read().resendConfirmation());
  assert.equal(h.calls.length, 1);
  assert.match(h.read().resendMessage, /Wait at least a minute/);
  await h.unmount();
});

for (const transition of ['edit', 'edit-back', 'blur', 'blur-refocus', 'unmount']) {
  for (const outcome of ['success', 'rejection']) {
    test(`${transition} suppresses stale ${outcome} after dispatch`, async () => {
      const gate = deferred();
      const h = await harness({ resend: () => gate.promise });
      await act(() => h.read().changeEmail('original@example.com'));
      let pending;
      await act(() => { pending = h.read().resendConfirmation(); });
      if (transition.startsWith('edit')) {
        await act(() => h.read().changeEmail('new@example.com'));
        if (transition === 'edit-back') await act(() => h.read().changeEmail('original@example.com'));
      } else if (transition === 'unmount') await h.unmount();
      else {
        await h.blur();
        if (transition === 'blur-refocus') await h.focus();
      }
      await act(() => outcome === 'success' ? gate.resolve({ error: null }) : gate.reject(new Error('network lost')));
      await pending;
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0].email, 'original@example.com');
      assert.equal(h.read().resendMessage, '');
      if (transition !== 'unmount') await h.unmount();
    });
  }
}

test('unknown and already-verified accounts receive the same non-enumerating guidance as success', async () => {
  const messages = [];
  for (const error of [null, { code: 'user_not_found', message: 'User not found' }, { message: 'Email already confirmed' }]) {
    const h = await harness({ resend: async () => ({ error }) });
    await act(() => h.read().changeEmail('person@example.com'));
    await act(() => h.read().resendConfirmation());
    messages.push(h.read().resendMessage);
    assert.doesNotMatch(h.read().resendMessage, /already confirmed|not found/);
    await h.unmount();
  }
  assert.equal(new Set(messages).size, 1);
});

test('provider rate limits and ambiguous failures give safe feedback without automatic retries', async () => {
  for (const outcome of ['rate', 'network', 'server', 'throw']) {
    const h = await harness({ resend: async () => {
      if (outcome === 'throw') throw new Error('network lost');
      return { error: outcome === 'rate' ? { status: 429, code: 'over_email_send_rate_limit' } : outcome === 'server' ? { status: 503, message: 'Service unavailable' } : { message: 'Failed to fetch' } };
    } });
    await act(() => h.read().changeEmail('person@example.com'));
    await act(() => h.read().resendConfirmation());
    assert.equal(h.calls.length, 1);
    assert.match(h.read().resendMessage, outcome === 'rate' ? /Too many email requests/ : /couldn't confirm whether an email was sent/);
    await act(() => h.read().resendConfirmation());
    assert.equal(h.calls.length, 1);
    await h.unmount();
  }
});

test('login and resend cannot overlap in either dispatch order', async () => {
  for (const first of ['login', 'resend']) {
    const gate = deferred();
    const h = await harness({ signIn: () => gate.promise, resend: () => gate.promise });
    await act(() => { h.read().changeEmail('person@example.com'); h.read().setPassword('password'); });
    let pending;
    await act(() => { pending = first === 'login' ? h.read().signIn() : h.read().resendConfirmation(); });
    await act(() => first === 'login' ? h.read().resendConfirmation() : h.read().signIn());
    assert.equal(h.calls.length + h.signIns.length, 1);
    await act(() => gate.resolve({ data: {}, error: { message: 'Email not confirmed' } }));
    await pending;
    await h.unmount();
  }
});

test('visible Login UI exposes explicit resend and binds email edits to invalidation', () => {
  const source = fs.readFileSync('app/(auth)/login.tsx', 'utf8');
  assert.match(source, /testID="login-resend-confirmation-button"/);
  assert.match(source, /onChangeText=\{changeEmail\}/);
  assert.match(source, /onPress=\{\(\) => \{ void resendConfirmation\(\); \}\}/);
  assert.match(source, /disabled=\{loading \|\| resending\}/);
});

test('cooldown expiry permits only a new explicit press, not an automatic retry', async () => {
  let time = 10_000;
  const h = await harness({ now: () => time });
  await act(() => h.read().changeEmail('person@example.com'));
  await act(() => h.read().resendConfirmation());
  time += 60_001;
  await act(() => {});
  assert.equal(h.calls.length, 1);
  await act(() => h.read().resendConfirmation());
  assert.equal(h.calls.length, 2);
  await h.unmount();
});

test('editing email before React rerender binds a press to the newly displayed email', async () => {
  const h = await harness();
  await act(() => h.read().changeEmail('original@example.com'));
  await act(async () => {
    const oldRender = h.read();
    oldRender.changeEmail('edited@example.com');
    await oldRender.resendConfirmation();
  });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].email, 'edited@example.com');
  await h.unmount();
});

test('never-settling resend releases Login after UI deadline but never releases the send latch', async () => {
  const h = await harness({ resend: () => new Promise(() => {}) });
  await act(() => { h.read().changeEmail('person@example.com'); h.read().setPassword('password'); });
  await act(() => { void h.read().resendConfirmation(); });
  await act(() => h.read().signIn());
  assert.equal(h.signIns.length, 0);
  await h.expireWait();
  assert.equal(h.read().resending, true);
  assert.equal(h.read().resendWaitExpired, true);
  assert.match(h.read().resendMessage, /outcome is not confirmed/);
  await act(() => h.read().resendConfirmation());
  assert.equal(h.calls.length, 1);
  await act(() => h.read().signIn());
  assert.equal(h.signIns.length, 1);
  assert.equal(h.calls.length, 1);
  await h.unmount();
  assert.equal(h.timers.size, 0);
});

for (const transition of ['edit', 'edit-back', 'blur-refocus']) {
  test(`${transition} across deadline preserves unresolved-send tracking and allows Login`, async () => {
    const gate = deferred();
    const h = await harness({ resend: () => gate.promise });
    await act(() => { h.read().changeEmail('original@example.com'); h.read().setPassword('password'); });
    let pending;
    await act(() => { pending = h.read().resendConfirmation(); });
    if (transition === 'blur-refocus') await h.blur();
    else {
      await act(() => h.read().changeEmail('changed@example.com'));
      if (transition === 'edit-back') await act(() => h.read().changeEmail('original@example.com'));
    }
    await h.expireWait();
    if (transition === 'blur-refocus') await h.focus();
    assert.match(h.read().resendMessage, /previous confirmation request is still pending/);
    assert.equal(h.read().resendWaitExpired, true);
    await act(() => h.read().resendConfirmation());
    assert.equal(h.calls.length, 1);
    await act(() => h.read().signIn());
    assert.equal(h.signIns.length, 1);
    await act(() => gate.resolve({ error: null }));
    await pending;
    assert.equal(h.read().resendMessage, '', 'old success must not overwrite a newer login attempt');
    assert.equal(h.read().resending, false);
    assert.equal(h.read().resendWaitExpired, false);
    await h.unmount();
  });
}

test('late same-action settlement updates guidance without retrying or claiming cancellation', async () => {
  const gate = deferred();
  const h = await harness({ resend: () => gate.promise });
  await act(() => h.read().changeEmail('person@example.com'));
  let pending;
  await act(() => { pending = h.read().resendConfirmation(); });
  await h.expireWait();
  await act(() => gate.resolve({ error: null }));
  await pending;
  assert.match(h.read().resendMessage, /If this email is eligible/);
  assert.equal(h.read().resending, false);
  assert.equal(h.read().resendWaitExpired, false);
  assert.equal(h.calls.length, 1);
  await h.unmount();
});

test('unmount clears UI deadline and late rejected transport cannot publish feedback', async () => {
  const gate = deferred();
  const h = await harness({ resend: () => gate.promise });
  await act(() => h.read().changeEmail('person@example.com'));
  let pending;
  await act(() => { pending = h.read().resendConfirmation(); });
  assert.equal(h.timers.size, 1);
  await h.unmount();
  assert.equal(h.timers.size, 0);
  gate.reject(new Error('network lost after unmount'));
  await pending;
  assert.equal(h.calls.length, 1);
  assert.equal(h.read().resendMessage, '');
});

for (const transition of ['edit', 'refocus-before-deadline', 'refocus-after-deadline']) {
  for (const outcome of ['success', 'error']) {
    test(`${transition} clears generic pending guidance on late ${outcome} without publishing stale target outcome`, async () => {
      const gate = deferred();
      const h = await harness({ resend: () => gate.promise });
      await act(() => h.read().changeEmail('original@example.com'));
      let pending;
      await act(() => { pending = h.read().resendConfirmation(); });
      if (transition === 'edit') await act(() => h.read().changeEmail('changed@example.com'));
      else {
        await h.blur();
        if (transition === 'refocus-before-deadline') await h.focus();
      }
      await h.expireWait();
      if (transition === 'refocus-after-deadline') await h.focus();
      assert.match(h.read().resendMessage, /previous confirmation request is still pending/);
      await act(() => outcome === 'success' ? gate.resolve({ error: null }) : gate.reject(new Error('late failure')));
      await pending;
      assert.equal(h.read().resending, false);
      assert.equal(h.read().resendWaitExpired, false);
      assert.equal(h.read().resendMessage, '');
      assert.equal(h.calls.length, 1);
      await h.unmount();
    });
  }
}
