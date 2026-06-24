#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid-placeholder";

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const proofRunId = `wave5-account-admin-revoke-${timestamp}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-wave5-account-admin-revoke-proof-${timestamp}`);

const toText = (value) => String(value ?? "").trim();
const suffix = (value) => toText(value).slice(-8) || null;
const nowIso = () => new Date().toISOString();
const futureIso = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
const classifyError = (error) => toText(error?.message || error?.code || error?.details || error).slice(0, 180);
const row = (status, evidence, extra = {}) => ({ status, evidence, ...extra });

const loadLocalEnv = () => {
  for (const file of [".env.local", ".env.final-qa-proof.local", ".env.browserstack-monetization.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
};

const writeJson = (name, value) => {
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

const client = (url, key) => createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const signIn = async (url, anonKey, label, email, password) => {
  const supabase = client(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`${label}_sign_in_failed`);
  }
  return {
    client: supabase,
    id: data.user.id,
    label,
    tokenPresent: !!data.session.access_token,
  };
};

const expectAllowed = (label, res) => {
  if (res.error) return row("Fail", `${label} expected allowed but got ${classifyError(res.error)}`);
  return row("Pass", `${label} allowed`);
};

const expectBlocked = (label, res, expected = []) => {
  if (!res.error) return row("Fail", `${label} expected blocked but was allowed`);
  const message = classifyError(res.error).toLowerCase();
  if (expected.length && !expected.some((needle) => message.includes(needle.toLowerCase()))) {
    return row("Fail", `${label} blocked with unexpected error: ${classifyError(res.error)}`);
  }
  return row("Pass", `${label} blocked safely`);
};

const expectNoRows = (label, res) => {
  if (res.error) return row("Pass", `${label} denied with RLS/error`);
  const rows = Array.isArray(res.data) ? res.data : [];
  if (rows.length > 0) return row("Fail", `${label} returned private rows`, { rowCount: rows.length });
  return row("Pass", `${label} returned no private rows`);
};

const readSelfEntitlement = async (user, key = "premium") => {
  const { data, error } = await user.client
    .from("user_entitlements")
    .select("entitlement_key,status,source,expires_at,revoked_at")
    .eq("user_id", user.id)
    .eq("entitlement_key", key)
    .maybeSingle();
  return { data, error };
};

const main = async () => {
  loadLocalEnv();
  fs.mkdirSync(proofDir, { recursive: true });

  const supabaseUrl = toText(process.env.SUPABASE_URL) || toText(process.env.EXPO_PUBLIC_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const anonKey = toText(process.env.SUPABASE_ANON_KEY) || toText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || "";
  const serviceRoleKey = toText(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const required = {
    CHILLYWOOD_E2E_OWNER_EMAIL: toText(process.env.CHILLYWOOD_E2E_OWNER_EMAIL),
    CHILLYWOOD_E2E_OWNER_PASSWORD: toText(process.env.CHILLYWOOD_E2E_OWNER_PASSWORD),
    CHILLYWOOD_E2E_VIEWER_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL),
    CHILLYWOOD_E2E_VIEWER_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_PASSWORD),
    CHILLYWOOD_E2E_VIEWER_08_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_08_EMAIL),
    CHILLYWOOD_E2E_VIEWER_08_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_08_PASSWORD),
    CHILLYWOOD_E2E_VIEWER_09_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_09_EMAIL),
    CHILLYWOOD_E2E_VIEWER_09_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_09_PASSWORD),
  };

  const preflight = {
    anonKeyPresent: !!anonKey,
    mutationPerformed: false,
    proofDir,
    proofRunId,
    runRequested: shouldRun,
    secretsPrinted: false,
    serviceRoleKeyPresent: !!serviceRoleKey,
    supabaseUrlPresent: !!supabaseUrl,
    requiredProofCredentialsPresent: Object.fromEntries(Object.entries(required).map(([key, value]) => [key, !!value])),
  };
  writeJson("00-preflight.json", preflight);

  if (!shouldRun) {
    const dryRun = {
      ok: true,
      mode: "dry_run",
      mutationPerformed: false,
      tokensPrinted: false,
      secretsPrinted: false,
      preflight,
    };
    writeJson("wave5-account-admin-revoke-proof.json", dryRun);
    console.log(JSON.stringify(dryRun, null, 2));
    console.error(`Wave 5 proof artifact: ${proofDir}`);
    return;
  }

  const missing = [];
  if (!anonKey || anonKey === DEFAULT_SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  for (const [key, value] of Object.entries(required)) {
    if (!value) missing.push(key);
  }
  if (missing.length) throw new Error(`missing_required_proof_env:${missing.join(",")}`);

  const admin = client(supabaseUrl, serviceRoleKey);
  const users = {
    owner: await signIn(supabaseUrl, anonKey, "owner", required.CHILLYWOOD_E2E_OWNER_EMAIL, required.CHILLYWOOD_E2E_OWNER_PASSWORD),
    viewer: await signIn(supabaseUrl, anonKey, "viewer", required.CHILLYWOOD_E2E_VIEWER_EMAIL, required.CHILLYWOOD_E2E_VIEWER_PASSWORD),
    premium: await signIn(supabaseUrl, anonKey, "premium", required.CHILLYWOOD_E2E_VIEWER_08_EMAIL, required.CHILLYWOOD_E2E_VIEWER_08_PASSWORD),
    deletionCandidate: await signIn(supabaseUrl, anonKey, "deletionCandidate", required.CHILLYWOOD_E2E_VIEWER_09_EMAIL, required.CHILLYWOOD_E2E_VIEWER_09_PASSWORD),
  };

  const cleanup = [];
  const addCleanup = (name, fn) => cleanup.push({ name, fn });
  const matrix = {
    accountLifecycle: {},
    adminSupport: {},
    refundRevokeEntitlement: {},
  };

  const proofTargetId = `wave5-${proofRunId}`;
  const entitlementOriginal = await admin
    .from("user_entitlements")
    .select("user_id,entitlement_key,status,source,starts_at,expires_at,revoked_at,updated_at,metadata")
    .eq("user_id", users.premium.id)
    .eq("entitlement_key", "premium")
    .maybeSingle();

  try {
    const initialDeletionStatus = await users.deletionCandidate.client.rpc("get_my_account_deletion_status");
    matrix.accountLifecycle.initialDeletionStatus = initialDeletionStatus.error
      ? row("Fail", `status read failed: ${classifyError(initialDeletionStatus.error)}`)
      : row("Pass", "signed-in deletion candidate can read own deletion status");

    const schedule = await users.deletionCandidate.client.rpc("schedule_account_deletion", {
      p_reason: "Wave 5 proof scheduled deletion.",
      p_details: proofRunId,
    });
    matrix.accountLifecycle.scheduleDeletion = schedule.error
      ? row("Fail", `schedule failed: ${classifyError(schedule.error)}`)
      : row("Pass", "account deletion scheduled with restore window", {
          deletionRequestIdSuffix: suffix(schedule.data?.id),
          scheduled: schedule.data?.scheduled === true,
          deletionStatus: schedule.data?.status ?? null,
        });
    addCleanup("restore_scheduled_account_deletion", async () => users.deletionCandidate.client.rpc("restore_scheduled_account_deletion"));

    const publicProfileVisibility = await users.viewer.client.rpc("can_view_profile_content", {
      profile_user_id: users.deletionCandidate.id,
    });
    matrix.accountLifecycle.scheduledDeletionPublicProfileHidden = publicProfileVisibility.error
      ? row("Fail", `profile visibility proof failed: ${classifyError(publicProfileVisibility.error)}`)
      : publicProfileVisibility.data === false
        ? row("Pass", "scheduled-deletion profile hidden from another signed-in user")
        : row("Fail", "scheduled-deletion profile remained visible");

    const publicPlatformVisibility = await users.viewer.client.rpc("resolve_platform_visibility_access", {
      platform_owner_id: users.deletionCandidate.id,
      viewer_id: users.viewer.id,
    });
    matrix.accountLifecycle.scheduledDeletionPublicPlatformHidden = publicPlatformVisibility.error
      ? row("Fail", `platform visibility proof failed: ${classifyError(publicPlatformVisibility.error)}`)
      : publicPlatformVisibility.data?.allowed === false && publicPlatformVisibility.data?.reason === "account_deletion_scheduled"
        ? row("Pass", "scheduled-deletion Public Platform resolver denied public access")
        : row("Fail", "scheduled-deletion Public Platform resolver did not deny public access", {
            allowed: publicPlatformVisibility.data?.allowed ?? null,
            reason: publicPlatformVisibility.data?.reason ?? null,
          });

    const restore = await users.deletionCandidate.client.rpc("restore_scheduled_account_deletion");
    matrix.accountLifecycle.restoreDeletion = restore.error
      ? row("Fail", `restore failed: ${classifyError(restore.error)}`)
      : restore.data?.restored === true
        ? row("Pass", "scheduled deletion restored inside restore window", { deletionStatus: restore.data?.status ?? null })
        : row("Fail", "restore RPC did not report restored");

    const signedOutStatus = await client(supabaseUrl, anonKey).rpc("get_my_account_deletion_status");
    matrix.accountLifecycle.signedOutDeletionStatusDenied = expectBlocked("signed-out deletion status", signedOutStatus, ["sign_in_required", "jwt", "permission denied"]);

    matrix.accountLifecycle.permanentPurge = row("Pending", "permanent purge/de-identification job is not implemented/proved in this lane");
    matrix.accountLifecycle.deletedPrivateFeatureDenial = row("Pending", "scheduled deletion hides public profile/search and signs out in app, but global deleted/deactivated private-feature denial is not claimed");

    const ownerAdminRead = await users.owner.client.rpc("get_admin_users_read_model", { p_query: "wave5", p_limit: 3 });
    matrix.adminSupport.adminUsersReadback = ownerAdminRead.error
      ? row("Partial", `owner/operator admin readback unavailable or owner role missing: ${classifyError(ownerAdminRead.error)}`)
      : row("Pass", "owner/operator admin Users read model returned", {
          filteredUsers: ownerAdminRead.data?.summary?.filteredUsers ?? null,
          returnedRows: Array.isArray(ownerAdminRead.data?.items) ? ownerAdminRead.data.items.length : null,
        });

    const viewerAdminRead = await users.viewer.client.rpc("get_admin_users_read_model", { p_query: "wave5", p_limit: 1 });
    matrix.adminSupport.nonAdminUsersReadDenied = expectBlocked("non-admin admin Users read model", viewerAdminRead, ["owner_or_operator_required", "admin_users_read_model_denied", "permission", "role"]);

    const reportInsert = await users.viewer.client
      .from("safety_reports")
      .insert({
        reporter_user_id: users.viewer.id,
        target_type: "title",
        target_id: proofTargetId,
        category: "other",
        note: `Wave 5 support privacy proof ${proofRunId}`,
        context: { proofRunId, wave: "5", secret_free: true },
      })
      .select("id,status,severity")
      .single();
    if (reportInsert.error) {
      matrix.adminSupport.supportReportSubmission = row("Fail", `support/report insert failed: ${classifyError(reportInsert.error)}`);
    } else {
      matrix.adminSupport.supportReportSubmission = row("Pass", "support/report item submitted with public-safe fields", {
        reportIdSuffix: suffix(reportInsert.data?.id),
        reportStatus: reportInsert.data?.status ?? null,
        severity: reportInsert.data?.severity ?? null,
      });
      addCleanup("safety_report", async () => admin.from("safety_reports").delete().eq("id", reportInsert.data.id));

      const unrelatedReportRead = await users.premium.client
        .from("safety_reports")
        .select("id,reporter_user_id,note")
        .eq("id", reportInsert.data.id);
      matrix.adminSupport.supportReportPrivateReadDenied = expectNoRows("unrelated support/report read", unrelatedReportRead);
    }

    const dmcaPayload = {
      reporterName: "Wave Five Proof Reporter",
      reporterEmail: "wave5-proof@example.invalid",
      copyrightOwnerName: "Wave Five Proof Owner",
      copyrightedWorkDescription: `Wave 5 proof work ${proofRunId}`,
      infringingMaterialDescription: "Safe proof-only description for access-control testing.",
      contentType: "other",
      contentId: proofTargetId,
      goodFaithStatement: true,
      accuracyPenaltyPerjuryStatement: true,
      electronicSignature: "Wave Five Proof Reporter",
    };
    const dmcaSubmit = await users.viewer.client.rpc("submit_dmca_notice", { p_payload: dmcaPayload });
    const dmcaRow = Array.isArray(dmcaSubmit.data) ? dmcaSubmit.data[0] : null;
    if (dmcaSubmit.error || !dmcaRow?.id) {
      matrix.adminSupport.dmcaSubmission = row("Fail", `DMCA submission failed: ${classifyError(dmcaSubmit.error)}`);
    } else {
      matrix.adminSupport.dmcaSubmission = row("Pass", "DMCA proof submission returned only case id/number/status", {
        caseIdSuffix: suffix(dmcaRow.id),
        caseStatus: dmcaRow.status ?? null,
      });
      addCleanup("dmca_case", async () => admin.from("dmca_cases").delete().eq("id", dmcaRow.id));
      const unrelatedDmcaRead = await users.premium.client
        .from("dmca_cases")
        .select("id,reporter_email,reporter_name")
        .eq("id", dmcaRow.id);
      matrix.adminSupport.dmcaPrivateReadDenied = expectNoRows("unrelated DMCA private read", unrelatedDmcaRead);
    }

    const nonAdminAuditRead = await users.viewer.client
      .from("platform_admin_audit_logs")
      .select("id,action,metadata")
      .limit(1);
    matrix.adminSupport.nonAdminAuditDenied = expectNoRows("non-admin audit log read", nonAdminAuditRead);

    await admin.from("user_entitlements").upsert({
      user_id: users.premium.id,
      entitlement_key: "premium",
      status: "active",
      source: "test_grant",
      starts_at: nowIso(),
      expires_at: futureIso(3600),
      revoked_at: null,
      metadata: { proofRunId, wave: "5", temporary: true },
      updated_at: nowIso(),
    });
    addCleanup("restore_premium_entitlement", async () => {
      if (entitlementOriginal.data) {
        await admin.from("user_entitlements").upsert(entitlementOriginal.data);
      } else {
        await admin.from("user_entitlements").delete().eq("user_id", users.premium.id).eq("entitlement_key", "premium");
      }
    });

    const activeEntitlement = await readSelfEntitlement(users.premium, "premium");
    matrix.refundRevokeEntitlement.validPremiumEntitlement = !activeEntitlement.error && activeEntitlement.data?.status === "active"
      ? row("Pass", "valid temporary Premium entitlement is self-readable and active")
      : row("Fail", `active entitlement readback failed: ${classifyError(activeEntitlement.error)}`);

    const spoofEntitlement = await users.viewer.client.from("user_entitlements").insert({
      user_id: users.viewer.id,
      entitlement_key: "premium",
      status: "active",
      source: "test_grant",
      metadata: { proofRunId, spoofAttempt: true },
    });
    matrix.refundRevokeEntitlement.clientSpoofDenied = expectBlocked("non-admin client entitlement spoof insert", spoofEntitlement, ["row-level", "policy", "permission", "violates"]);

    await admin.from("user_entitlements")
      .update({
        status: "revoked",
        revoked_at: nowIso(),
        updated_at: nowIso(),
        metadata: { proofRunId, wave: "5", revoked: true, temporary: true },
      })
      .eq("user_id", users.premium.id)
      .eq("entitlement_key", "premium");

    const revokedEntitlement = await readSelfEntitlement(users.premium, "premium");
    matrix.refundRevokeEntitlement.revokedPremiumDenies = !revokedEntitlement.error && (
      revokedEntitlement.data?.status === "revoked" || !!revokedEntitlement.data?.revoked_at
    )
      ? row("Pass", "revoked Premium entitlement reads inactive/revoked")
      : row("Fail", `revoked entitlement readback failed: ${classifyError(revokedEntitlement.error)}`);

    const accessGrant = await admin.from("access_grants").insert({
      user_id: users.premium.id,
      grant_type: "event_pass",
      source_type: "admin",
      environment: "sandbox",
      status: "sandbox_only",
      starts_at: nowIso(),
      expires_at: futureIso(3600),
      metadata: { proofRunId, wave: "5", sandbox_only: true, live_money: false },
    }).select("id,status,environment").single();

    if (accessGrant.error) {
      matrix.refundRevokeEntitlement.sandboxAccessGrantRevoke = row("Fail", `sandbox grant setup failed: ${classifyError(accessGrant.error)}`);
    } else {
      addCleanup("access_grant", async () => admin.from("access_grants").delete().eq("id", accessGrant.data.id));
      const revokeResult = await admin.rpc("admin_revoke_money_access_grant_for_proof", {
        p_grant_id: accessGrant.data.id,
        p_reason: `Wave 5 sandbox revoke proof ${proofRunId}`,
      });
      matrix.refundRevokeEntitlement.sandboxAccessGrantRevoke = revokeResult.error
        ? row("Fail", `sandbox revoke proof failed: ${classifyError(revokeResult.error)}`)
        : revokeResult.data?.status === "revoked" && revokeResult.data?.providerRefundClaimed === false && revokeResult.data?.liveMoneyAction === false
          ? row("Pass", "sandbox access revoke recorded without provider refund or live-money action", {
              accessGrantIdSuffix: suffix(revokeResult.data?.accessGrantId),
              ledgerEventIdSuffix: suffix(revokeResult.data?.ledgerEventId),
              payableState: revokeResult.data?.payableState ?? null,
            })
          : row("Fail", "sandbox revoke result did not preserve no-provider/no-live-money contract", { result: revokeResult.data });
      if (revokeResult.data?.ledgerEventId) {
        addCleanup("money_access_ledger_event", async () => admin.from("money_access_ledger_events").delete().eq("id", revokeResult.data.ledgerEventId));
      }
    }

    matrix.refundRevokeEntitlement.providerRefundExecution = row("Pending", "real provider refund execution is external/manual and was not run by this proof");
    matrix.refundRevokeEntitlement.liveMoneyPayoutSideEffects = row("Pass", "proof used setup/sandbox rows only and did not call payment or payout providers");
  } finally {
    const cleanupResults = [];
    for (const item of cleanup.reverse()) {
      try {
        const result = await item.fn();
        cleanupResults.push({ name: item.name, ok: !result?.error, error: result?.error ? classifyError(result.error) : null });
      } catch (error) {
        cleanupResults.push({ name: item.name, ok: false, error: classifyError(error) });
      }
    }
    matrix.cleanup = cleanupResults;
  }

  const statuses = JSON.stringify(matrix);
  const status = statuses.includes("\"Fail\"") ? "failed" : statuses.includes("\"Pending\"") || statuses.includes("\"Partial\"") ? "partial" : "passed";
  const result = {
    status,
    proofRunId,
    proofDir,
    mutationPerformed: true,
    secretsPrinted: false,
    tokensPrinted: false,
    userIdSuffixes: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, suffix(user.id)])),
    matrix,
  };
  writeJson("wave5-account-admin-revoke-proof.json", result);
  fs.writeFileSync(path.join(proofDir, "README.md"), [
    "# Wave 5 Account/Admin/Revoke Proof",
    "",
    `Proof run: ${proofRunId}`,
    "",
    "This artifact contains sanitized JSON output only. It intentionally omits credentials, service-role keys, JWTs, provider secrets, payment tokens, push tokens, LiveKit tokens, and signed URLs.",
    "",
    `Result: ${status}`,
    "",
  ].join("\n"));
  console.log(JSON.stringify(result, null, 2));
  console.error(`Wave 5 proof artifact: ${proofDir}`);
};

main().catch((error) => {
  const failure = {
    status: "blocked",
    proofRunId,
    proofDir,
    mutationPerformed: shouldRun,
    secretsPrinted: false,
    tokensPrinted: false,
    error: classifyError(error),
  };
  writeJson("wave5-account-admin-revoke-proof.json", failure);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
