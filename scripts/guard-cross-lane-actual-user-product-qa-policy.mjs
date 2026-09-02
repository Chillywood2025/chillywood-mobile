#!/usr/bin/env node
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import fs from "node:fs";
import path from "node:path";

const traverse = traverseModule.default ?? traverseModule;

const root = process.cwd();
const failures = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const fail = (message) => failures.push(message);

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) fail(`${label} missing required text: ${needle}`);
};

const forbidMatch = (label, content, pattern, description) => {
  if (pattern.test(content)) fail(`${label} contains forbidden ${description}`);
};

const parseTsx = (source) => parse(source, {
  sourceType: "unambiguous",
  plugins: ["typescript", "jsx", "decorators-legacy", "classProperties", "classPrivateProperties", "classPrivateMethods", "importAttributes"],
});

const findIdentifierPath = (nodePath, name) => {
  if (nodePath.isIdentifier({ name })) return nodePath;
  let match = null;
  nodePath.traverse({
    Identifier(identifierPath) {
      if (!match && identifierPath.isIdentifier({ name })) match = identifierPath;
    },
  });
  return match;
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

const hasParameterBinding = (identifierPath, name) => (
  identifierPath?.isIdentifier({ name }) && identifierPath.scope.getBinding(name)?.kind === "param"
);

const hasNamedImportBinding = (identifierPath, localName, importedName, source) => {
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

const isParticipantMember = (nodePath, propertyName) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isMemberExpression()) return false;
  return hasParameterBinding(expressionPath.get("object"), "participant")
    && !expressionPath.node.computed
    && expressionPath.get("property").isIdentifier({ name: propertyName });
};

const bindingInitializer = (identifierPath, name) => {
  const binding = identifierPath?.scope.getBinding(name);
  return binding?.path.isVariableDeclarator() ? binding.path.get("init") : null;
};

const isRtcViewInitializer = (nodePath) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!(expressionPath?.isOptionalMemberExpression() || expressionPath?.isMemberExpression())
    || expressionPath.node.computed
    || !expressionPath.get("property").isIdentifier({ name: "RTCView" })) return false;
  const callPath = unwrapExpression(expressionPath.get("object"));
  if (!callPath?.isCallExpression() || callPath.get("arguments").length !== 0) return false;
  return hasNamedImportBinding(
    unwrapExpression(callPath.get("callee")),
    "getCommunicationRTCModule",
    "getCommunicationRTCModule",
    "../../_lib/communication",
  );
};

const isDoubleNegated = (nodePath, predicate) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isUnaryExpression({ operator: "!" })) return false;
  const innerPath = unwrapExpression(expressionPath.get("argument"));
  return innerPath?.isUnaryExpression({ operator: "!" })
    && predicate(unwrapExpression(innerPath.get("argument")));
};

const isRemoteCameraGate = (nodePath) => matchExactTerms(flattenLogical(nodePath, "||"), [
  (term) => {
    const expressionPath = unwrapExpression(term);
    return expressionPath?.isUnaryExpression({ operator: "!" })
      && isParticipantMember(expressionPath.get("argument"), "isSelf");
  },
  (term) => term?.isIdentifier({ name: "cameraRequested" }),
]);

const isLocalCameraTypeCheck = (nodePath) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isBinaryExpression({ operator: "===" })) return false;
  const isTypeofLocalCamera = (operandPath) => {
    const unwrappedPath = unwrapExpression(operandPath);
    return unwrappedPath?.isUnaryExpression({ operator: "typeof" })
      && hasParameterBinding(unwrapExpression(unwrappedPath.get("argument")), "localCameraEnabled");
  };
  const leftPath = unwrapExpression(expressionPath.get("left"));
  const rightPath = unwrapExpression(expressionPath.get("right"));
  return (isTypeofLocalCamera(leftPath) && rightPath.isStringLiteral({ value: "boolean" }))
    || (isTypeofLocalCamera(rightPath) && leftPath.isStringLiteral({ value: "boolean" }));
};

const isCameraRequestedInitializer = (nodePath) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isConditionalExpression()
    || !unwrapExpression(expressionPath.get("test")).isIdentifier({ name: "isVideoCall" })
    || !unwrapExpression(expressionPath.get("alternate")).isBooleanLiteral({ value: false })) return false;
  const localChoicePath = unwrapExpression(expressionPath.get("consequent"));
  if (!localChoicePath?.isConditionalExpression()
    || !hasParameterBinding(unwrapExpression(localChoicePath.get("consequent")), "localCameraEnabled")
    || !isParticipantMember(localChoicePath.get("alternate"), "cameraOn")) return false;
  return matchExactTerms(flattenLogical(localChoicePath.get("test"), "&&"), [
    (term) => isParticipantMember(term, "isSelf"),
    (term) => isLocalCameraTypeCheck(term),
  ]);
};

const isVideoCallInitializer = (nodePath) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isBinaryExpression({ operator: "===" })) return false;
  const leftPath = unwrapExpression(expressionPath.get("left"));
  const rightPath = unwrapExpression(expressionPath.get("right"));
  return (hasParameterBinding(leftPath, "callType") && rightPath.isStringLiteral({ value: "video" }))
    || (hasParameterBinding(rightPath, "callType") && leftPath.isStringLiteral({ value: "video" }));
};

const isHasLiveKitVideoInitializer = (nodePath) => matchExactTerms(flattenLogical(nodePath, "&&"), [
  (term) => term?.isIdentifier({ name: "isVideoCall" }),
  (term) => isDoubleNegated(term, (operandPath) => isParticipantMember(operandPath, "liveKitVideoTrackReference")),
  (term) => isRemoteCameraGate(term),
]);

const isHasVideoStreamInitializer = (nodePath) => matchExactTerms(flattenLogical(nodePath, "&&"), [
  (term) => term?.isIdentifier({ name: "isVideoCall" }),
  (term) => matchExactTerms(flattenLogical(term, "||"), [
    (option) => isDoubleNegated(option, (operandPath) => isParticipantMember(operandPath, "streamURL")),
    (option) => option?.isIdentifier({ name: "hasLiveKitVideo" }),
  ]),
  (term) => isRemoteCameraGate(term),
]);

const isShowLegacyVideoInitializer = (nodePath) => matchExactTerms(flattenLogical(nodePath, "&&"), [
  (term) => isDoubleNegated(term, (operandPath) => operandPath?.isIdentifier({ name: "RTCView" })),
  (term) => isDoubleNegated(term, (operandPath) => isParticipantMember(operandPath, "streamURL")),
  (term) => term?.isIdentifier({ name: "hasVideoStream" }),
]);

const isOperativeReturnedExpression = (expressionPath) => {
  let currentPath = expressionPath;
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

const isReachableWithin = (nodePath, boundaryPath) => {
  let currentPath = nodePath;
  while (currentPath?.parentPath) {
    if (currentPath.node === boundaryPath.node) return true;
    const parentPath = currentPath.parentPath;
    if (parentPath.isFunction()) return false;
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

const hasBoundHybridVideoRender = (source) => {
  const ast = parseTsx(source);
  let liveKitTrackElementCount = 0;
  let legacyRtcElementCount = 0;
  let boundRenderCount = 0;
  traverse(ast, {
    JSXOpeningElement(elementPath) {
      if (elementPath.get("name").isJSXIdentifier({ name: "LiveKitVideoTrack" })) liveKitTrackElementCount += 1;
      if (elementPath.get("name").isJSXIdentifier({ name: "RTCView" })) legacyRtcElementCount += 1;
    },
    ConditionalExpression(conditionalPath) {
      const liveKitTestPath = conditionalPath.get("test");
      if (!liveKitTestPath.isIdentifier({ name: "hasLiveKitVideo" })
        || !isOperativeReturnedExpression(conditionalPath)) return;
      const hasLiveKitVideoInit = bindingInitializer(liveKitTestPath, "hasLiveKitVideo");
      if (!hasLiveKitVideoInit || !isHasLiveKitVideoInitializer(hasLiveKitVideoInit)) return;
      const liveKitVideoCallPath = findIdentifierPath(hasLiveKitVideoInit, "isVideoCall");
      const isVideoCallInit = bindingInitializer(liveKitVideoCallPath, "isVideoCall");
      if (!isVideoCallInit || !isVideoCallInitializer(isVideoCallInit)) return;
      const liveKitCameraPath = findIdentifierPath(hasLiveKitVideoInit, "cameraRequested");
      const cameraRequestedInit = bindingInitializer(liveKitCameraPath, "cameraRequested");
      const cameraVideoCallPath = cameraRequestedInit ? findIdentifierPath(cameraRequestedInit, "isVideoCall") : null;
      if (!cameraRequestedInit || !isCameraRequestedInitializer(cameraRequestedInit)
        || bindingInitializer(cameraVideoCallPath, "isVideoCall")?.node !== isVideoCallInit.node) return;
      let hasBoundLiveKitTrack = false;
      conditionalPath.get("consequent").traverse({
        JSXOpeningElement(elementPath) {
          if (!elementPath.get("name").isJSXIdentifier({ name: "LiveKitVideoTrack" })) return;
          if (!isReachableWithin(elementPath, conditionalPath.get("consequent"))) return;
          if (!hasNamedJsxImportBinding(
            elementPath.get("name"),
            "LiveKitVideoTrack",
            "LiveKitVideoTrack",
            "../../_lib/livekit/react-native-module",
          )) return;
          for (const attributePath of elementPath.get("attributes")) {
            if (!attributePath.isJSXAttribute() || !attributePath.get("name").isJSXIdentifier({ name: "trackRef" })) continue;
            const valuePath = attributePath.get("value");
            if (valuePath.isJSXExpressionContainer() && isParticipantMember(valuePath.get("expression"), "liveKitVideoTrackReference")) {
              hasBoundLiveKitTrack = true;
            }
          }
        },
      });

      const fallbackPath = conditionalPath.get("alternate");
      if (!fallbackPath.isConditionalExpression()) return;
      const fallbackTestPath = fallbackPath.get("test");
      const fallbackTerms = flattenLogical(fallbackTestPath, "&&");
      if (!matchExactTerms(fallbackTerms, [
        (term) => term?.isIdentifier({ name: "showLegacyVideo" }),
        (term) => term?.isIdentifier({ name: "RTCView" }),
      ])) return;
      const showLegacyIdentifierPath = fallbackTerms.find((term) => term.isIdentifier({ name: "showLegacyVideo" }));
      const showLegacyInit = bindingInitializer(showLegacyIdentifierPath, "showLegacyVideo");
      const rtcViewIdentifierPath = fallbackTerms.find((term) => term.isIdentifier({ name: "RTCView" }));
      const rtcViewInit = bindingInitializer(rtcViewIdentifierPath, "RTCView");
      const hasVideoStreamIdentifierPath = showLegacyInit
        ? findIdentifierPath(showLegacyInit, "hasVideoStream")
        : null;
      const showLegacyRtcViewPath = showLegacyInit
        ? findIdentifierPath(showLegacyInit, "RTCView")
        : null;
      const hasVideoStreamInit = bindingInitializer(hasVideoStreamIdentifierPath, "hasVideoStream");
      if (!rtcViewInit || !isRtcViewInitializer(rtcViewInit)
        || !showLegacyInit || !isShowLegacyVideoInitializer(showLegacyInit)
        || bindingInitializer(showLegacyRtcViewPath, "RTCView")?.node !== rtcViewInit.node
        || !hasVideoStreamInit || !isHasVideoStreamInitializer(hasVideoStreamInit)) return;
      const streamLiveKitPath = findIdentifierPath(hasVideoStreamInit, "hasLiveKitVideo");
      const streamLiveKitInit = bindingInitializer(streamLiveKitPath, "hasLiveKitVideo");
      const streamCameraPath = findIdentifierPath(hasVideoStreamInit, "cameraRequested");
      const streamCameraInit = bindingInitializer(streamCameraPath, "cameraRequested");
      const streamVideoCallPath = findIdentifierPath(hasVideoStreamInit, "isVideoCall");
      const streamVideoCallInit = bindingInitializer(streamVideoCallPath, "isVideoCall");
      if (streamLiveKitInit?.node !== hasLiveKitVideoInit.node
        || streamCameraInit?.node !== cameraRequestedInit.node
        || streamVideoCallInit?.node !== isVideoCallInit.node) return;
      let hasBoundLegacyRtc = false;
      fallbackPath.get("consequent").traverse({
        JSXOpeningElement(elementPath) {
          if (!elementPath.get("name").isJSXIdentifier({ name: "RTCView" })) return;
          if (!isReachableWithin(elementPath, fallbackPath.get("consequent"))) return;
          if (elementPath.get("name").scope.getBinding("RTCView")?.path.node !== rtcViewIdentifierPath.scope.getBinding("RTCView")?.path.node) return;
          for (const attributePath of elementPath.get("attributes")) {
            if (!attributePath.isJSXAttribute() || !attributePath.get("name").isJSXIdentifier({ name: "streamURL" })) continue;
            const valuePath = attributePath.get("value");
            if (valuePath.isJSXExpressionContainer() && isParticipantMember(valuePath.get("expression"), "streamURL")) {
              hasBoundLegacyRtc = true;
            }
          }
        },
      });
      if (hasBoundLiveKitTrack && hasBoundLegacyRtc) boundRenderCount += 1;
    },
  });
  return liveKitTrackElementCount === 1 && legacyRtcElementCount === 1 && boundRenderCount === 1;
};

const sentences = (content) => content
  .replace(/\r/g, "")
  .split(/(?<=[.!?])\s+|\n+/)
  .map((line) => line.trim())
  .filter(Boolean);

const hasNegation = (sentence) => /\b(no|not|never|without|against|cannot|can't|must not|is not|are not|was not|were not|did not|do not|does not|pending|Partial|Blocked|owner-confirmation-required|unless)\b/i.test(sentence);

const forbidSentence = (label, content, predicate, description) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${description}: "${sentence.slice(0, 220)}"`);
  }
};

const doc = read("docs/release/CROSS_LANE_ACTUAL_USER_PRODUCT_QA_SWEEP.md");
const participantGrid = read("components/communication/communication-participant-grid.tsx");
const inRoomPanel = read("components/communication/in-room-communication-panel.tsx");
const roomHeader = read("components/communication/communication-room-header.tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Artifacts Reviewed",
  "User-Facing Issues Found",
  "Admin Moderator Owner Facing Issues Found",
  "Remaining Launch Blockers",
  "Actual-user installed-app proof result: Partial.",
  "No auth/RLS/Premium/chat/account-status/staff permission weakening happened.",
  "No provider/live-money mutation happened.",
  "liveMoneyEnabled remains OFF.",
].forEach((needle) => requireText("cross-lane QA doc", doc, needle));

forbidSentence("cross-lane QA doc", doc, (sentence) => (
  /diagnostic|backend|pre-created|controlled|marker|seeded-only|service-role|service role/i.test(sentence)
  && /actual-user Closed|actual user Closed|actual-user installed-app Closed|actual user installed app Closed/i.test(sentence)
  && !hasNegation(sentence)
), "diagnostic/backend/controlled evidence counted as actual-user Closed");

forbidSentence("cross-lane QA doc", doc, (sentence) => (
  /Actual-user Chat Call|manual Chat Call|Chat Call normal|manual call/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "known Partial Chat Call path called Closed");

forbidSentence("cross-lane QA doc", doc, (sentence) => (
  /Actual-user Live|Live waiting-room|Live seat/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "known Partial Live path called Closed");

forbidSentence("cross-lane QA doc", doc, (sentence) => (
  /provider mutation|Google Play product|base-plan|RevenueCat|Stripe|provider dashboard/i.test(sentence)
  && /happened|mutated|changed|applied|executed/i.test(sentence)
  && !hasNegation(sentence)
), "provider mutation claim");

forbidSentence("cross-lane QA doc", doc, (sentence) => (
  /auth|RLS|Premium|chat permission|account-status|staff permission/i.test(sentence)
  && /weakened|bypassed|disabled|turned off/i.test(sentence)
  && !hasNegation(sentence)
), "auth/RLS/Premium/chat/account-status/staff weakening");

forbidSentence("cross-lane QA doc", doc, (sentence) => (
  /Current First Owner/i.test(sentence)
  && /touched|modified|changed/i.test(sentence)
  && !hasNegation(sentence)
), "current First Owner touch");

forbidMatch("cross-lane QA doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbidMatch("cross-lane QA doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbidMatch("cross-lane QA doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbidMatch("cross-lane QA doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbidMatch("cross-lane QA doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP value");

forbidMatch("communication participant grid", participantGrid, /const\s+showVideo\s*=\s*!!RTCView\s*&&\s*!!participant\.streamURL\s*&&\s*participant\.cameraOn/, "RTC video render gated by stale cameraOn");
forbidMatch("communication participant grid", participantGrid, /remoteRenderableCount:[^\n]+participant\.cameraOn/, "remote renderability debug gated by stale cameraOn");
requireText("communication participant grid", participantGrid, "Video connected");
if (!hasBoundHybridVideoRender(participantGrid)) {
  fail("communication participant grid must bind the LiveKit track and legacy RTC fallback to their operative render conditions");
}

const validHybridRenderFixture = `
  import { getCommunicationRTCModule } from "../../_lib/communication";
  import { LiveKitVideoTrack } from "../../_lib/livekit/react-native-module";
  const Grid = ({ callType, localCameraEnabled, participants }) => {
    const RTCView = getCommunicationRTCModule()?.RTCView;
    const isVideoCall = callType === "video";
    return participants.map((participant) => {
    const cameraRequested = isVideoCall
      ? participant.isSelf && typeof localCameraEnabled === "boolean"
        ? localCameraEnabled
        : participant.cameraOn
      : false;
    const hasLiveKitVideo = isVideoCall
      && !!participant.liveKitVideoTrackReference
      && (!participant.isSelf || cameraRequested);
    const hasVideoStream = isVideoCall
      && (!!participant.streamURL || hasLiveKitVideo)
      && (!participant.isSelf || cameraRequested);
    const showLegacyVideo = !!RTCView && !!participant.streamURL && hasVideoStream;
    return hasLiveKitVideo ? (
      <LiveKitVideoTrack trackRef={participant.liveKitVideoTrackReference as unknown} />
    ) : showLegacyVideo && RTCView ? (
      <RTCView streamURL={participant.streamURL as string} />
    ) : null;
    });
  };
`;
if (!hasBoundHybridVideoRender(validHybridRenderFixture)) {
  fail("communication participant grid guard rejected an equivalent formatted hybrid render chain");
}
const disconnectedHybridRender = validHybridRenderFixture.replace("return hasLiveKitVideo ? (", "return false ? (");
if (hasBoundHybridVideoRender(disconnectedHybridRender)) {
  fail("communication participant grid guard accepted a LiveKit render branch disconnected from hasLiveKitVideo");
}
const disconnectedLegacyFallback = validHybridRenderFixture.replace(
  ") : showLegacyVideo && RTCView ? (",
  ") : false && showLegacyVideo && RTCView ? (",
);
if (hasBoundHybridVideoRender(disconnectedLegacyFallback)) {
  fail("communication participant grid guard accepted a disabled legacy RTC fallback");
}
const disabledLiveKitBinding = validHybridRenderFixture.replace(
  "const hasLiveKitVideo = isVideoCall",
  "const hasLiveKitVideo = false && isVideoCall",
);
if (hasBoundHybridVideoRender(disabledLiveKitBinding)) {
  fail("communication participant grid guard accepted an always-false LiveKit render binding");
}
const disabledLegacyBinding = validHybridRenderFixture.replace(
  "const showLegacyVideo = !!RTCView",
  "const showLegacyVideo = false && !!RTCView",
);
if (hasBoundHybridVideoRender(disabledLegacyBinding)) {
  fail("communication participant grid guard accepted an always-false legacy render binding");
}
const negatedLegacyCapability = validHybridRenderFixture.replace(
  ") : showLegacyVideo && RTCView ? (",
  ") : showLegacyVideo && !RTCView ? (",
);
if (hasBoundHybridVideoRender(negatedLegacyCapability)) {
  fail("communication participant grid guard accepted a negated legacy RTC capability gate");
}
const disconnectedCameraIntent = validHybridRenderFixture.replace(
  "const cameraRequested = isVideoCall",
  "const cameraRequested = true",
);
if (hasBoundHybridVideoRender(disconnectedCameraIntent)) {
  fail("communication participant grid guard accepted camera rendering disconnected from call intent");
}
const disconnectedVideoCall = validHybridRenderFixture.replace(
  'const isVideoCall = callType === "video";',
  "const isVideoCall = false;",
);
if (hasBoundHybridVideoRender(disconnectedVideoCall)) {
  fail("communication participant grid guard accepted video rendering disconnected from the requested call type");
}
const deadHybridReturn = validHybridRenderFixture.replace("return hasLiveKitVideo ? (", "return false && (hasLiveKitVideo ? (").replace(
  ") : null;\n    });",
  ") : null);\n    });",
);
if (hasBoundHybridVideoRender(deadHybridReturn)) {
  fail("communication participant grid guard accepted a statically unreachable hybrid render chain");
}
const deadIfHybridReturn = validHybridRenderFixture.replace("return hasLiveKitVideo ? (", "if (false) return hasLiveKitVideo ? (");
if (hasBoundHybridVideoRender(deadIfHybridReturn)) {
  fail("communication participant grid guard accepted a hybrid render beneath an unreachable branch");
}
const numericDeadHybridReturn = validHybridRenderFixture.replace("return hasLiveKitVideo ? (", "return 0 && (hasLiveKitVideo ? (").replace(
  ") : null;\n    });",
  ") : null);\n    });",
);
if (hasBoundHybridVideoRender(numericDeadHybridReturn)) {
  fail("communication participant grid guard accepted a hybrid render beneath a falsy numeric gate");
}
const deadLiveKitChild = validHybridRenderFixture.replace(
  "<LiveKitVideoTrack trackRef={participant.liveKitVideoTrackReference as unknown} />",
  "false && <LiveKitVideoTrack trackRef={participant.liveKitVideoTrackReference as unknown} />",
);
if (hasBoundHybridVideoRender(deadLiveKitChild)) {
  fail("communication participant grid guard accepted a statically unreachable LiveKit track child");
}
const deadLegacyChild = validHybridRenderFixture.replace(
  "<RTCView streamURL={participant.streamURL as string} />",
  "false && <RTCView streamURL={participant.streamURL as string} />",
);
if (hasBoundHybridVideoRender(deadLegacyChild)) {
  fail("communication participant grid guard accepted a statically unreachable legacy RTC child");
}
const truthyOrLiveKitChild = validHybridRenderFixture.replace(
  "<LiveKitVideoTrack trackRef={participant.liveKitVideoTrackReference as unknown} />",
  "true || <LiveKitVideoTrack trackRef={participant.liveKitVideoTrackReference as unknown} />",
);
if (hasBoundHybridVideoRender(truthyOrLiveKitChild)) {
  fail("communication participant grid guard accepted a LiveKit track hidden behind a truthy fallback");
}
const localLiveKitComponent = validHybridRenderFixture.replace(
  'import { LiveKitVideoTrack } from "../../_lib/livekit/react-native-module";',
  "const LiveKitVideoTrack = () => null;",
);
if (hasBoundHybridVideoRender(localLiveKitComponent)) {
  fail("communication participant grid guard accepted a local LiveKit component decoy");
}
const localRtcComponent = validHybridRenderFixture.replace(
  "const RTCView = getCommunicationRTCModule()?.RTCView;",
  "const RTCView = () => null;",
);
if (hasBoundHybridVideoRender(localRtcComponent)) {
  fail("communication participant grid guard accepted a local RTC component decoy");
}
const truthyOrHybridReturn = validHybridRenderFixture.replace("return hasLiveKitVideo ? (", "return true || (hasLiveKitVideo ? (").replace(
  ") : null;\n    });",
  ") : null);\n    });",
);
if (hasBoundHybridVideoRender(truthyOrHybridReturn)) {
  fail("communication participant grid guard accepted a hybrid render hidden behind a truthy fallback");
}

forbidMatch("live stage screen", liveStage, /showHeroRemoteVideo[^\n]+cameraOn/, "hero remote Live video gated by stale cameraOn");
forbidMatch("live stage screen", liveStage, /showRemoteLiveVideo[^\n]+cameraOn/, "remote Live video gated by stale cameraOn");
requireText("live stage screen", liveStage, "const showHeroRemoteVideo = !heroParticipantIsCurrentUser && !!RTCView && !!heroMediaParticipant?.streamURL;");
requireText("live stage screen", liveStage, "const showRemoteLiveVideo = !isCurrentUser && !!RTCView && !!mediaParticipant?.streamURL;");

forbidMatch("in-room communication panel", inRoomPanel, /\{participantCount\} connected/, "false all-connected count copy");
forbidMatch("communication room header", roomHeader, /\{participantCount\} connected/, "false all-connected room copy");
requireText("in-room communication panel", inRoomPanel, "{participantCount} in call");
requireText("communication room header", roomHeader, "{participantCount} in room");

forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/i, "liveMoneyEnabled ON");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/i, "payouts enabled");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/i, "cashout enabled");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/i, "Stripe Connect production enabled");
forbidMatch("runtime feature flags", featureFlags, /payableBalancesEnabled:\s*true/i, "payable balances enabled");
forbidMatch("runtime feature flags", featureFlags, /providerRefundsEnabled:\s*true/i, "provider refunds executable");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/i, "live_money_enabled ON");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/i, "payouts ON");
forbidMatch("money feature defaults", moneyFlags, /cashout_enabled:\s*["']on["']/i, "cashout ON");
forbidMatch("money feature defaults", moneyFlags, /stripe_connect_production_enabled:\s*["']on["']/i, "Stripe Connect production ON");
forbidMatch("money feature defaults", moneyFlags, /provider_refunds_enabled:\s*["']on["']/i, "provider refunds executable");
forbidMatch("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/i, "payable balances ON");

if (failures.length) {
  console.error("Cross-lane actual-user product QA policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Cross-lane actual-user product QA policy guard passed.");
console.log("- docs cannot call diagnostic/backend/controlled evidence actual-user Closed.");
console.log("- RTC remote video render/copy fixes and money-off/provider-safe posture remain guarded.");
