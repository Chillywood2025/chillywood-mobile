import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { readFileSync } from "node:fs";
import path from "node:path";

const traverse = traverseModule.default ?? traverseModule;

const root = process.cwd();

const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Refresh/video cost policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing.`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not be present.`);
};

const parseTsx = (source) => parse(source, {
  sourceType: "unambiguous",
  plugins: ["typescript", "jsx", "decorators-legacy", "classProperties", "classPrivateProperties", "classPrivateMethods", "importAttributes"],
});

const unwrapExpression = (nodePath) => {
  let currentPath = nodePath;
  while (
    currentPath?.isTSAsExpression?.()
    || currentPath?.isTSTypeAssertion?.()
    || currentPath?.isTSNonNullExpression?.()
    || currentPath?.isParenthesizedExpression?.()
  ) {
    currentPath = currentPath.get("expression");
  }
  return currentPath;
};

const literalTruthiness = (nodePath) => {
  const expressionPath = unwrapExpression(nodePath);
  if (expressionPath?.isBooleanLiteral()) return expressionPath.node.value;
  if (expressionPath?.isNumericLiteral()) return expressionPath.node.value !== 0;
  if (expressionPath?.isStringLiteral()) return expressionPath.node.value.length > 0;
  if (expressionPath?.isNullLiteral()) return false;
  if (expressionPath?.isUnaryExpression({ operator: "!" })) {
    const argumentTruthiness = literalTruthiness(expressionPath.get("argument"));
    return argumentTruthiness === null ? null : !argumentTruthiness;
  }
  return null;
};

const flattenLogical = (nodePath, operator) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isLogicalExpression({ operator })) return [expressionPath];
  return [
    ...flattenLogical(expressionPath.get("left"), operator),
    ...flattenLogical(expressionPath.get("right"), operator),
  ];
};

const matchExactTerms = (terms, predicates) => {
  if (terms.length !== predicates.length) return false;
  const unmatched = [...terms];
  return predicates.every((predicate) => {
    const index = unmatched.findIndex((term) => predicate(term));
    if (index < 0) return false;
    unmatched.splice(index, 1);
    return true;
  });
};

const isMemberChain = (nodePath, names) => {
  let currentPath = unwrapExpression(nodePath);
  for (let index = names.length - 1; index > 0; index -= 1) {
    if (!currentPath?.isMemberExpression() || currentPath.node.computed
      || !currentPath.get("property").isIdentifier({ name: names[index] })) return false;
    currentPath = unwrapExpression(currentPath.get("object"));
  }
  return currentPath?.isIdentifier({ name: names[0] }) ?? false;
};

const hasNamedImportBinding = (identifierPath, localName, source, importedName = localName) => {
  if (!identifierPath?.isIdentifier({ name: localName })) return false;
  const binding = identifierPath.scope.getBinding(localName);
  if (!binding?.path.isImportSpecifier()
    || !binding.path.get("imported").isIdentifier({ name: importedName })) return false;
  const declarationPath = binding.path.parentPath;
  return declarationPath?.isImportDeclaration()
    && declarationPath.get("source").isStringLiteral({ value: source });
};

const hasNamedJsxImportBinding = (jsxIdentifierPath, localName, importedName, source) => {
  if (!jsxIdentifierPath?.isJSXIdentifier({ name: localName })) return false;
  const binding = jsxIdentifierPath.scope.getBinding(localName);
  if (!binding?.path.isImportSpecifier()
    || !binding.path.get("imported").isIdentifier({ name: importedName })) return false;
  const declarationPath = binding.path.parentPath;
  return declarationPath?.isImportDeclaration()
    && declarationPath.get("source").isStringLiteral({ value: source });
};

const isImportedAppStateMember = (nodePath, propertyName) => {
  const expressionPath = unwrapExpression(nodePath);
  return expressionPath?.isMemberExpression()
    && !expressionPath.node.computed
    && expressionPath.get("property").isIdentifier({ name: propertyName })
    && hasNamedImportBinding(unwrapExpression(expressionPath.get("object")), "AppState", "react-native");
};

const hasAppStateHookBinding = (identifierPath) => {
  const binding = identifierPath?.scope.getBinding("appState");
  if (!binding?.path.isVariableDeclarator()) return false;
  const idPath = binding.path.get("id");
  if (!idPath.isArrayPattern() || !idPath.get("elements")[0]?.isIdentifier({ name: "appState" })) return false;
  const initPath = unwrapExpression(binding.path.get("init"));
  if (!initPath?.isCallExpression()
    || !hasNamedImportBinding(unwrapExpression(initPath.get("callee")), "useState", "react")) return false;
  const argumentPaths = initPath.get("arguments");
  if (argumentPaths.length !== 1) return false;
  const initialStatePath = unwrapExpression(argumentPaths[0]);
  const hasCurrentStateInitializer = isImportedAppStateMember(initialStatePath, "currentState")
    || (initialStatePath?.isArrowFunctionExpression()
    && initialStatePath.node.params.length === 0
    && isImportedAppStateMember(initialStatePath.get("body"), "currentState"));
  if (!hasCurrentStateInitializer) return false;

  const setterPath = idPath.get("elements")[1];
  if (!setterPath?.isIdentifier()) return false;
  const setterName = setterPath.node.name;
  const setterBinding = setterPath.scope.getBinding(setterName);
  if (!setterBinding || setterBinding.kind !== "const") return false;
  let hasChangeSubscription = false;
  binding.scope.path.traverse({
    CallExpression(callPath) {
      const calleePath = unwrapExpression(callPath.get("callee"));
      if (!calleePath?.isMemberExpression() || calleePath.node.computed
        || !calleePath.get("property").isIdentifier({ name: "addEventListener" })
        || !hasNamedImportBinding(unwrapExpression(calleePath.get("object")), "AppState", "react-native")) return;
      const callArguments = callPath.get("arguments");
      if (!unwrapExpression(callArguments[0])?.isStringLiteral({ value: "change" })) return;
      const handlerPath = unwrapExpression(callArguments[1]);
      if (handlerPath?.isIdentifier({ name: setterName })
        && handlerPath.scope.getBinding(setterName) === setterBinding) {
        hasChangeSubscription = true;
        return;
      }
      if (!handlerPath?.isFunction()) return;
      const handlerParameters = handlerPath.get("params");
      if (handlerParameters.length !== 1 || !handlerParameters[0].isIdentifier()) return;
      const nextStatePath = handlerParameters[0];
      const nextStateBinding = nextStatePath.scope.getBinding(nextStatePath.node.name);
      handlerPath.traverse({
        CallExpression(setterCallPath) {
          const setterCalleePath = unwrapExpression(setterCallPath.get("callee"));
          const setterArguments = setterCallPath.get("arguments");
          if (!setterCalleePath?.isIdentifier({ name: setterName })
            || setterCalleePath.scope.getBinding(setterName) !== setterBinding
            || setterArguments.length !== 1) return;
          const stateArgumentPath = unwrapExpression(setterArguments[0]);
          if (!stateArgumentPath?.isIdentifier({ name: nextStatePath.node.name })
            || stateArgumentPath.scope.getBinding(nextStatePath.node.name) !== nextStateBinding) return;
          const expressionStatementPath = setterCallPath.parentPath;
          if (setterCallPath.node === handlerPath.get("body").node
            || (expressionStatementPath?.isExpressionStatement()
              && expressionStatementPath.parentPath?.node === handlerPath.get("body").node)) hasChangeSubscription = true;
        },
      });
    },
  });
  return hasChangeSubscription;
};

const isAppStateActive = (nodePath) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isBinaryExpression({ operator: "===" })) return false;
  const leftPath = unwrapExpression(expressionPath.get("left"));
  const rightPath = unwrapExpression(expressionPath.get("right"));
  const appStatePath = leftPath.isIdentifier({ name: "appState" })
    ? leftPath
    : rightPath.isIdentifier({ name: "appState" })
      ? rightPath
      : null;
  const activePath = appStatePath === leftPath ? rightPath : leftPath;
  return !!appStatePath
    && activePath.isStringLiteral({ value: "active" })
    && hasAppStateHookBinding(appStatePath);
};

const getIdentifierBinding = (identifierPath, name) => (
  identifierPath?.isIdentifier({ name }) ? identifierPath.scope.getBinding(name) : null
);

const getBindingInitializer = (identifierPath, name) => {
  const binding = getIdentifierBinding(identifierPath, name);
  return binding?.path.isVariableDeclarator() ? binding.path.get("init") : null;
};

const hasParameterBinding = (identifierPath, name) => getIdentifierBinding(identifierPath, name)?.kind === "param";

const isParameterMemberChain = (nodePath, names) => {
  if (!isMemberChain(nodePath, names)) return false;
  let rootPath = unwrapExpression(nodePath);
  while (rootPath?.isMemberExpression()) rootPath = unwrapExpression(rootPath.get("object"));
  return hasParameterBinding(rootPath, names[0]);
};

const isRoleGrantPublishIntent = (nodePath) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isLogicalExpression({ operator: "??" })) return false;
  const publishOverridePath = unwrapExpression(expressionPath.get("left"));
  if (!publishOverridePath.isIdentifier({ name: "publishLocalVideo" })
    || !hasParameterBinding(publishOverridePath, "publishLocalVideo")) return false;
  const grantTerms = flattenLogical(expressionPath.get("right"), "&&");
  return matchExactTerms(grantTerms, [
    (term) => {
      const comparisonPath = unwrapExpression(term);
      if (!comparisonPath?.isBinaryExpression({ operator: "!==" })) return false;
      const leftPath = unwrapExpression(comparisonPath.get("left"));
      const rightPath = unwrapExpression(comparisonPath.get("right"));
      return (isParameterMemberChain(leftPath, ["joinContract", "participantRole"]) && rightPath.isStringLiteral({ value: "viewer" }))
        || (isParameterMemberChain(rightPath, ["joinContract", "participantRole"]) && leftPath.isStringLiteral({ value: "viewer" }));
    },
    (term) => isParameterMemberChain(term, ["joinContract", "requestedGrants", "canPublish"]),
  ]);
};

const isOperativeReturnedJsx = (elementPath) => {
  let currentPath = elementPath;
  let hasReturnAncestor = false;
  while (currentPath?.parentPath) {
    const parentPath = currentPath.parentPath;
    if (parentPath.isReturnStatement()) hasReturnAncestor = true;
    if (parentPath.isFunction()) return hasReturnAncestor;
    if (parentPath.isLogicalExpression({ operator: "&&" })
      && currentPath.key === "right"
      && literalTruthiness(parentPath.get("left")) === false) return false;
    if (parentPath.isLogicalExpression({ operator: "||" })
      && currentPath.key === "right"
      && literalTruthiness(parentPath.get("left")) === true) return false;
    if (parentPath.isConditionalExpression()) {
      const testPath = unwrapExpression(parentPath.get("test"));
      const testTruthiness = literalTruthiness(testPath);
      if (currentPath.key === "consequent" && testTruthiness === false) return false;
      if (currentPath.key === "alternate" && testTruthiness === true) return false;
    }
    if (parentPath.isIfStatement()) {
      const testPath = unwrapExpression(parentPath.get("test"));
      const testTruthiness = literalTruthiness(testPath);
      if (currentPath.key === "consequent" && testTruthiness === false) return false;
      if (currentPath.key === "alternate" && testTruthiness === true) return false;
    }
    if (parentPath.isWhileStatement()
      && literalTruthiness(parentPath.get("test")) === false) return false;
    currentPath = parentPath;
  }
  return false;
};

const hasExpectedCaptureAuthority = (effectiveInitPath, roomComponentName) => {
  const effectiveTerms = flattenLogical(effectiveInitPath, "&&");
  if (!matchExactTerms(effectiveTerms, [
    (term) => term?.isIdentifier({ name: "shouldConnectRoom" }),
    (term) => term?.isIdentifier({ name: "publishLocalCamera" }),
  ])) return false;
  const shouldConnectPath = effectiveTerms.find((term) => term.isIdentifier({ name: "shouldConnectRoom" }));
  const publishIntentPath = effectiveTerms.find((term) => term.isIdentifier({ name: "publishLocalCamera" }));
  const shouldConnectInit = getBindingInitializer(shouldConnectPath, "shouldConnectRoom");

  if (roomComponentName === "HybridLiveKitRoom") {
    return isAppStateActive(shouldConnectInit)
      && hasParameterBinding(publishIntentPath, "publishLocalCamera");
  }
  if (roomComponentName !== "LiveKitRoom") return false;

  const connectionTerms = flattenLogical(shouldConnectInit, "&&");
  if (!matchExactTerms(connectionTerms, [
    (term) => term?.isIdentifier({ name: "active" }),
    (term) => term?.isIdentifier({ name: "appIsInteractive" }),
  ])) return false;
  const activePath = connectionTerms.find((term) => term.isIdentifier({ name: "active" }));
  const interactivePath = connectionTerms.find((term) => term.isIdentifier({ name: "appIsInteractive" }));
  const interactiveInit = getBindingInitializer(interactivePath, "appIsInteractive");
  const publishIntentInit = getBindingInitializer(publishIntentPath, "publishLocalCamera");
  return hasParameterBinding(activePath, "active")
    && isAppStateActive(interactiveInit)
    && isRoleGrantPublishIntent(publishIntentInit);
};

const hasEffectiveLiveKitCaptureGate = (source, roomComponentName) => {
  const ast = parseTsx(source);
  let hybridRoomCount = 0;
  let boundVideoPropCount = 0;
  traverse(ast, {
    JSXOpeningElement(elementPath) {
      if (!elementPath.get("name").isJSXIdentifier({ name: roomComponentName })) return;
      hybridRoomCount += 1;
      const liveKitModuleSource = roomComponentName === "LiveKitRoom"
        ? "../../_lib/livekit/react-native-module"
        : "../../../_lib/livekit/react-native-module";
      if (!hasNamedJsxImportBinding(
        elementPath.get("name"),
        roomComponentName,
        "LiveKitRoom",
        liveKitModuleSource,
      )) return;
      if (!isOperativeReturnedJsx(elementPath)) return;
      for (const attributePath of elementPath.get("attributes")) {
        if (!attributePath.isJSXAttribute() || !attributePath.get("name").isJSXIdentifier({ name: "video" })) continue;
        const valuePath = attributePath.get("value");
        if (!valuePath.isJSXExpressionContainer()) continue;
        const expressionPath = valuePath.get("expression");
        if (!expressionPath.isConditionalExpression()
          || !expressionPath.get("test").isIdentifier({ name: "effectivePublishLocalCamera" })
          || !hasNamedImportBinding(
            expressionPath.get("consequent"),
            "LIVE_VIDEO_CAPTURE_OPTIONS",
            roomComponentName === "LiveKitRoom" ? "../../_lib/performancePolicy" : "../../../_lib/performancePolicy",
          )
          || !expressionPath.get("alternate").isBooleanLiteral({ value: false })) continue;
        const effectiveBinding = expressionPath.get("test").scope.getBinding("effectivePublishLocalCamera");
        const effectiveInitPath = effectiveBinding?.path.isVariableDeclarator()
          ? effectiveBinding.path.get("init")
          : null;
        if (effectiveInitPath && hasExpectedCaptureAuthority(effectiveInitPath, roomComponentName)) {
          boundVideoPropCount += 1;
        }
      }
    },
  });
  return hybridRoomCount === 1 && boundVideoPropCount === 1;
};

const assertEffectiveLiveKitCaptureGate = (source, roomComponentName, label) => {
  if (!hasEffectiveLiveKitCaptureGate(source, roomComponentName)) fail(`${label} must bind the operative LiveKit room video prop to the effective foreground publish gate.`);
};

const readNumericConst = (source, name) => {
  const match = source.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([0-9_]+)`));
  if (!match) {
    fail(`${name} constant is missing.`);
    return Number.NaN;
  }
  return Number(String(match[1]).replaceAll("_", ""));
};

const performancePolicy = readSource("_lib/performancePolicy.ts");
const partyRoom = readSource("app/watch-party/[partyId].tsx");
const liveStage = readSource("app/watch-party/live-stage/[partyId].tsx");
const liveKitSurface = readSource("components/watch-party-live/livekit-stage-media-surface.tsx");
const communicationSession = readSource("hooks/use-communication-room-session.ts");
const roomRules = readSource("_lib/roomRules.ts");
const chatThread = readSource("app/chat/[threadId].tsx");
const premiumLiveAccess = readSource("_lib/premiumWatchPartyAccess.ts");
const home = readSource("app/(tabs)/index.tsx");
const channel = readSource("app/channel/[userId].tsx");
const profile = readSource("app/profile/[userId].tsx");
const studio = readSource("app/channel-settings.tsx");

const liveDefaultFps = readNumericConst(performancePolicy, "LIVE_VIDEO_DEFAULT_FPS");
const liveMaxFps = readNumericConst(performancePolicy, "LIVE_VIDEO_MAX_FPS_V1");
const premiumLiveMaxHeight = readNumericConst(performancePolicy, "PREMIUM_LIVE_MAX_HEIGHT_V1");
const roomHeartbeat = readNumericConst(performancePolicy, "ROOM_HEARTBEAT_MS");
const roomActiveWindow = readNumericConst(performancePolicy, "ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS");
const homeSoftRefresh = readNumericConst(performancePolicy, "HOME_SOFT_REFRESH_MS");
const studioRefresh = readNumericConst(performancePolicy, "STUDIO_DASHBOARD_REFRESH_MS");
const analyticsMode = performancePolicy.match(/export\s+const\s+ANALYTICS_REFRESH_MODE\s*=\s*"([^"]+)"/)?.[1] ?? "";
const typingThrottle = readNumericConst(performancePolicy, "TYPING_THROTTLE_MS");
const readReceiptThrottle = readNumericConst(performancePolicy, "READ_RECEIPT_THROTTLE_MS");

if (liveDefaultFps !== 30) fail("LIVE_VIDEO_DEFAULT_FPS must be 30.");
if (liveMaxFps !== 30) fail("LIVE_VIDEO_MAX_FPS_V1 must be 30.");
if (premiumLiveMaxHeight !== 720) fail("PREMIUM_LIVE_MAX_HEIGHT_V1 must be 720.");
if (roomHeartbeat < 15_000) fail("ROOM_HEARTBEAT_MS must not be below 15 seconds.");
if (roomActiveWindow < roomHeartbeat * 3) fail("ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS must tolerate at least three heartbeat windows.");
if (homeSoftRefresh < 120_000) fail("HOME_SOFT_REFRESH_MS must not be below 2 minutes.");
if (studioRefresh < 60_000) fail("STUDIO_DASHBOARD_REFRESH_MS must not be below 60 seconds.");
if (analyticsMode !== "manual_on_open_cache") fail("Analytics refresh must be manual/on-open/cache for V1.");
if (typingThrottle < 1_000) fail("TYPING_THROTTLE_MS must be throttled.");
if (readReceiptThrottle < 5_000) fail("READ_RECEIPT_THROTTLE_MS must be throttled.");

assertIncludes(performancePolicy, "frameRate: LIVE_VIDEO_DEFAULT_FPS", "Live video capture frame-rate policy");
assertIncludes(performancePolicy, "maxFramerate: LIVE_VIDEO_MAX_FPS_V1", "Live video publish encoding frame-rate cap");
assertIncludes(performancePolicy, "height: PREMIUM_LIVE_MAX_HEIGHT_V1", "Premium live height cap");
assertIncludes(performancePolicy, "VOD_FREE_MAX_HEIGHT_V1 = 480", "VOD free quality cap");
assertIncludes(performancePolicy, "VOD_PREMIUM_MAX_HEIGHT_V1 = 1080", "VOD Premium quality cap");

assertNotIncludes(partyRoom, "ROOM_HEARTBEAT_INTERVAL_MILLIS = 10_000", "Watch-Party Live 10s heartbeat");
assertNotIncludes(partyRoom, "}, 5000);", "Watch-Party Live 5s snapshot poll");
assertIncludes(partyRoom, "ROOM_HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS", "Watch-Party Live shared heartbeat");
assertIncludes(partyRoom, "}, ROOM_SNAPSHOT_REFRESH_MS);", "Watch-Party Live shared snapshot refresh");

assertNotIncludes(liveStage, "STAGE_HEARTBEAT_INTERVAL_MILLIS = 10_000", "Live Stage 10s heartbeat");
assertNotIncludes(liveStage, "}, 2_500);", "Live Stage 2.5s fallback comment poll");
assertIncludes(liveStage, "STAGE_HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS", "Live Stage shared heartbeat");
assertIncludes(liveStage, "}, LIVE_COMMENT_FALLBACK_REFRESH_MS);", "Live Stage shared comment fallback refresh");

assertNotIncludes(communicationSession, "HEARTBEAT_INTERVAL_MILLIS = 10_000", "Communication 10s heartbeat");
assertIncludes(communicationSession, "HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS", "Communication shared heartbeat");
assertIncludes(roomRules, "ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS = ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS", "Room membership active window policy");

assertIncludes(liveKitSurface, "createLiveKitV1RoomOptions", "Watch-Party LiveKit v1 room options");
assertEffectiveLiveKitCaptureGate(liveKitSurface, "LiveKitRoom", "Watch-Party LiveKit capture options");
assertIncludes(liveStage, "createLiveKitV1RoomOptions", "Live Stage v1 room options");
assertEffectiveLiveKitCaptureGate(liveStage, "HybridLiveKitRoom", "Live Stage effective capture options");

for (const roomComponentName of ["LiveKitRoom", "HybridLiveKitRoom"]) {
  const authorityFixture = roomComponentName === "LiveKitRoom"
    ? `
      const [appState, setAppState] = useState(() => AppState.currentState);
      useEffect(() => AppState.addEventListener("change", (nextState) => setAppState(nextState)), []);
      const publishLocalCamera = publishLocalVideo
        ?? (joinContract.participantRole !== "viewer" && joinContract.requestedGrants.canPublish);
      const appIsInteractive = appState === "active";
      const shouldConnectRoom = appIsInteractive && active;
    `
    : `
      const [appState, setAppState] = useState(AppState.currentState);
      useEffect(() => AppState.addEventListener("change", setAppState), []);
      const shouldConnectRoom = "active" === appState;
    `;
  const fixtureParameters = roomComponentName === "LiveKitRoom"
    ? "{ active, joinContract, publishLocalVideo }"
    : "{ publishLocalCamera }";
  const fixtureLiveKitSource = roomComponentName === "LiveKitRoom"
    ? "../../_lib/livekit/react-native-module"
    : "../../../_lib/livekit/react-native-module";
  const fixturePerformanceSource = roomComponentName === "LiveKitRoom"
    ? "../../_lib/performancePolicy"
    : "../../../_lib/performancePolicy";
  const fixtureRoomImport = roomComponentName === "LiveKitRoom"
    ? "LiveKitRoom"
    : "LiveKitRoom as HybridLiveKitRoom";
  const validFixture = `
    import { useEffect, useState } from "react";
    import { AppState } from "react-native";
    import { ${fixtureRoomImport} } from "${fixtureLiveKitSource}";
    import { LIVE_VIDEO_CAPTURE_OPTIONS } from "${fixturePerformanceSource}";
    const Example = (${fixtureParameters}) => {
      ${authorityFixture}
      const effectivePublishLocalCamera = publishLocalCamera && shouldConnectRoom;
      return <${roomComponentName}
        video={effectivePublishLocalCamera
          ? LIVE_VIDEO_CAPTURE_OPTIONS
          : false}
      />;
    };
  `;
  if (!hasEffectiveLiveKitCaptureGate(validFixture, roomComponentName)) {
    fail(`${roomComponentName} capture guard rejected an equivalent formatted gate.`);
  }
  const disconnectedProp = validFixture.replace("video={effectivePublishLocalCamera", "video={publishLocalCamera");
  if (hasEffectiveLiveKitCaptureGate(disconnectedProp, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a video prop disconnected from the effective foreground gate.`);
  }
  const unconditionalGate = validFixture.replace(
    "const effectivePublishLocalCamera = publishLocalCamera && shouldConnectRoom;",
    "const effectivePublishLocalCamera = true;",
  );
  if (hasEffectiveLiveKitCaptureGate(unconditionalGate, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted an effective camera binding without lifecycle and publish intent.`);
  }
  const unconditionalConnection = validFixture.replace(
    roomComponentName === "LiveKitRoom"
      ? "const shouldConnectRoom = appIsInteractive && active;"
      : 'const shouldConnectRoom = "active" === appState;',
    "const shouldConnectRoom = true;",
  );
  if (hasEffectiveLiveKitCaptureGate(unconditionalConnection, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a room connection without the foreground lifecycle gate.`);
  }
  const fakeAppState = validFixture.replace(
    roomComponentName === "LiveKitRoom"
      ? "const [appState, setAppState] = useState(() => AppState.currentState);"
      : "const [appState, setAppState] = useState(AppState.currentState);",
    'const [observedAppState, setAppState] = useState(() => AppState.currentState);\n      const appState = "active";',
  );
  if (hasEffectiveLiveKitCaptureGate(fakeAppState, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a same-named constant instead of the AppState hook binding.`);
  }
  const deadReturn = validFixture.replace("return <", "return false && <");
  if (hasEffectiveLiveKitCaptureGate(deadReturn, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a statically unreachable room render.`);
  }
  const deadIfReturn = validFixture.replace("return <", "if (false) return <");
  if (hasEffectiveLiveKitCaptureGate(deadIfReturn, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a room render beneath an unreachable branch.`);
  }
  const numericDeadReturn = validFixture.replace("return <", "return 0 && <");
  if (hasEffectiveLiveKitCaptureGate(numericDeadReturn, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a room render beneath a falsy numeric gate.`);
  }
  const disconnectedAppStateUpdates = validFixture.replace(
    roomComponentName === "LiveKitRoom"
      ? 'useEffect(() => AppState.addEventListener("change", (nextState) => setAppState(nextState)), []);'
      : 'useEffect(() => AppState.addEventListener("change", setAppState), []);',
    "useEffect(() => undefined, []);",
  );
  if (hasEffectiveLiveKitCaptureGate(disconnectedAppStateUpdates, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted AppState initialization without live change updates.`);
  }
  const wrongAppStateUpdate = validFixture.replace(
    roomComponentName === "LiveKitRoom"
      ? "setAppState(nextState)"
      : 'AppState.addEventListener("change", setAppState)',
    roomComponentName === "LiveKitRoom"
      ? 'setAppState("active")'
      : 'AppState.addEventListener("change", () => setAppState("active"))',
  );
  if (hasEffectiveLiveKitCaptureGate(wrongAppStateUpdate, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted AppState updates forced to an active value.`);
  }
  const localRoomDecoy = validFixture.replace(
    `import { ${fixtureRoomImport} } from "${fixtureLiveKitSource}";`,
    `const ${roomComponentName} = () => null;`,
  );
  if (hasEffectiveLiveKitCaptureGate(localRoomDecoy, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a local room-component decoy.`);
  }
  const localCaptureOptionsDecoy = validFixture.replace(
    `import { LIVE_VIDEO_CAPTURE_OPTIONS } from "${fixturePerformanceSource}";`,
    "const LIVE_VIDEO_CAPTURE_OPTIONS = false;",
  );
  if (hasEffectiveLiveKitCaptureGate(localCaptureOptionsDecoy, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted local false capture options.`);
  }
  const truthyOrRoom = validFixture.replace("return <", "return true || <");
  if (hasEffectiveLiveKitCaptureGate(truthyOrRoom, roomComponentName)) {
    fail(`${roomComponentName} capture guard accepted a room hidden behind a truthy fallback.`);
  }
}

assertIncludes(chatThread, "READ_RECEIPT_THROTTLE_MS", "Chat read receipt throttle");
assertIncludes(chatThread, "markThreadReadWithThrottle", "Chat throttled mark-read wrapper");

assertIncludes(premiumLiveAccess, "strictEntitlementRequired: true", "Strict entitlement-backed Premium live gates");
assertIncludes(premiumLiveAccess, "requireLiveFirstPremium", "Live First Premium gate");
assertIncludes(premiumLiveAccess, "requireLiveWatchPartyPremium", "Live Watch-Party Premium gate");
assertIncludes(premiumLiveAccess, "requireWatchPartyLivePremium", "Watch-Party Live Premium gate");

if (/setInterval\s*\(/.test(home)) fail("Home feed must not add auto-polling; use open/focus/manual refresh.");
if (/setInterval\s*\(/.test(channel)) fail("Public Channel must not add auto-polling in this lane.");
if (/setInterval\s*\(/.test(profile)) fail("Profile must not add auto-polling in this lane.");
if (/setInterval\s*\(/.test(studio)) fail("Platform Studio must not add auto-polling in this lane.");

if (process.exitCode) {
  process.exit();
}

console.log("Refresh/video cost policy guard passed.");
