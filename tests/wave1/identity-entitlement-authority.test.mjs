import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(path, "utf8");
const load = (path) => { const module = { exports: {} }; const js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true } }).outputText; new Function("exports", "module", "require", js)(module.exports, module, require); return module.exports; };
const links = load("_lib/appLinks.ts");
const ent = load("_lib/entitlementAuthority.ts");
const creator = load("_lib/creatorEligibility.ts");
const task = JSON.parse(read("docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json"));
const source = Object.fromEntries(Object.entries({ legal: "_lib/accountLegalAcceptance.ts", session: "_lib/session.tsx", notifications: "_lib/notifications.ts", premium: "_lib/premiumEntitlements.ts", monetization: "_lib/monetization.ts", creatorSetup: "_lib/creatorMonetizationSetup.ts", layout: "app/_layout.tsx", migration: "supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql", webhook: "supabase/functions/revenuecat-webhook/index.ts" }).map(([key, path]) => [key, read(path)]));

assert.equal(task.stableDefectLedger.entries.flatMap((entry) => entry.manifestations).length, 31);
assert.deepEqual([task.rootDefects.length, task.stateTransitionModel.machines.length, task.stateTransitionModel.states.length, task.stateTransitionModel.transitions.length, task.invariants.length], [6, 6, 32, 48, 34]);
assert.deepEqual([task.taskLocalEdgeEvidence.dispositions.length, task.taskLocalEdgeEvidence.modelDeltas.length, task.taskLocalGoverningEdgeClosure.findings.length], [23, 8, 0]);

const binding = { userId: "11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111", sessionGeneration: "22222222-2222-4222-8222-222222222222", restoreOnly: false };
const entitlement = (state = "ACTIVE", extra = {}) => ent.normalizeEntitlementAuthorityReadback({ entitlementKey: "premium", expectedBinding: binding, readback: { ...binding, entitlementKey: "premium", state, source: "revenuecat", expiresAt: null, revokedAt: null, authoritativeAt: "2026-08-14T12:00:00Z", ...extra } });
const creatorReadback = (extra = {}) => creator.parseCreatorEligibilityReadback({ authoritative: true, state: "VERIFIED", accountStatus: "ACTIVE", age18Plus: true, legalAccepted: true, creatorRole: true, moderationState: "CLEAR", market: "UNITED_STATES", rolloutEligible: true, platformCapability: true, providerEligible: true, kycComplete: true, taxComplete: true, sanctionsClear: true, payoutEligible: true, ...extra });
const envelope = () => links.createAuthRedirectEnvelope("/settings?section=notifications", { id: "redirect-1", now: 100, ttlMs: 100 });
const pairs = [
  [() => links.resolveApplicationRoute("/profile/profile-proof") === "/profile/profile-proof", () => links.resolveApplicationRoute("https://evil.example/profile/profile-proof") === null],
  [() => links.resolveApplicationRoute("/terms") === "/terms", () => links.resolveApplicationRoute("/not-registered") === null],
  [() => links.resolveApplicationRoute("/settings?section=notifications") === "/settings?section=notifications", () => links.resolveApplicationRoute("/settings?premium=true") === null],
  [() => links.resolveApplicationRoute("/profile/%252e%252e") === null, () => links.resolveApplicationRoute("//evil.example/settings") === null],
  [() => links.consumeAuthRedirectEnvelope(envelope(), binding, new Set(), 150).route === "/settings?section=notifications", () => { const bound = links.validateAuthRedirectEnvelope(envelope(), binding, 150); return links.consumeAuthRedirectEnvelope(bound, { ...binding, sessionGeneration: "stale" }, new Set(), 150).route === null; }],
  [() => source.legal.includes('"wave1_legal_requirements_readback"'), () => !source.legal.includes(".from(USER_ACCOUNT_LEGAL_ACCEPTANCES_TABLE)")],
  [() => ["user_id", "document_version", "market", "role_key", "capability", "accepted_at", "authority_source"].every((field) => source.migration.includes(`"${field}"`)), () => source.migration.includes('acceptance."role_key" = v_role')],
  [() => source.legal.includes('"wave1_accept_legal_documents"'), () => source.migration.includes("revoke insert, update, delete on table public.\"user_account_legal_acceptances\"")],
  [() => source.migration.includes("legal_version_mismatch"), () => source.legal.includes("bundled.version !== requirement.version")],
  [() => ["terms", "privacy", "community_guidelines", "creator_terms", "money_terms"].every((key) => source.migration.includes(`'${key}'`)), () => source.migration.includes("wave1_legal_document_one_active_version")],
  [() => source.migration.includes("retention_expires_at") && source.migration.includes("interval '7 years'"), () => source.migration.includes("wave1_purge_expired_authority_evidence")],
  [() => ent.ENTITLEMENT_AUTHORITY_STATES.includes("UNKNOWN") && ent.ENTITLEMENT_AUTHORITY_STATES.includes("INACTIVE"), () => ent.createUnknownEntitlementDecision("premium").state !== ent.createInactiveEntitlementDecision({ entitlementKey: "premium", binding, authoritativeAt: "2026-08-14T12:00:00Z" }).state],
  [() => entitlement("ACTIVE").state === "ACTIVE", () => ent.normalizeEntitlementAuthorityReadback({ entitlementKey: "premium", expectedBinding: binding, readback: {} }).state === "UNKNOWN"],
  [() => ent.entitlementGrantsProtectedAccess(entitlement("GRACE")), () => !ent.entitlementGrantsProtectedAccess(ent.createUnknownEntitlementDecision("premium"))],
  [() => ent.createUnknownEntitlementDecision("premium", "query_failed").authoritative === false, () => !source.premium.includes(".upsert(")],
  [() => entitlement("ACTIVE").sessionGeneration === binding.sessionGeneration, () => entitlement("ACTIVE", { accountId: "replacement" }).state === "UNKNOWN"],
  [() => ent.rejectStaleEntitlementDecision(entitlement("ACTIVE"), binding).state === "ACTIVE", () => ent.rejectStaleEntitlementDecision(entitlement("ACTIVE"), { ...binding, sessionGeneration: "replacement" }).state === "UNKNOWN"],
  [() => source.webhook.includes("duplicateEvent") && source.webhook.includes("staleEvent"), () => source.webhook.includes("entitlementUnchanged")],
  [() => ent.entitlementGrantsProtectedAccess(entitlement("ACTIVE")), () => !ent.entitlementGrantsProtectedAccess({ ...entitlement("ACTIVE"), authoritative: false })],
  [() => source.monetization.includes('from "./entitlementAuthority"'), () => source.creatorSetup.includes("wave1_creator_eligibility_readback")],
  [() => source.migration.includes('primary key ("platform", "install_id")'), () => source.migration.includes('constraint "wave1_push_owner_account_check"')],
  [() => ["sign_out", "account_switch", "auth_invalidation", "account_deletion", "recovery_replacement", "auth_loss"].every((reason) => source.session.includes(`"${reason}"`)), () => source.session.includes("revokePushOwnershipForSession")],
  [() => source.migration.includes('"ownership_state" = \'ACCOUNT_BOUND\' and "enabled"'), () => source.migration.includes('"session_generation" = v_session->>\'sessionGeneration\'')],
  [() => source.notifications.includes("PENDING_PUSH_REVOCATIONS_STORAGE_KEY"), () => source.notifications.includes("retryPendingPushRevocations") && source.migration.includes("'idempotent', true")],
  [() => source.creatorSetup.includes("readMyCreatorEligibilityAuthority"), () => source.migration.includes("revoke all on table") && source.migration.includes("wave1_creator_eligibility")],
  [() => creatorReadback().state === "VERIFIED", () => creatorReadback({ providerEligible: null }).state === "PENDING_VERIFICATION"],
  [() => creatorReadback().inputs.age18Plus === true && creatorReadback().inputs.market === "UNITED_STATES", () => creatorReadback({ market: "OTHER" }).state !== "VERIFIED"],
  [() => creator.canCreateCreatorMoneyExposure(creatorReadback()), () => !creator.canCreateCreatorMoneyExposure(creator.parseCreatorEligibilityReadback({ state: "VERIFIED" }))],
  [() => !creator.canCreateCreatorMoneyExposure(creatorReadback({ state: "SUSPENDED" })), () => !creator.canCreateCreatorMoneyExposure(creatorReadback({ state: "REVOKED" }))],
  [() => creator.canProcessCreatorHistoricalObligation("refund"), () => creator.canProcessCreatorHistoricalObligation("reversal")],
  [() => source.session.includes("operation !== sequence"), () => entitlement("ACTIVE", { sessionGeneration: "old" }).state === "UNKNOWN"],
  [() => source.layout.includes('authorityStatus === "unknown"'), () => /protected access remains locked/iu.test(source.layout)],
  [() => source.notifications.includes("queued for retry") && source.migration.includes("wave1_authority_audit_events"), () => !source.webhook.includes("raw_provider_payload_stored: true")],
  [() => new Set(task.stateTransitionModel.states).size === 32 && new Set(task.stateTransitionModel.transitions.map((entry) => entry.id)).size === 48, () => task.taskLocalGoverningEdgeClosure.accounting.unresolvedSet.length === 0],
];

assert.equal(pairs.length, 34);
task.invariants.forEach((invariant, index) => test(`${invariant.id}: ${invariant.positiveWitness} / ${invariant.negativeWitness}`, () => { assert.equal(pairs[index][0](), true); assert.equal(pairs[index][1](), true); }));
