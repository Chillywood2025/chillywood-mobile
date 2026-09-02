#!/usr/bin/env node

import { parse } from "@babel/parser";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Critical UX polish policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const getMemberRootIdentifier = (node) => {
  let current = node;
  while (current?.type === "MemberExpression" || current?.type === "OptionalMemberExpression") {
    current = current.object;
  }
  return current?.type === "Identifier" ? current.name : "";
};

const isErrorMessageMember = (node) => {
  if (node?.type !== "MemberExpression" && node?.type !== "OptionalMemberExpression") return false;
  const propertyName = node.computed
    ? (node.property?.type === "StringLiteral" ? node.property.value : "")
    : (node.property?.type === "Identifier" ? node.property.name : "");
  return propertyName === "message" && /error/i.test(getMemberRootIdentifier(node));
};

const containsErrorMessageMember = (node, seen = new WeakSet()) => {
  if (!node || typeof node !== "object" || seen.has(node)) return false;
  seen.add(node);
  if (isErrorMessageMember(node)) return true;
  return Object.values(node).some((child) => (
    Array.isArray(child)
      ? child.some((item) => containsErrorMessageMember(item, seen))
      : containsErrorMessageMember(child, seen)
  ));
};

const isCustomerPresentationCall = (node) => {
  const callee = node?.callee;
  if (callee?.type === "Identifier") {
    return /^set.*(?:Error|Notice|Feedback|Status|Message)$/i.test(callee.name);
  }
  return callee?.type === "MemberExpression"
    && callee.object?.type === "Identifier"
    && callee.object.name === "Alert"
    && callee.property?.type === "Identifier"
    && callee.property.name === "alert";
};

const assertNoRawErrorPresentation = (source, file) => {
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const seen = new WeakSet();
  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (
      node.type === "CallExpression"
      && isCustomerPresentationCall(node)
      && node.arguments.some((argument) => containsErrorMessageMember(argument))
    ) {
      fail(`${file} must not send raw error.message values to a customer presentation sink`);
    }
    if (node.type === "JSXExpressionContainer" && containsErrorMessageMember(node.expression)) {
      fail(`${file} must not render raw error.message values in JSX`);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(ast);
};

const loadUserFacingErrorModule = async (source, label) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: `_lib/userFacingErrors-${label}.ts`,
  }).outputText;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(dataUrl);
};

const getUserFacingBehaviorFailures = async (source, label) => {
  try {
    const module = await loadUserFacingErrorModule(source, label);
    const { getUserFacingErrorMessage, UserFacingError } = module;
    const fallback = "Action-specific safe fallback.";
    const cases = [
      [new Error("duplicate key value violates unique constraint private_table_key"), fallback],
      [new Error("authoritative transition failed"), fallback],
      [new Error("Cannot convert undefined or null to object"), fallback],
      [new Error("unrecognized provider detail"), fallback],
      [new Error("Invalid login credentials"), "The email or password is incorrect."],
      [new Error("Email not confirmed"), "Confirm your email, then try signing in again."],
      [new Error("Too many requests"), "Too many attempts. Wait a moment, then try again."],
      [new Error("Network request failed"), "Check your connection and try again."],
      [new Error("JWT expired"), "Sign in again, then try that action one more time."],
      [new Error("authorization denied"), "This account does not have permission to complete that action."],
      [
        new UserFacingError("attachment_action", "Photo gallery needs the current app build."),
        "Photo gallery needs the current app build.",
      ],
      [
        new UserFacingError("circle_action", "You cannot request yourself."),
        "You cannot request yourself.",
      ],
    ];
    return cases.flatMap(([error, expected], index) => {
      const actual = getUserFacingErrorMessage(error, fallback);
      return actual === expected ? [] : [`case ${index + 1}: expected ${expected}, received ${actual}`];
    });
  } catch (error) {
    return [`module evaluation failed: ${error instanceof Error ? error.message : String(error)}`];
  }
};

const filesToScanForEntities = [
  "app/(auth)/login.tsx",
  "app/(auth)/signup.tsx",
  "app/(tabs)/index.tsx",
  "app/admin.tsx",
  "app/channel/[userId].tsx",
  "app/channel-settings.tsx",
  "app/chat/[threadId].tsx",
  "app/chat/index.tsx",
  "app/chilly-circle.tsx",
  "app/copyright-report.tsx",
  "app/player/[id].tsx",
  "app/profile/[userId].tsx",
  "app/settings.tsx",
  "app/subscribe.tsx",
  "app/title/[id].tsx",
  "app/watch-party/live-stage/[partyId].tsx",
  "app/watch-party/[partyId].tsx",
  "components/ads/NativeAdSlot.tsx",
  "components/communication/in-room-communication-panel.tsx",
  "components/communication/communication-preview-card.tsx",
  "components/legal/legal-policy-viewer.tsx",
  "components/live/live-effects-sheet.tsx",
  "components/system/root-error-boundary.tsx",
  "components/system/runtime-unavailable-screen.tsx",
  "components/system/support-screen.tsx",
];

for (const file of filesToScanForEntities) {
  const source = read(file);
  assertNotIncludes(source, "&#39;", file);
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
  const seen = new WeakSet();
  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (node.type === "StringLiteral" && node.value.includes("&apos;")) {
      fail(`${file} must not preserve &apos; inside a JavaScript string expression`);
    }
    if (node.type === "TemplateElement" && (node.value.cooked ?? node.value.raw).includes("&apos;")) {
      fail(`${file} must not preserve &apos; inside a JavaScript template expression`);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(ast);
}

const userFacingErrors = read("_lib/userFacingErrors.ts");
assertIncludes(userFacingErrors, "getUserFacingErrorMessage", "shared user-facing error helper");
assertIncludes(userFacingErrors, "class UserFacingError", "trusted domain error type");
assertIncludes(userFacingErrors, "This account does not have permission", "permission-safe error copy");
assertIncludes(userFacingErrors, "Sign in again", "auth-safe error copy");
assertIncludes(userFacingErrors, "Check your connection", "network-safe error copy");
assertIncludes(userFacingErrors, "The email or password is incorrect.", "credential-safe error copy");
assertIncludes(userFacingErrors, "Confirm your email", "email-confirmation-safe error copy");
assertIncludes(userFacingErrors, "Too many attempts.", "rate-limit-safe error copy");
assertIncludes(userFacingErrors, "Unknown messages must fail closed", "unknown-error fail-closed policy");
for (const behaviorFailure of await getUserFacingBehaviorFailures(userFacingErrors, "current")) {
  fail(`shared user-facing error behavior ${behaviorFailure}`);
}

const userFacingErrorMutations = [
  [
    "unknown errors pass through",
    (source) => source.replace(/return fallback;\n}\s*$/, "return rawMessage;\n}"),
  ],
  [
    "broad auth substring classification",
    (source) => source.replace(
      '|| message.includes("authentication")',
      '|| message.includes("authentication")\n    || message.includes("auth")',
    ),
  ],
  [
    "broad object substring classification",
    (source) => source.replace(
      '|| message.includes("object storage")',
      '|| message.includes("object storage")\n    || message.includes("object")',
    ),
  ],
];

for (const [label, mutate] of userFacingErrorMutations) {
  const mutated = mutate(userFacingErrors);
  if (mutated === userFacingErrors) {
    fail(`user-facing error mutation fixture did not apply: ${label}`);
    continue;
  }
  const mutationFailures = await getUserFacingBehaviorFailures(mutated, `mutation-${label.replace(/\W+/g, "-")}`);
  if (mutationFailures.length === 0) {
    fail(`user-facing error behavior guard accepted mutation: ${label}`);
  }
}

const login = read("app/(auth)/login.tsx");
const chatInbox = read("app/chat/index.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const chatInviteSheet = read("components/chat/internal-invite-sheet.tsx");
const chillyCircle = read("app/chilly-circle.tsx");

for (const [label, source] of [
  ["Login", login],
  ["Chi'lly Chat Inbox", chatInbox],
  ["Chi'lly Chat Thread", chatThread],
  ["Chi'lly Chat Invite", chatInviteSheet],
  ["Chi'lly Circle", chillyCircle],
]) {
  assertIncludes(source, "getUserFacingErrorMessage", `${label} sanitized error boundary`);
  assertNoRawErrorPresentation(source, label);
}

const chatDomain = read("_lib/chat.ts");
const friendGraph = read("_lib/friendGraph.ts");
const socialAttachments = read("_lib/socialAttachments.ts");
const socialAttachmentPicker = read("_lib/socialAttachmentPicker.ts");

for (const [label, source, code] of [
  ["Chi'lly Chat domain", chatDomain, "chat_action"],
  ["Chi'lly Circle domain", friendGraph, "circle_action"],
  ["Social attachments domain", socialAttachments, "attachment_action"],
  ["Social attachment picker", socialAttachmentPicker, "attachment_action"],
]) {
  assertIncludes(source, "UserFacingError", `${label} trusted domain error type`);
  assertIncludes(source, `\"${code}\"`, `${label} trusted domain error code`);
}

assertNotIncludes(chatDomain, 'new UserFacingError("chat_action", error.message', "Chi'lly Chat raw provider error trust");
assertNotIncludes(chatDomain, 'new UserFacingError("chat_action", created.error.message', "Chi'lly Chat raw call provider error trust");
assertNotIncludes(chatInbox, "InboxErrorState", "Chi'lly Chat Inbox error state must stay presentation-safe");

for (const [label, source, unsafeExpression] of [
  ["Login", login, "Alert.alert(\"Login Error\", error.message)"],
  ["Chi'lly Chat Inbox", chatInbox, "message: loadError?.message ??"],
  ["Chi'lly Chat Thread load", chatThread, "setError(loadError?.message ??"],
  ["Chi'lly Chat Thread attachment", chatThread, "setError(error instanceof Error ? error.message"],
  ["Chi'lly Chat Thread resume", chatThread, "setError(resumeError instanceof Error ? resumeError.message"],
  ["Chi'lly Chat Thread accept", chatThread, "setError(acceptError instanceof Error ? acceptError.message"],
  ["Chi'lly Chat Thread decline", chatThread, "setError(declineError instanceof Error ? declineError.message"],
  ["Chi'lly Chat Invite search", chatInviteSheet, "setError(searchError?.message ??"],
  ["Chi'lly Chat Invite send", chatInviteSheet, "setError(inviteError?.message ??"],
  ["Chi'lly Circle", chillyCircle, "const message = error instanceof Error ? error.message"],
]) {
  assertNotIncludes(source, unsafeExpression, `${label} raw error presentation`);
}

const rootBoundary = read("components/system/root-error-boundary.tsx");
const rootLayout = read("app/_layout.tsx");
assertIncludes(rootBoundary, "errorName: error.name || \"Error\"", "root boundary analytics");
assertNotIncludes(rootBoundary, "defaultSummary={`Runtime issue: ${error.message}`}", "root boundary feedback summary");
assertNotIncludes(rootBoundary, "message: error.message", "root boundary analytics");
assertIncludes(rootLayout, "SENSITIVE_ROUTE_PARAM_NAMES.has(normalizedKey)", "auth redirect sensitive param filter");
assertIncludes(rootLayout, "normalizedKey.includes(\"token\")", "auth redirect token param filter");

const settings = read("app/settings.tsx");
const profile = read("app/profile/[userId].tsx");
const support = read("components/system/support-screen.tsx");
const copyrightReport = read("app/copyright-report.tsx");
const platformStudio = read("app/channel-settings.tsx");
const player = read("app/player/[id].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const liveEffectsSheet = read("components/live/live-effects-sheet.tsx");
const nativeAdSlot = read("components/ads/NativeAdSlot.tsx");
const communicationPreviewCard = read("components/communication/communication-preview-card.tsx");
const monetization = read("_lib/monetization.ts");
const premiumWatchPartyAccess = read("_lib/premiumWatchPartyAccess.ts");
const spectatorAccess = read("_lib/spectatorAccess.ts");
const mediaStorage = read("_lib/mediaStorage.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const liveKitTokenContract = read("_lib/livekit/token-contract.ts");
const legalPolicies = read("legal/policies.mjs");
const legalSiteBuild = read("public-site/legal-site/build.mjs");
const usernameHelper = read("_lib/usernameHandles.ts");

for (const [label, source] of [
  ["Settings", settings],
  ["Profile", profile],
  ["Support", support],
  ["Copyright report", copyrightReport],
  ["Platform Studio", platformStudio],
]) {
  assertIncludes(source, "getUserFacingErrorMessage", `${label} sanitized error usage`);
}

assertNotIncludes(settings, "Alert.alert(\"Log Out\", error.message)", "Settings logout raw error alert");
assertNotIncludes(settings, "setPasswordNotice(error.message)", "Settings password raw error notice");
assertNotIncludes(support, "error instanceof Error ? error.message : \"Try again in a moment.\"", "Support raw feedback error");
assertNotIncludes(copyrightReport, "error instanceof Error ? error.message : \"Unable to submit this copyright report right now.\"", "Copyright raw submit error");
assertIncludes(usernameHelper, "getUsernameErrorMessage", "username safe error mapper");
assertIncludes(usernameHelper, "Couldn't update username. Try again.", "username safe fallback copy");
assertNotIncludes(usernameHelper, "RLS", "username helper raw RLS copy");
assertNotIncludes(usernameHelper, "unique constraint", "username helper raw unique constraint copy");
assertNotIncludes(usernameHelper, "duplicate key value", "username helper raw duplicate key copy");

const normalUserCopyChecks = [
  ["Live effects sheet", liveEffectsSheet, [
    "CHI’LLYFECTS FOUNDATION",
    "does not process the outgoing camera track",
    "Real processing is still a later lane",
  ]],
  ["Live Stage", liveStage, [
    "LiveKit server unavailable",
    "LiveKit join unavailable",
    "No healthy LiveKit server heartbeat",
    "does not process the outgoing LiveKit camera track",
    "selectable as a foundation only",
  ]],
  ["Native ad slot", nativeAdSlot, [
    "Ad placeholder",
    "Native/feed placement foundation",
    "No real ad is loaded",
  ]],
  ["Chi'lly Chat call preview", communicationPreviewCard, [
    "development build",
    "debug build",
  ]],
  ["Player", player, [
    "provider proof",
    "This upload could not be loaded from storage",
    "does not process the outgoing LiveKit camera track",
  ]],
  ["Platform Studio creator copy", platformStudio, [
    "creator storage",
    "Percent progress is not backed",
    "backed metadata",
    "landed audience schema",
    "schema truth",
    "provider proof",
    "No money rows returned",
    "No digital sales rows yet",
    "No tips rows yet",
    "No Watch-Party seat rows yet",
    "No paid content rows yet",
    "No merch rows yet",
    "No payout rows yet",
    "No verified ledger rows yet",
    "ledger rows",
    "raw payloads",
    "not provider-backed",
    "not wired",
  ]],
  ["Premium copy", monetization, [
    "Premium proof is being rechecked",
    "RevenueCat proof is rechecked",
    "trusted entitlement truth",
  ]],
  ["Premium live copy", premiumWatchPartyAccess, [
    "temporarily open for proof",
  ]],
  ["Spectator copy", spectatorAccess, [
    "broadcast proof exists",
  ]],
  ["Media upload copy", mediaStorage, [
    "Media storage",
    "incomplete upload contract",
  ]],
  ["Creator video copy", creatorVideos, [
    "Creator storage",
    "Storage global and bucket limits",
    "Creator media storage",
  ]],
  ["LiveKit token copy", liveKitTokenContract, [
    "backend token endpoint",
    "token issuance failed",
    "LiveKit token requests require",
  ]],
];

for (const [label, source, forbiddenPhrases] of normalUserCopyChecks) {
  for (const phrase of forbiddenPhrases) {
    assertNotIncludes(source, phrase, `${label} normal-user technical copy`);
  }
}

for (const phrase of [
  "approved backend deletion",
  "magic instant wipe",
  "service-role credentials",
  "Profile, Channel",
  "channel display",
  "Channel setup",
  "public channel",
  "token request metadata",
  "Supabase",
]) {
  assertNotIncludes(legalPolicies, phrase, "Public legal policy normal-user technical copy");
}
assertIncludes(
  legalPolicies,
  "approved deletion or de-identification process",
  "Account deletion production copy",
);
assertIncludes(legalSiteBuild, "[\"channel\", \"Platform\"]", "Public DMCA Platform option label");
assertNotIncludes(
  legalSiteBuild,
  "Public DMCA form disabled: Supabase public URL or public anon key is not configured for this static build.",
  "Public DMCA unavailable copy",
);
assertNotIncludes(
  legalSiteBuild,
  "Attachment upload token was not returned for this case.",
  "Public DMCA attachment copy",
);

if (process.exitCode) process.exit(process.exitCode);

console.log("Critical UX polish policy guard passed.");
