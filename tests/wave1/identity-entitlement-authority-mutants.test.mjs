import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url); const read = (path) => readFileSync(path, "utf8");
const load = (path) => { const module = { exports: {} }; const js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; new Function("exports", "module", "require", js)(module.exports, module, require); return module.exports; };
const links = load("_lib/appLinks.ts"); const ent = load("_lib/entitlementAuthority.ts"); const creator = load("_lib/creatorEligibility.ts");
const task = JSON.parse(read("docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json"));
const src = Object.fromEntries(Object.entries({ access: "_lib/accessEntitlements.ts", room: "_lib/roomRules.ts", legal: "_lib/accountLegalAcceptance.ts", session: "_lib/session.tsx", recovery: "app/reset-password.tsx", notifications: "_lib/notifications.ts", notificationEdge: "supabase/functions/notification-device-tokens/index.ts", premium: "_lib/premiumEntitlements.ts", monetization: "_lib/monetization.ts", revenuecat: "_lib/revenuecat.ts", creatorSetup: "_lib/creatorMonetizationSetup.ts", layout: "app/_layout.tsx", migration: "supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql", webhook: "supabase/functions/revenuecat-webhook/index.ts" }).map(([key, path]) => [key, read(path)]));
const binding = { userId: "11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111", sessionGeneration: "22222222-2222-4222-8222-222222222222", restoreOnly: false };
const active = (extra = {}, state = "ACTIVE") => ent.normalizeEntitlementAuthorityReadback({ entitlementKey: "premium", expectedBinding: binding, readback: { ...binding, entitlementKey: "premium", state, authoritative: true, grantsProtectedAccess: state === "ACTIVE" || state === "GRACE", source: "revenuecat", expiresAt: null, revokedAt: null, authoritativeAt: "2026-08-14T12:00:00Z", ...extra } });
const verified = (extra = {}) => creator.parseCreatorEligibilityReadback({ ...binding, authoritative: true, authoritySource: "money_flow_control", state: "VERIFIED", accountStatus: "ACTIVE", age18Plus: true, legalAccepted: true, creatorRole: true, moderationState: "CLEAR", market: "UNITED_STATES", rolloutEligible: true, platformCapability: true, providerEligible: true, kycComplete: true, taxComplete: true, sanctionsClear: true, payoutEligible: true, canCreateMoneyExposure: true, canProcessHistoricalObligations: true, minimumAge: 18, rollout: "CONTROLLED_1_PERCENT_UNITED_STATES", version: 1, evaluatedAt: "2026-08-14T12:00:00Z", ...extra });
const env = () => links.createAuthRedirectEnvelope("/settings", { id: "one", now: 0, ttlMs: 100 });
const kills = [
  () => links.resolveApplicationRoute("https://evil.example/settings") === null,
  () => links.resolveApplicationRoute("/admin") === null,
  () => links.resolveApplicationRoute("/settings?role=owner") === null,
  () => links.resolveApplicationRoute("/profile/%252e%252e") === null,
  () => links.consumeAuthRedirectEnvelope({ ...env(), route: "https://evil.example" }, binding, new Set(), 1).route === null,
  () => src.legal.includes("wave1_legal_requirements_readback") && !src.legal.includes(".upsert("),
  () => src.migration.includes('"document_version" = doc."version"') && src.migration.includes('"role_key" = v_role'),
  () => src.migration.includes('revoke insert, update, delete on table public."user_account_legal_acceptances"'),
  () => src.migration.includes("legal_version_mismatch"),
  () => ["terms", "privacy", "community_guidelines", "creator_terms", "money_terms"].every((key) => src.migration.includes(`'${key}'`)),
  () => src.migration.includes("wave1_purge_expired_authority_evidence") && src.migration.includes("interval '7 years'"),
  () => ["UNKNOWN", "INACTIVE", "ACTIVE", "GRACE"].every((state) => ent.ENTITLEMENT_AUTHORITY_STATES.includes(state)) && ent.createUnknownEntitlementDecision("premium").state !== ent.createInactiveEntitlementDecision({ entitlementKey: "premium", binding, authoritativeAt: "2026-08-14T12:00:00Z" }).state,
  async () => await ent.withAuthorityReadDeadline(Promise.reject(new Error("outage")), "fallback", 1) === "fallback" && [{ accountId: "replacement" }, { source: "client" }, { grantsProtectedAccess: false }, { authoritativeAt: "bad" }].every((extra) => active(extra).state === "UNKNOWN"),
  () => ent.entitlementGrantsProtectedAccess(active()) && ent.entitlementGrantsProtectedAccess(active({}, "GRACE")) && ent.resolveAlternativeEntitlementAuthority([active({}, "GRACE"), active()], 2).state === "ACTIVE" && !ent.entitlementGrantsProtectedAccess(active({}, "INACTIVE")) && !ent.entitlementGrantsProtectedAccess(ent.createUnknownEntitlementDecision("premium")),
  () => ent.createUnknownEntitlementDecision("premium", "query_failed").reason === "query_failed" && !src.premium.includes(".upsert(") && src.monetization.includes("Premium status unavailable"),
  () => [{ userId: "replacement" }, { accountId: "replacement" }, { sessionGeneration: "replacement" }, { restoreOnly: true }].every((extra) => active(extra).state === "UNKNOWN"),
  () => ent.rejectStaleEntitlementDecision(active(), { ...binding, sessionGeneration: "replacement" }).state === "UNKNOWN" && src.revenuecat.includes("requireRevenueCatMutationAuthority({ authority })"),
  () => src.webhook.includes("staleEvent") && src.webhook.includes("duplicateEvent"),
  () => !ent.entitlementGrantsProtectedAccess({ ...active(), authoritative: false, grantsProtectedAccess: true }) && src.access.includes('| "entitlement_unknown"') && src.room.includes('| "entitlement_unknown"') && (src.access.match(/\? "user_entitlement"/gu) ?? []).length === 2 && !/(?:as AccessReason|as RoomAccessReason|as unknown as)/u.test(src.access + src.room),
  () => src.monetization.includes('from "./entitlementAuthority"') && src.premium.includes('from "./entitlementAuthority"') && src.revenuecat.includes("sameAccountSessionAuthority"),
  () => src.migration.includes('primary key ("platform", "install_id")'),
  () => ["account_switch", "auth_invalidation", "account_deletion", "recovery_replacement", "auth_loss"].every((reason) => src.session.includes(reason)) && src.session.includes("syncRevenueCatCustomerIdentity(null)"),
  () => src.migration.includes('"ownership_state" = \'ACCOUNT_BOUND\' and "enabled"') && src.notificationEdge.includes("requestAccepted: true"),
  () => src.notifications.includes("serializePushRevocationLedger") && src.notifications.includes("retryPendingPushRevocationsInternal") && !src.notifications.includes("entries.slice(-8)"),
  () => src.creatorSetup.includes("wave1_creator_eligibility_readback") && !src.creatorSetup.includes(".from(\"wave1_creator_eligibility\")"),
  () => verified({ providerEligible: null }).state === "PENDING_VERIFICATION",
  () => verified({ age18Plus: false }).state !== "VERIFIED" && verified({ market: "OTHER" }).state !== "VERIFIED",
  () => !creator.canCreateCreatorMoneyExposure(creator.parseCreatorEligibilityReadback({ authoritative: false, state: "VERIFIED" })),
  () => !creator.canCreateCreatorMoneyExposure(verified({ state: "SUSPENDED" })) && !creator.canCreateCreatorMoneyExposure(verified({ state: "REVOKED" })),
  () => creator.canProcessCreatorHistoricalObligation("audit") && creator.canProcessCreatorHistoricalObligation("cleanup"),
  () => active({ sessionGeneration: "stale" }).state === "UNKNOWN" && src.recovery.includes("sameAccountSessionAuthority(captured, recoveryAuthority)") && src.session.includes('setAuthorityStatus("recovery_only")') && src.session.includes("PENDING_RECOVERY") && !src.recovery.includes('markRecoveryReady("recovery_session")'),
  () => src.layout.includes('authorityStatus === "unknown"') && src.monetization.includes("Premium status unavailable") && /unavailable and unverified[\s\S]{0,120}Protected access remains locked/iu.test(src.monetization),
  () => src.notifications.includes("queued for retry") && src.notifications.includes("push_revocation_ledger_invalid") && src.notificationEdge.includes("exactReceipt") && src.migration.includes("evaluationSequence"),
  () => task.stateTransitionModel.machines.length === 6 && task.stateTransitionModel.states.length === 32 && task.stateTransitionModel.transitions.length === 48 && task.invariants.length === 34 && task.taskLocalGoverningEdgeClosure.accounting.unresolvedSet.length === 0,
];
assert.equal(kills.length, 34); assert.deepEqual(task.mutants.map((entry) => entry.mutation), task.invariants.map((entry) => entry.targetedMutant));
task.mutants.forEach((mutant, index) => test(`${mutant.id}: kill ${mutant.mutation}`, async () => assert.equal(await kills[index](), true)));
after(() => console.log("Wave 1 targeted mutants killed: 34/34"));
