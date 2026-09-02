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

const pathContainsIdentifier = (nodePath, name) => {
  if (nodePath.isIdentifier({ name })) return true;
  let found = false;
  nodePath.traverse({
    Identifier(identifierPath) {
      if (identifierPath.isIdentifier({ name })) found = true;
    },
  });
  return found;
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

const isParticipantMember = (nodePath, propertyName) => {
  const expressionPath = unwrapExpression(nodePath);
  if (!expressionPath?.isMemberExpression()) return false;
  return expressionPath.get("object").isIdentifier({ name: "participant" })
    && !expressionPath.node.computed
    && expressionPath.get("property").isIdentifier({ name: propertyName });
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
      if (!conditionalPath.get("test").isIdentifier({ name: "hasLiveKitVideo" })) return;
      let hasBoundLiveKitTrack = false;
      conditionalPath.get("consequent").traverse({
        JSXOpeningElement(elementPath) {
          if (!elementPath.get("name").isJSXIdentifier({ name: "LiveKitVideoTrack" })) return;
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
      if (!fallbackPath.isConditionalExpression()
        || !pathContainsIdentifier(fallbackPath.get("test"), "showLegacyVideo")
        || !pathContainsIdentifier(fallbackPath.get("test"), "RTCView")) return;
      let hasBoundLegacyRtc = false;
      fallbackPath.get("consequent").traverse({
        JSXOpeningElement(elementPath) {
          if (!elementPath.get("name").isJSXIdentifier({ name: "RTCView" })) return;
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
requireText("communication participant grid", participantGrid, "const hasLiveKitVideo = isVideoCall");
requireText("communication participant grid", participantGrid, "!!participant.liveKitVideoTrackReference");
requireText("communication participant grid", participantGrid, "const hasVideoStream = isVideoCall");
requireText("communication participant grid", participantGrid, "(!!participant.streamURL || hasLiveKitVideo)");
requireText("communication participant grid", participantGrid, "const showLegacyVideo = !!RTCView && !!participant.streamURL && hasVideoStream;");
requireText("communication participant grid", participantGrid, "Video connected");
if (!hasBoundHybridVideoRender(participantGrid)) {
  fail("communication participant grid must bind the LiveKit track and legacy RTC fallback to their operative render conditions");
}

const disconnectedHybridRender = participantGrid.replace("{hasLiveKitVideo ? (", "{false ? (");
if (hasBoundHybridVideoRender(disconnectedHybridRender)) {
  fail("communication participant grid guard accepted a LiveKit render branch disconnected from hasLiveKitVideo");
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
