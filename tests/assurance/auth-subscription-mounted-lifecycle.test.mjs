#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const ts = require("typescript");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const documentStub = {
  addEventListener: noop,
  defaultView: globalThis,
  documentElement: null,
  nodeType: 9,
  removeEventListener: noop,
};
const createContainer = () => ({
  addEventListener: noop,
  namespaceURI: "http://www.w3.org/1999/xhtml",
  nodeName: "DIV",
  nodeType: 1,
  ownerDocument: documentStub,
  parentNode: null,
  removeEventListener: noop,
  tagName: "DIV",
});
documentStub.documentElement = createContainer();
globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class HTMLIFrameElement {};

const deferred = () => {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
};

const settle = async (turns = 40) => {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
};

const loadComponent = ({ file, marker, mocks, snapshot }) => {
  let source = fs.readFileSync(file, "utf8");
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${file} render marker exists`);
  source = `${source.slice(0, markerIndex)}\n globalThis.__snapshot=(${snapshot});return null;\n}`;
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: file,
  }).outputText;
  const context = {
    URL,
    URLSearchParams,
    console,
    exports: {},
    globalThis: null,
    require: (specifier) => specifier === "react" ? React : mocks[specifier] ?? {},
  };
  context.globalThis = context;
  vm.runInNewContext(javascript, context, { filename: file });
  return {
    Component: context.exports.default,
    read: () => context.__snapshot,
  };
};

const render = async (root, Component, strictMode = false) => {
  await React.act(async () => {
    root.render(strictMode
      ? React.createElement(React.StrictMode, null, React.createElement(Component))
      : React.createElement(Component));
    await settle();
  });
};

const unmount = async (root) => {
  await React.act(async () => {
    root.unmount();
    await settle();
  });
};

const createAuthHarness = async ({
  consumeAuthInput = () => true,
  initialParams = { code: "code-a", type: "signup" },
  strictMode = false,
} = {}) => {
  let params = initialParams;
  let currentSession = null;
  const clears = [];
  const exchanges = [];
  const routes = [];
  const runtimeErrors = [];
  const trackedEvents = [];
  const router = { replace: (route) => routes.push(route) };
  const module = loadComponent({
    file: "app/auth-callback.tsx",
    marker: "  return (\n    <ChillywoodBrandedSurface",
    snapshot: "{checking,title,message}",
    mocks: {
      "../_lib/accountSessionAuthority": {
        clearExactLocalAuthSession: async (_client, userId, accessToken) => {
          const exact = currentSession?.user.id === userId && currentSession?.access_token === accessToken;
          clears.push({ accessToken, exact, userId });
          if (exact) currentSession = null;
          return exact;
        },
        readCurrentAccountSessionAuthority: async () => currentSession
          ? { restoreOnly: false, userId: currentSession.user.id }
          : null,
      },
      "../_lib/analytics": { trackEvent: (name, properties) => trackedEvents.push({ name, properties }) },
      "../_lib/appLinks": {
        consumeApplicationAuthInput: consumeAuthInput,
        parseApplicationLink: (route) => ({
          kind: String(route).startsWith("/reset-password") ? "password_reset" : "auth_callback",
          route,
        }),
        registerVerifiedApplicationAuthInput: () => null,
      },
      "../_lib/logger": { reportRuntimeError: (...args) => runtimeErrors.push(args) },
      "../_lib/supabase": {
        supabase: {
          auth: {
            exchangeCodeForSession: (code) => {
              const gate = deferred();
              const exchange = { code, gate };
              exchanges.push(exchange);
              return gate.promise.then((result = { error: null }) => {
                if (!result.error) {
                  currentSession = {
                    access_token: `access-${code}`,
                    user: { id: `user-${code}` },
                  };
                }
                return result;
              });
            },
            getSession: async () => ({ data: { session: currentSession } }),
            setSession: async ({ access_token: accessToken }) => {
              currentSession = { access_token: accessToken, user: { id: `user-${accessToken}` } };
              return { error: null };
            },
            verifyOtp: async () => ({ error: null }),
          },
        },
      },
      "expo-router": {
        useLocalSearchParams: () => params,
        useRouter: () => router,
      },
      "react-native": { Linking: { getInitialURL: async () => null } },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) },
    },
  });
  const root = createRoot(createContainer());
  await render(root, module.Component, strictMode);
  return {
    clears,
    exchanges,
    module,
    render: async (nextParams = params) => {
      params = nextParams;
      await render(root, module.Component, strictMode);
    },
    root,
    routes,
    runtimeErrors,
    trackedEvents,
  };
};

test("auth callback survives an equivalent params-object rerender without duplicating credential use", async () => {
  const harness = await createAuthHarness();
  assert.equal(harness.exchanges.length, 1);
  await harness.render({ code: "code-a", type: "signup" });
  assert.equal(harness.exchanges.length, 1);
  await React.act(async () => {
    harness.exchanges[0].gate.resolve({ error: null });
    await settle();
  });
  assert.equal(harness.clears.length, 1);
  assert.equal(harness.clears[0].exact, true);
  assert.deepEqual(harness.routes, ["/(auth)/login"]);
  assert.equal(harness.module.read().checking, false);
  assert.equal(harness.module.read().title, "Email verified");
  await unmount(harness.root);
});

test("auth callback serializes a replacement credential and only the current credential navigates", async () => {
  const harness = await createAuthHarness();
  await harness.render({ code: "code-b", type: "signup" });
  assert.equal(harness.exchanges.length, 1);

  await React.act(async () => {
    harness.exchanges[0].gate.resolve({ error: null });
    await settle();
  });
  assert.deepEqual(harness.exchanges.map(({ code }) => code), ["code-a", "code-b"]);
  assert.deepEqual(harness.routes, []);

  await React.act(async () => {
    harness.exchanges[1].gate.resolve({ error: null });
    await settle();
  });
  assert.deepEqual(harness.clears.map(({ accessToken }) => accessToken), ["access-code-a", "access-code-b"]);
  assert.deepEqual(harness.routes, ["/(auth)/login"]);
  assert.equal(harness.module.read().checking, false);
  await unmount(harness.root);
});

test("auth callback consumes one credential under StrictMode and does not navigate after unmount", async () => {
  const strictHarness = await createAuthHarness({ strictMode: true });
  assert.equal(strictHarness.exchanges.length, 1);
  await React.act(async () => {
    strictHarness.exchanges[0].gate.resolve({ error: null });
    await settle();
  });
  assert.equal(strictHarness.clears.length, 1);
  assert.deepEqual(strictHarness.routes, ["/(auth)/login"]);
  await unmount(strictHarness.root);

  const unmountedHarness = await createAuthHarness();
  await unmount(unmountedHarness.root);
  unmountedHarness.exchanges[0].gate.resolve({ error: null });
  await settle();
  assert.equal(unmountedHarness.clears.length, 1);
  assert.deepEqual(unmountedHarness.routes, []);
});

test("auth callback rejects replayed input and keeps recovery routing separate from credential exchange", async () => {
  const replayHarness = await createAuthHarness({ consumeAuthInput: () => false });
  assert.equal(replayHarness.exchanges.length, 0);
  assert.equal(replayHarness.module.read().checking, false);
  assert.equal(replayHarness.module.read().title, "Verification link problem");
  await unmount(replayHarness.root);

  const recoveryHarness = await createAuthHarness({
    initialParams: { code: "recovery-code", type: "recovery" },
  });
  assert.equal(recoveryHarness.exchanges.length, 0);
  assert.equal(recoveryHarness.routes.length, 1);
  assert.match(recoveryHarness.routes[0], /^\/reset-password\?/u);
  await unmount(recoveryHarness.root);
});

const accessResult = (creatorId, allowed = false) => ({
  allowed,
  creatorId,
  currentPeriodEnd: null,
  offer: null,
  reason: allowed ? "subscription_active" : "subscription_required",
  requiresPurchase: !allowed,
});

const createSubscriptionHarness = async ({ creatorId = "creator-a", userId = "viewer-1" } = {}) => {
  let params = { creatorId };
  let sessionLoading = false;
  let user = userId ? { id: userId } : null;
  const accessRequests = [];
  const alerts = [];
  const purchases = [];
  const restores = [];
  let purchaseImplementation = async ({ creatorId: purchasedCreatorId }) => ({
    access: accessResult(purchasedCreatorId, true),
    message: "Subscription active",
    ok: true,
  });
  let restoreImplementation = async (restoredCreatorId) => ({
    access: accessResult(restoredCreatorId, true),
    message: "Subscription restored",
    ok: true,
  });
  const module = loadComponent({
    file: "app/channel-subscription/[creatorId].tsx",
    marker: "  return (\n    <View",
    snapshot: "{access,accessIdentityKey,busy,creatorId,creatorName,handleRestore,handleSubscribe,isOwner,loadedAccessIdentityKey,loading,notice}",
    mocks: {
      "../../_lib/channelSubscriptions": {
        formatChannelSubscriptionPrice: () => "$4.99",
        purchaseChannelSubscription: async (input) => {
          purchases.push(input);
          return purchaseImplementation(input);
        },
        resolveChannelSubscriptionAccess: (requestedCreatorId) => {
          const gate = deferred();
          accessRequests.push({ creatorId: requestedCreatorId, gate, viewerUserId: user?.id ?? "" });
          return gate.promise;
        },
        restoreChannelSubscription: async (restoredCreatorId) => {
          restores.push(restoredCreatorId);
          return restoreImplementation(restoredCreatorId);
        },
      },
      "../../_lib/creatorMonetizationRouteTargets": {
        CREATOR_MONEY_ROUTE_TARGETS: { platformSubscription: { ownerTarget: "/channel-settings" } },
      },
      "../../_lib/platformIdentity": {
        resolvePlatformDisplayIdentity: ({ channel }) => ({ displayName: channel.id }),
      },
      "../../_lib/session": { useSession: () => ({ isLoading: sessionLoading, user }) },
      "../../_lib/userData": {
        buildUserChannelProfile: ({ id }) => ({ id }),
        readUserProfileByUserId: async (requestedCreatorId) => ({ name: requestedCreatorId }),
      },
      "expo-router": {
        useLocalSearchParams: () => params,
        useRouter: () => ({ back: noop, push: noop }),
      },
      "react-native": { Alert: { alert: (...args) => alerts.push(args) } },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) },
    },
  });
  const root = createRoot(createContainer());
  await render(root, module.Component);
  return {
    accessRequests,
    alerts,
    module,
    purchases,
    render: async ({ nextCreatorId = params.creatorId, nextSessionLoading = sessionLoading, nextUserId = user?.id ?? "" } = {}) => {
      params = { creatorId: nextCreatorId };
      sessionLoading = nextSessionLoading;
      user = nextUserId ? { id: nextUserId } : null;
      await render(root, module.Component);
    },
    restores,
    root,
    setPurchaseImplementation: (implementation) => { purchaseImplementation = implementation; },
    setRestoreImplementation: (implementation) => { restoreImplementation = implementation; },
  };
};

test("subscription screen rejects an old creator reply and reloads on viewer replacement", async () => {
  const harness = await createSubscriptionHarness();
  assert.deepEqual(harness.accessRequests.map(({ creatorId }) => creatorId), ["creator-a"]);
  await harness.render({ nextCreatorId: "creator-b" });
  assert.deepEqual(harness.accessRequests.map(({ creatorId }) => creatorId), ["creator-a", "creator-b"]);

  await React.act(async () => {
    harness.accessRequests[1].gate.resolve(accessResult("creator-b"));
    await settle();
  });
  assert.equal(harness.module.read().access.creatorId, "creator-b");
  assert.equal(harness.module.read().creatorName, "creator-b");

  await React.act(async () => {
    harness.accessRequests[0].gate.resolve(accessResult("creator-a", true));
    await settle();
  });
  assert.equal(harness.module.read().access.creatorId, "creator-b");
  assert.equal(harness.module.read().creatorName, "creator-b");

  await harness.render({ nextCreatorId: "creator-b", nextUserId: "viewer-2" });
  assert.equal(harness.accessRequests.length, 3);
  assert.equal(harness.accessRequests[2].viewerUserId, "viewer-2");
  assert.equal(harness.module.read().access, null);
  assert.equal(harness.module.read().loading, true);
  await React.act(async () => {
    harness.accessRequests[2].gate.resolve(accessResult("creator-b", true));
    await settle();
  });
  assert.equal(harness.module.read().access.allowed, true);
  assert.equal(harness.module.read().loading, false);
  await unmount(harness.root);
});

test("subscription screen contains rejected and post-unmount reads", async () => {
  const rejectedHarness = await createSubscriptionHarness();
  await React.act(async () => {
    rejectedHarness.accessRequests[0].gate.reject(new Error("read unavailable"));
    await settle();
  });
  assert.equal(rejectedHarness.module.read().access, null);
  assert.equal(rejectedHarness.module.read().creatorName, "creator-a");
  assert.equal(rejectedHarness.module.read().loading, false);
  await unmount(rejectedHarness.root);

  const unmountedHarness = await createSubscriptionHarness();
  await unmount(unmountedHarness.root);
  unmountedHarness.accessRequests[0].gate.resolve(accessResult("creator-a", true));
  await settle();
  assert.equal(unmountedHarness.module.read().access, null);
  assert.equal(unmountedHarness.module.read().loading, true);
});

test("subscription purchase and restore results stay attached to the current creator and viewer", async () => {
  const harness = await createSubscriptionHarness();
  await React.act(async () => {
    harness.accessRequests[0].gate.resolve(accessResult("creator-a"));
    await settle();
  });

  await React.act(async () => {
    await harness.module.read().handleSubscribe();
    await settle();
  });
  assert.equal(harness.purchases.length, 1);
  assert.equal(harness.module.read().access.allowed, true);
  assert.equal(harness.module.read().notice, "Subscription active");

  await React.act(async () => {
    await harness.module.read().handleRestore();
    await settle();
  });
  assert.deepEqual(harness.restores, ["creator-a"]);
  assert.equal(harness.module.read().notice, "Subscription restored");

  const purchaseGate = deferred();
  harness.setPurchaseImplementation(() => purchaseGate.promise);
  let purchaseOperation;
  await React.act(async () => {
    purchaseOperation = harness.module.read().handleSubscribe();
    await settle();
  });
  await harness.render({ nextCreatorId: "creator-b", nextUserId: "viewer-2" });
  await React.act(async () => {
    harness.accessRequests.at(-1).gate.resolve(accessResult("creator-b"));
    purchaseGate.resolve({ access: accessResult("creator-a", true), message: "Old purchase", ok: true });
    await purchaseOperation;
    await settle();
  });
  assert.equal(harness.module.read().access.creatorId, "creator-b");
  assert.notEqual(harness.module.read().notice, "Old purchase");
  await unmount(harness.root);
});

test("subscription owner preview never initiates a self-purchase", async () => {
  const harness = await createSubscriptionHarness({ userId: "creator-a" });
  await React.act(async () => {
    harness.accessRequests[0].gate.resolve(accessResult("creator-a"));
    await settle();
    await harness.module.read().handleSubscribe();
  });
  assert.equal(harness.module.read().isOwner, true);
  assert.equal(harness.purchases.length, 0);
  assert.equal(harness.alerts[0][0], "Owner preview");
  await unmount(harness.root);
});
