#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const appPath = "app/channel-settings.tsx";
const guardPath = "scripts/guard-money-center-policy.mjs";
const proofPath = "scripts/proof-creator-monetization-route-button-wiring.mjs";

const replaceOnce = (source, from, to, label) => {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label}: source marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: source marker is not unique`);
  return source.slice(0, first) + to + source.slice(first + from.length);
};

const removeBetween = (source, startMarker, endMarker, label) => {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker not found`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${label}: end marker not found`);
  return source.slice(0, start) + source.slice(end);
};

let app = readFileSync(appPath, "utf8");

app = removeBetween(
  app,
  "    const moneyCenterFocusTabs: readonly { id: MoneyCenterFocusSection; label: string }[] = [",
  "    const openWaysToEarn = () => {",
  "remove duplicate Money Center focus-tab renderer",
);

app = removeBetween(
  app,
  "    const renderActiveMoneyCenterFocusContent = () => {",
  "    if (moneyCenterFeatureFlag.state === \"off\"",
  "remove duplicate focused-content renderer",
);

app = replaceOnce(
  app,
  "          {renderMoneyCenterFocusTabs()}\n          {renderActiveMoneyCenterFocusContent()}",
  "          {renderMoneyCenterOverviewContent()}",
  "render one canonical Money Center overview surface",
);

app = removeBetween(
  app,
  "          {renderMonetizationAccordion({\n            id: \"overview\",\n",
  "          {renderMonetizationAccordion({\n            id: \"offers\",\n",
  "remove duplicate Overview accordion",
);

app = replaceOnce(
  app,
  `    const renderWaysToEarnContent = (\n      testID = \"money-center-ways-to-earn-focused-panel\",\n      testIdSuffix = \"\",\n      includeManagerPanel = true,\n    ) => (`,
  `    const renderWaysToEarnContent = (\n      testID = \"money-center-ways-to-earn-panel\",\n    ) => (`,
  "make Ways to Earn a single canonical surface",
);

app = replaceOnce(
  app,
  `        <View style={styles.sandboxSafetyBanner}>\n          <Text style={styles.sandboxSafetyTitle}>Creator setup mode</Text>\n          <Text style={styles.sandboxSafetyBody}>\n            Creator monetization setup is usable in sandbox/not-payable mode. Production sales require owner/provider activation.\n          </Text>\n        </View>\n`,
  "",
  "remove repeated setup-mode banner from Ways to Earn",
);

app = replaceOnce(
  app,
  "            <React.Fragment key={`money-feature-with-manager-${feature.key}${testIdSuffix}`}",
  "            <React.Fragment key={`money-feature-with-manager-${feature.key}`}",
  "remove duplicate-surface test id suffix from Ways to Earn key",
);
app = replaceOnce(
  app,
  "              {renderFeatureCard(feature, testIdSuffix)}",
  "              {renderFeatureCard(feature)}",
  "render one feature card instance",
);
app = replaceOnce(
  app,
  "              {includeManagerPanel && activeMoneyManageTarget === feature.key ? (",
  "              {activeMoneyManageTarget === feature.key ? (",
  "always render manager on canonical Ways to Earn surface",
);

const waysStart = app.indexOf("    const renderWaysToEarnContent = (");
const waysEnd = app.indexOf("    const renderMoneyTransactionsContent", waysStart);
if (waysStart < 0 || waysEnd < 0) throw new Error("Ways to Earn function region not found");
let ways = app.slice(waysStart, waysEnd);
const setupButton = ways.indexOf('testID="money-center-creator-setup-button"');
if (setupButton < 0) throw new Error("creator setup duplicate button not found");
const actionRowStart = ways.lastIndexOf("        <View style={styles.eventActionRow}>", setupButton);
if (actionRowStart < 0) throw new Error("creator setup duplicate action row start not found");
const noticeLine = "        {sandboxSetupNotice ? <Text style={styles.noticeText}>{sandboxSetupNotice}</Text> : null}\n";
const noticeIndex = ways.indexOf(noticeLine, setupButton);
if (noticeIndex < 0) throw new Error("creator setup duplicate notice line not found");
ways = ways.slice(0, actionRowStart) + ways.slice(noticeIndex + noticeLine.length);
app = app.slice(0, waysStart) + ways + app.slice(waysEnd);

app = replaceOnce(
  app,
  '            { label: "Available balance", value: "Not payable" },\n            { label: "Ways to Earn", value: `${monetizationFeatureCards.filter((card) => card.status === "Setup mode" || card.status === "Active").length} setup` },\n            { label: "Live Money", value: "Off" },\n            { label: "Payouts", value: "Off" },',
  '            { label: "Available balance", value: "Not payable" },\n            { label: "Ways to Earn", value: `${monetizationFeatureCards.filter((card) => card.status === "Setup mode" || card.status === "Active").length} setup` },\n            { label: "Transactions", value: creatorMoneyAuditEvents.length ? `${creatorMoneyAuditEvents.length} recorded` : "None yet" },\n            { label: "Payout readiness", value: canReviewCashoutReadiness ? "Review" : payoutsStatus },',
  "replace stale Off boxes with useful Money Center summary",
);

app = replaceOnce(
  app,
  '      focusMoneyCenterSection("ways_to_earn");\n      router.setParams({',
  '      focusMoneyCenterSection("ways_to_earn");\n      setExpandedMonetizationSections((current) => new Set([...current, "ways_to_earn"]));\n      router.setParams({',
  "ensure Open Ways to Earn opens canonical accordion",
);

app = replaceOnce(
  app,
  '            children: renderWaysToEarnContent("money-center-ways-to-earn-accordion-panel", "-accordion", false),',
  '            children: renderWaysToEarnContent("money-center-ways-to-earn-panel"),',
  "use canonical Ways to Earn panel in accordion",
);

app = replaceOnce(
  app,
  "            <Text style={styles.panelSubtitle}>Creator dashboard for setup mode, cashout readiness, offers, transactions, and payouts.</Text>",
  "            <Text style={styles.panelSubtitle}>Creator earnings, offers, transactions, payout readiness, and setup.</Text>",
  "tighten Money Center hero copy",
);
app = replaceOnce(
  app,
  "            Setup mode: sandbox/test, not payable yet, no real payouts, no cashout, no withdrawals.",
  "            Sandbox/test mode. No real charges, payouts, cashout, or withdrawals.",
  "deduplicate Money Center setup-mode copy",
);

if (app.includes("{renderMoneyCenterFocusTabs()}")) throw new Error("duplicate focus tabs still rendered");
if (app.includes("{renderActiveMoneyCenterFocusContent()}")) throw new Error("duplicate focused content still rendered");
if (app.includes('id: "overview",\n            title: "Overview"')) throw new Error("duplicate Overview accordion still present");
if (app.includes('testID="money-center-creator-setup-button"')) throw new Error("duplicate creator setup CTA still present in Ways to Earn");
if (!app.includes('testID="money-sandbox-setup-button"')) throw new Error("advanced sandbox setup CTA must remain available");
if (!app.includes('testID="money-payout-review-readiness-button"')) throw new Error("canonical payout readiness CTA must remain available");
if (!app.includes('children: renderWaysToEarnContent("money-center-ways-to-earn-panel")')) throw new Error("canonical Ways to Earn accordion missing");

writeFileSync(appPath, app);

let guard = readFileSync(guardPath, "utf8");
const guardBlockStart = 'assertIncludes(channelSettings, "activeMoneyCenterFocusSection", "Money Center deterministic focus state");';
const guardBlockEnd = 'assertIncludes(channelSettings, "moneyFeatureManagerInline", "Money Center inline manager occupies full feature grid width");';
const guardStart = guard.indexOf(guardBlockStart);
const guardEnd = guard.indexOf(guardBlockEnd, guardStart);
if (guardStart < 0 || guardEnd < 0) throw new Error("Money Center guard duplicate-surface block not found");
const guardReplacement = [
  'assertIncludes(channelSettings, "activeMoneyCenterFocusSection", "Money Center route/deep-link focus state");',
  'assertIncludes(channelSettings, "focusMoneyCenterSection", "Money Center route/deep-link focus handler");',
  'assertIncludes(channelSettings, "{renderMoneyCenterOverviewContent()}", "Money Center renders one canonical overview surface");',
  'assertNotIncludes(channelSettings, "{renderMoneyCenterFocusTabs()}", "Money Center must not render duplicate focus tabs");',
  'assertNotIncludes(channelSettings, "{renderActiveMoneyCenterFocusContent()}", "Money Center must not render duplicate focused content above accordions");',
  'assertNotIncludes(channelSettings, "money-center-focus-tabs", "Money Center duplicate focus-tab surface removed");',
  'assertNotIncludes(channelSettings, "money-center-ways-to-earn-focused-panel", "Money Center duplicate focused Ways to Earn panel removed");',
  'assertIncludes(channelSettings, \'renderWaysToEarnContent("money-center-ways-to-earn-panel")\', "Money Center has one canonical Ways to Earn panel");',
  'assertNotIncludes(channelSettings, \'id: "overview",\\n            title: "Overview"\', "Money Center duplicate Overview accordion removed");',
  'assertNotIncludes(channelSettings, "money-center-creator-setup-button", "Creator setup CTA belongs only in advanced Sandbox QA");',
  'assertIncludes(channelSettings, "money-sandbox-setup-button", "Advanced Sandbox QA retains creator setup action");',
  'assertIncludes(channelSettings, "money-payout-review-readiness-button", "Cashout readiness keeps one canonical action");',
  'assertIncludes(channelSettings, "activeMoneyManageTarget === feature.key ?", "Money Center manager renders inline after selected feature card");',
  guardBlockEnd,
].join("\n");
guard = guard.slice(0, guardStart) + guardReplacement + guard.slice(guardEnd + guardBlockEnd.length);

guard = guard.replace(
  'assertIncludes(channelSettings, "money-center-creator-setup-button", "Money Center creator setup action");\nassertIncludes(channelSettings, "money-center-cashout-readiness-button", "Money Center cashout readiness action");',
  'assertNotIncludes(channelSettings, "money-center-creator-setup-button", "Money Center duplicate creator setup action removed");\nassertNotIncludes(channelSettings, "money-center-cashout-readiness-button", "Money Center duplicate cashout action removed");\nassertIncludes(channelSettings, "money-sandbox-setup-button", "Sandbox QA owns creator setup action");\nassertIncludes(channelSettings, "money-payout-review-readiness-button", "Payout readiness owns cashout review action");',
);
guard = guard.replace(
  'assertIncludes(channelSettings, \'renderWaysToEarnContent("money-center-ways-to-earn-accordion-panel", "-accordion", false)\', "Money Center secondary Ways to Earn copy uses suffixed test ids and suppresses duplicate manager");\n',
  '',
);
writeFileSync(guardPath, guard);

let proof = readFileSync(proofPath, "utf8");
const proofOld = `  ["Money Center deterministic focus state", "activeMoneyCenterFocusSection"],\n  ["Money Center deterministic focus handler", "focusMoneyCenterSection"],\n  ["Money Center focused content renderer", "renderActiveMoneyCenterFocusContent"],\n  ["Money Center focus tabs", "money-center-focus-tabs"],\n  ["Money Center focused Ways to Earn panel", "money-center-ways-to-earn-focused-panel"],\n  ["Money Center accordion Ways to Earn uses suffixed testIDs", 'renderWaysToEarnContent("money-center-ways-to-earn-accordion-panel", "-accordion", false)'],\n  ["Money Center manager renders inline after selected feature card", "activeMoneyManageTarget === feature.key ?"],\n  ["Money Center inline manager occupies full feature grid width", "moneyFeatureManagerInline"],\n  ["Money Center duplicate accordion manager is suppressed", "includeManagerPanel = true"],`;
const proofNew = `  ["Money Center route/deep-link focus state", "activeMoneyCenterFocusSection"],\n  ["Money Center route/deep-link focus handler", "focusMoneyCenterSection"],\n  ["Money Center canonical overview renderer", "{renderMoneyCenterOverviewContent()}"],\n  ["Money Center canonical Ways to Earn panel", 'renderWaysToEarnContent("money-center-ways-to-earn-panel")'],\n  ["Money Center manager renders inline after selected feature card", "activeMoneyManageTarget === feature.key ?"],\n  ["Money Center inline manager occupies full feature grid width", "moneyFeatureManagerInline"],`;
proof = replaceOnce(proof, proofOld, proofNew, "update monetization route proof for canonical Money Center surface");

const proofNegativeAnchor = `  ["Money Center no timed manager focus retries", "focusActiveMoneyManagerPanel"],\n];`;
const proofNegativeReplacement = `  ["Money Center no timed manager focus retries", "focusActiveMoneyManagerPanel"],\n  ["Money Center no duplicate rendered focus tabs", "{renderMoneyCenterFocusTabs()}"],\n  ["Money Center no duplicate rendered focused content", "{renderActiveMoneyCenterFocusContent()}"],\n  ["Money Center no duplicate focus-tab surface", "money-center-focus-tabs"],\n  ["Money Center no duplicate focused Ways to Earn panel", "money-center-ways-to-earn-focused-panel"],\n  ["Money Center no duplicate Overview accordion", 'id: "overview",\\n            title: "Overview"'],\n  ["Money Center no duplicate creator setup CTA", "money-center-creator-setup-button"],\n  ["Money Center no duplicate cashout readiness CTA", "money-center-cashout-readiness-button"],\n];`;
proof = replaceOnce(proof, proofNegativeAnchor, proofNegativeReplacement, "add duplicate-surface negative proofs");
writeFileSync(proofPath, proof);

console.log("Money Center UI closure transformation applied.");
