import assert from 'node:assert/strict';
// Mount the actual Signup hooks and submit handler. Only rendering and external
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
    let source = fs.readFileSync(process.env.SIGNUP_AUDIT_SOURCE || file, 'utf8');
    source = source.slice(0, source.indexOf('  return (\n    <ChillywoodBrandedSurface')) + `\nglobalThis.snapshot=(${snapshot});return null;\n}`;
    const context = { URL, URLSearchParams, console, exports: {}, setTimeout, clearTimeout, require: s => s === 'react' ? React : mocks[s] ?? {} };
    context.globalThis = context;
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText, context);
    return { Component: context.exports.default, read: () => context.snapshot };
}
async function signupHarness({ config = async () => ({ runtimeControls: {} }), signup = async () => ({ data: { user: { id: 'a' }, session: null }, error: null }), profile = async () => ({ ok: true }), legal = async () => ({ ok: true }), availability } = {}) {
    const alerts = [], calls = [], routes = [], checks = [], profileCalls = [], legalCalls = [];
    const router = { replace: r => routes.push(r) };
    let focusCallback, blurCallback;
    const valid = username => ({ username, available: username.length >= 3, status: 'available', message: 'Available' });
    const module = load('app/(auth)/signup.tsx', {
        'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({}), useFocusEffect: callback => React.useEffect(() => {
                focusCallback = callback;
                blurCallback = callback();
                return () => blurCallback?.();
            }, [callback]) },
        'react-native': { Alert: { alert: (...x) => alerts.push(x) }, Keyboard: { addListener: () => ({ remove: noop }) } },
        'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
        '../../_lib/actionSingleFlight.mjs': { createActionSingleFlightLatch },
        '../../_lib/accountLegalAcceptance': { recordAccountLegalAcceptance: async (...x) => {
                legalCalls.push(x);
                return legal(...x);
            } },
        '../../_lib/analytics': { trackEvent: noop }, '../../_lib/logger': { reportRuntimeError: noop },
        '../../_lib/runtimeConfig': { isClosedBetaEnvironment: () => false }, '../../_lib/appConfig': { readAppConfig: config },
        '../../_lib/supabase': { supabase: { auth: { signUp: async (x) => {
                        calls.push(x);
                        return signup(x);
                    } } } },
        '../../_lib/signupProfileCompletion': { completePendingSignupProfile: async (x) => {
                profileCalls.push(x);
                return profile(x);
            } },
        '../../_lib/usernameHandles': { buildUsernameSuggestions: () => [], normalizeUsernameHandle: s => s.trim().toLowerCase(), validateUsernameHandle: valid, checkUsernameAvailability: username => {
                checks.push(username);
                return availability ? availability(username) : Promise.resolve(valid(username));
            } },
    }, '{signUp,setDisplayName,setUsername,setEmail,setPassword,setAgeConfirmed,setLegalAccepted,setUsernameAvailability,usernameAvailability,loading}');
    const root = createRoot(container());
    await act(() => root.render(React.createElement(module.Component)));
    const read = module.read;
    await act(() => {
        let s = read();
        s.setDisplayName('Tester');
        s.setUsername('tester');
        s.setEmail(' TEST@example.com ');
        s.setPassword('abcdef');
        s.setAgeConfirmed(true);
        s.setLegalAccepted(true);
    });
    await act(() => read().setUsernameAvailability(valid('tester')));
    return { read, root, alerts, calls, routes, checks, profileCalls, legalCalls, blur: () => act(() => blurCallback()), focus: () => act(() => {
            blurCallback = focusCallback();
        }), unmount: () => act(() => root.unmount()) };
}
test('single-flight prevents repeated submit, normalizes email, defers legal until verified session', async () => {
    const gate = deferred();
    const h = await signupHarness({ signup: () => gate.promise });
    let first;
    await act(() => {
        first = h.read().signUp();
        void h.read().signUp();
    });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].email, 'test@example.com');
    await act(() => {
        gate.resolve({ data: { user: { id: 'a' }, session: null }, error: null });
    });
    await first;
    assert.equal(h.alerts.at(-1)[0], 'Success');
    await h.unmount();
});
test('stale username response cannot replace newer available name', async () => {
    const gates = new Map();
    const h = await signupHarness({ availability: n => {
            let d = deferred();
            gates.set(n, d);
            return d.promise;
        } });
    await act(() => new Promise(r => setTimeout(r, 420)));
    await act(() => h.read().setUsername('newtester'));
    await act(() => new Promise(r => setTimeout(r, 420)));
    await act(() => gates.get('newtester').resolve({ username: 'newtester', available: true, status: 'available', message: 'Available' }));
    await act(() => gates.get('tester').resolve({ username: 'tester', available: true, status: 'available', message: 'Available' }));
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 1);
    assert.equal(h.read().usernameAvailability.username, 'newtester');
    await h.unmount();
});
test('leaving signup during config read prevents creation and late feedback', async () => {
    const gate = deferred();
    const h = await signupHarness({ config: () => gate.promise });
    let pending;
    await act(() => {
        pending = h.read().signUp();
    });
    await h.unmount();
    gate.resolve({ runtimeControls: {} });
    await pending;
    assert.equal(h.calls.length, 0);
    assert.equal(h.alerts.length, 0);
});
test('immediate session profile exception reports incomplete setup, never confirmation email or another signup', async () => {
    const h = await signupHarness({ signup: async () => ({ data: { user: { id: 'a' }, session: { user: { id: 'a' } } }, error: null }), profile: async () => {
            throw Error('offline');
        } });
    await act(() => h.read().signUp());
    assert.equal(h.alerts.at(-1)[0], 'Account created');
    assert.doesNotMatch(h.alerts.at(-1)[1], /Check your email/);
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 1);
    await h.unmount();
});
test('required fields and consent prevent network; server error releases retry latch', async () => {
    const h = await signupHarness({ signup: async () => ({ data: {}, error: { message: 'Email rate limit exceeded' } }) });
    await act(() => h.read().setAgeConfirmed(false));
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 0);
    await act(() => h.read().setAgeConfirmed(true));
    await act(() => h.read().setLegalAccepted(false));
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 0);
    await act(() => h.read().setLegalAccepted(true));
    await act(() => h.read().signUp());
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 2);
    assert.match(h.alerts.at(-1)[1], /Too many signup attempts/);
    await h.unmount();
});
for (const boundary of ['config', 'signup', 'profile', 'legal']) {
    for (const leave of ['unmount', 'blur']) {
        test(`${leave} during ${boundary} cannot start subsequent setup or show late feedback`, async () => {
            const gate = deferred();
            const sessionResult = { data: { user: { id: 'a' }, session: { user: { id: 'a' } } }, error: null };
            const options = { signup: async () => sessionResult };
            options[boundary] = () => gate.promise;
            const h = await signupHarness(options);
            let pending;
            await act(() => {
                pending = h.read().signUp();
            });
            await h[leave]();
            await act(() => gate.resolve(boundary === 'config' ? { runtimeControls: {} } : boundary === 'signup' ? sessionResult : { ok: true }));
            await pending;
            assert.equal(h.alerts.length, 0);
            if (boundary === 'config')
                assert.equal(h.calls.length, 0);
            if (boundary === 'signup')
                assert.equal(h.profileCalls.length, 0);
            if (boundary === 'profile')
                assert.equal(h.legalCalls.length, 0);
            if (leave === 'blur') {
                await h.focus();
                assert.equal(h.read().loading, false);
                if (boundary !== 'config') {
                    await act(() => h.read().signUp());
                    assert.equal(h.calls.length, 1);
                }
                await h.unmount();
            }
        });
    }
}
test('focus return before old config read finishes still invalidates original action', async () => {
    const gate = deferred();
    const h = await signupHarness({ config: () => gate.promise });
    let pending;
    await act(() => {
        pending = h.read().signUp();
    });
    await h.blur();
    await h.focus();
    await act(() => gate.resolve({ runtimeControls: {} }));
    await pending;
    assert.equal(h.calls.length, 0);
    assert.equal(h.read().loading, false);
    await h.unmount();
});
test('confirmation-required result does not duplicate signup while success alert awaits action', async () => {
    const h = await signupHarness();
    await act(() => h.read().signUp());
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 1);
    assert.equal(h.profileCalls.length, 0);
    assert.equal(h.legalCalls.length, 0);
    await h.unmount();
});
test('immediate session profile and legal failures report account already created and keep retries local', async () => {
    for (const kind of ['profile', 'legal']) {
        const h = await signupHarness({ signup: async () => ({ data: { user: { id: 'a' }, session: { user: { id: 'a' } } }, error: null }), [kind]: async () => ({ ok: false, message: 'Setup failed', errorMessage: 'Acceptance unavailable' }) });
        await act(() => h.read().signUp());
        assert.match(h.alerts.at(-1)[1], /account was created/);
        await act(() => h.read().signUp());
        assert.equal(h.calls.length, 1);
        await h.unmount();
    }
});
test('old confirmation alert action cannot navigate after leaving and returning', async () => {
    const h = await signupHarness();
    await act(() => h.read().signUp());
    const oldAction = h.alerts.at(-1)[2][0].onPress;
    await h.blur();
    await h.focus();
    await act(() => oldAction());
    assert.equal(h.routes.length, 0);
    await h.unmount();
});
test('correcting the email permits a new request without retrying the already-created email', async () => {
    const h = await signupHarness();
    await act(() => h.read().signUp());
    await act(() => h.read().setEmail('corrected@example.com'));
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 2);
    await act(() => h.read().setEmail(' TEST@example.com '));
    await act(() => h.read().signUp());
    assert.equal(h.calls.length, 2);
    await h.unmount();
});
for (const [setter, value] of [['setDisplayName', ' '], ['setUsernameAvailability', {available:false,username:'tester',message:'Taken'}], ['setEmail', ' '], ['setPassword', ''], ['setPassword', 'short']]) {
    test(`invalid ${setter} input prevents signup`, async () => {
        const h = await signupHarness();
        await act(() => h.read()[setter](value));
        await act(() => h.read().signUp());
        assert.equal(h.calls.length, 0);
        assert.equal(h.alerts.length, 1);
        await h.unmount();
    });
}
test('new account pause prevents signup and immediate-session success completes setup once', async () => {
    const paused = await signupHarness({config:async () => ({runtimeControls:{new_accounts_enabled:false}})});
    await act(() => paused.read().signUp());
    assert.equal(paused.calls.length, 0);
    assert.equal(paused.alerts[0][0], 'New accounts are paused');
    await paused.unmount();
    const immediate = await signupHarness({signup:async () => ({data:{user:{id:'a'},session:{user:{id:'a'}}},error:null})});
    await act(() => immediate.read().signUp());
    assert.equal(immediate.profileCalls.length, 1);
    assert.equal(immediate.legalCalls.length, 1);
    assert.equal(immediate.alerts.length, 0);
    await immediate.unmount();
});
