import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync("_lib/userFacingProductCopy.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
}).outputText;
const copyModule = { exports: {} };
new Function("exports", "module", javascript)(copyModule.exports, copyModule);
const { formatContentTypeLabel, normalizeAdminCanaryDisplayCopy, normalizePlatformSubscriptionNotificationCopy, normalizeProductNotificationCopy } = copyModule.exports;

test("legacy Platform Subscription notification rows use current product terminology", () => {
  assert.equal(
    normalizePlatformSubscriptionNotificationCopy("Channel Subscription started.", "channel_subscription_started"),
    "Platform Subscription started.",
  );
  assert.equal(
    normalizePlatformSubscriptionNotificationCopy(
      "Sandbox proof record: a viewer started a channel subscription.",
      "channel_subscription_started",
    ),
    "A viewer started a Platform Subscription.",
  );
});

test("unrelated notification copy is not rewritten", () => {
  assert.equal(
    normalizePlatformSubscriptionNotificationCopy("Channel Subscription started.", "system_notice"),
    "Channel Subscription started.",
  );
  assert.equal(normalizePlatformSubscriptionNotificationCopy("", "channel_subscription_started"), "");
});

test("known legacy subscription phrases support their existing case variants", () => {
  for (const phrase of ["Channel subscription", "CHANNEL SUBSCRIPTION", "cHaNnEl SuBsCrIpTiOn"]) {
    assert.equal(normalizeProductNotificationCopy(`${phrase} started.`, "channel_subscription_started"),
      "Platform Subscription started.");
    assert.equal(normalizeProductNotificationCopy(`${phrase}s updated.`, "channel_subscriptions_updated"),
      `${phrase}s updated.`, "a different internal notification family is not rewritten");
  }
  assert.equal(normalizeProductNotificationCopy("Channel subscriptions updated.", "channel_subscription_updated"),
    "Platform Subscriptions updated.");
});

test("legacy Follow copy changes only the exact product-owned event and generated sentence", () => {
  const legacy = "Someone followed your channel.";
  assert.equal(normalizeProductNotificationCopy(legacy, "social_follow"), "Someone followed your Platform.");
  for (const type of ["system_notice", "chat_message", "social_follow_request", "SOCIAL_FOLLOW", " social_follow ", null]) {
    assert.equal(normalizeProductNotificationCopy(legacy, type), legacy);
  }
  for (const text of ["My channel is live.", `Quote: ${legacy}`, `${legacy} Read more.`, "Someone followed your Platform."]) {
    assert.equal(normalizeProductNotificationCopy(text, "social_follow"), text);
  }
  assert.equal(normalizeProductNotificationCopy(` ${legacy} `, "social_follow"), legacy,
    "preexisting whitespace cleanup does not broaden the exact generated-copy match");
});

test("content display labels map only the exact canonical channel token", () => {
  assert.equal(formatContentTypeLabel("channel"), "Platform");
  assert.equal(formatContentTypeLabel("creator_video"), "creator video");
  assert.equal(formatContentTypeLabel("profile_post_comment"), "profile post comment");
  assert.equal(formatContentTypeLabel("other"), "other");
  assert.equal(formatContentTypeLabel("channel_update"), "channel update");
  assert.equal(formatContentTypeLabel("My channel"), "My channel");
  assert.equal(formatContentTypeLabel(null), "");
  assert.equal(formatContentTypeLabel(undefined), "");
});

test("known DMCA canary copy changes only in derived display fields", () => {
  const reason = "Missing backend piece: safe DMCA disable/restore route for channel-level takedowns; preserve evidence and use support/legal handling.";
  const actual = `channel: disable/hide/restore disabled. ${reason}`;
  const raw = Object.freeze({
    key: "dmca_content_mutation_channel",
    label: "DMCA content mutation: channel",
    actual,
    message: actual,
    status: "pass",
    testedSurface: "Admin disabled reason / preserve-only case record",
    details: Object.freeze({ content_type: "channel", mutation: "disabled", state_lookup: null, reason }),
    metadata: Object.freeze({ content_type: "channel", user_prose: "My channel" }),
  });
  const shown = normalizeAdminCanaryDisplayCopy(raw);
  assert.equal(shown.label, "DMCA content mutation: Platform");
  assert.equal(shown.actual, `Platform: disable/hide/restore disabled. ${reason.replace("channel-level", "Platform-level")}`);
  assert.equal(shown.message, shown.actual);
  assert.equal(shown.details.reason, reason.replace("channel-level", "Platform-level"));
  assert.equal(shown.details.content_type, "channel", "raw canonical metadata remains technical");
  assert.equal(shown.key, raw.key);
  assert.equal(shown.status, raw.status);
  assert.equal(shown.testedSurface, raw.testedSurface);
  assert.equal(shown.metadata, raw.metadata);
  assert.equal(raw.actual, actual);
  assert.equal(raw.details.reason, reason);
  assert.equal(normalizeAdminCanaryDisplayCopy({ ...raw, key: "unknown_canary" }).actual, actual);
  const modified = { ...raw, label: `${raw.label} custom`, actual: `Quote: ${actual}`,
    message: "My channel", details: { ...raw.details, reason: `${reason} custom` } };
  assert.deepEqual(normalizeAdminCanaryDisplayCopy(modified), modified);
  const differentType = { ...raw, details: { ...raw.details, content_type: "creator_video" } };
  assert.equal(normalizeAdminCanaryDisplayCopy(differentType).details, differentType.details);
});

test("public and legal canary display copy retains keys, RPC identifiers and custom text", () => {
  const raw = Object.freeze({
    key: "public_channel_sanitized_rpc", label: "Public profile/channel sanitized RPCs working",
    expected: "Public sanitized profile/channel RPC responds for a non-owner candidate.",
    message: "Public sanitized RPC responded without exposing owner data.",
    testedSurface: "rpc: read_public_channel_profile(profile_user_id=non-owner)", status: "pass",
  });
  const shown = normalizeAdminCanaryDisplayCopy(raw);
  assert.equal(shown.label, "Public profile/Platform sanitized RPCs working");
  assert.equal(shown.expected, "Public sanitized profile/Platform RPC responds for a non-owner candidate.");
  assert.equal(shown.testedSurface, raw.testedSurface);
  assert.equal(shown.key, raw.key);
  assert.equal(shown.message, raw.message);
  assert.equal(normalizeAdminCanaryDisplayCopy({ ...raw, label: "My channel" }).label, "My channel");
  assert.equal(normalizeAdminCanaryDisplayCopy({ ...raw, key: "other" }).label, raw.label);
  const actual = "Legal Evidence preview matrix passed for user/account, profile/channel, creator video, profile post, comments/replies, attachment, chat thread, room/live metadata, reports, DMCA case, and date range.";
  const legal = Object.freeze({ key: "legal_evidence_target_matrix", label: "Legal Evidence target matrix covered",
    actual, message: actual, status: "pass", details: Object.freeze({ channel: 200 }) });
  const legalShown = normalizeAdminCanaryDisplayCopy(legal);
  assert.equal(legalShown.actual, actual.replace("profile/channel", "profile/Platform"));
  assert.equal(legalShown.message, legalShown.actual);
  assert.equal(legalShown.details, legal.details);
  assert.equal(legal.actual, actual);
  assert.equal(normalizeAdminCanaryDisplayCopy({ ...legal, actual: "Legal Evidence matrix had failures: channel=403." }).actual,
    "Legal Evidence matrix had failures: channel=403.");
  assert.equal(normalizeAdminCanaryDisplayCopy({ ...legal, key: "other" }).actual, actual);
});

test("iOS subscription metadata uses Platform Subscription terminology and current scope", () => {
  const catalog = JSON.parse(fs.readFileSync("config/ios/app-store-products.json", "utf8"));
  const storeKit = fs.readFileSync("config/ios/Chillywood.storekit", "utf8");
  const products = catalog.catalog.filter((item) => item.concept === "channel_subscription");

  assert.equal(products.length, 8);
  for (const product of products) {
    assert.match(product.displayName, /^Platform Subscription/u);
    assert.match(product.referenceName, /Platform Subscription/u);
    assert.match(product.description, /ordinary Paid Videos included while active/u);
    assert.match(product.description, /VIP and Premium not included/u);
  }
  assert.doesNotMatch(storeKit, /Channel Subscription/u);
  assert.match(storeKit, /Platform Subscription/u);
});
