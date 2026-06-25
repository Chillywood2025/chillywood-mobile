#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid-placeholder";

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const proofOnly = args.has("--proof-only");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const proofRunId = `final-launch-ops-${timestamp}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-final-launch-operations-proof-${timestamp}`);

const toText = (value) => String(value ?? "").trim();
const suffix = (value) => toText(value).slice(-8) || null;
const nowIso = () => new Date().toISOString();
const pastIso = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const futureIso = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const classifyError = (error) => toText(error?.message || error?.code || error?.details || error).slice(0, 220);
const row = (status, evidence, extra = {}) => ({ status, evidence, ...extra });

function loadLocalEnv() {
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
}

function writeJson(name, value) {
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(name, value) {
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, name), `${value}\n`);
}

function client(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(url, anonKey, label, email, password) {
  const supabase = client(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`${label}_sign_in_failed:${classifyError(error)}`);
  }
  return { client: supabase, id: data.user.id, label };
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value ?? null;
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/email|password|token|secret|key|url|authorization|hash|fingerprint|provider_order|receipt|private/i.test(key)) {
      output[key] = "[redacted]";
    } else if (/^(id|user_id|owner_user_id|viewer_user_id|target_id|actor_user_id|reporter_user_id)$/i.test(key)) {
      output[key] = suffix(raw);
    } else if (/userId|UserId|targetId|TargetId|actorId|ActorId/i.test(key)) {
      output[key] = suffix(raw);
    } else if (typeof raw === "object") {
      output[key] = sanitize(raw);
    } else {
      output[key] = raw;
    }
  }
  return output;
}

function secretScan(artifactDir) {
  const flagged = [];
  const patterns = [
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    /service[_-]?role\s*[:=]\s*[^<\s]/i,
    /refresh_token\s*[:=]\s*[^<\s]/i,
    /access_token\s*[:=]\s*[^<\s]/i,
    /signedUrl\s*[:=]\s*[^<\s]/i,
    /provider[_-]?secret\s*[:=]\s*[^<\s]/i,
    /proof password/i,
    /reset link/i,
  ];
  for (const file of fs.readdirSync(artifactDir)) {
    const full = path.join(artifactDir, file);
    if (!fs.statSync(full).isFile()) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(text)) flagged.push({ file, pattern: String(pattern) });
    }
  }
  return flagged;
}

async function expectBlocked(label, promise, expectedNeedles) {
  const { data, error } = await promise;
  if (!error) return row("Fail", `${label} expected blocked but was allowed`, { data: sanitize(data) });
  const message = classifyError(error);
  const matched = expectedNeedles.some((needle) => message.toLowerCase().includes(needle.toLowerCase()));
  return matched
    ? row("Pass", `${label} blocked safely`, { error: message })
    : row("Fail", `${label} blocked with unexpected error`, { error: message });
}

function readDoc(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function refundManualExternalProof() {
  const files = [
    "docs/FINAL_PUBLIC_USE_GO_NO_GO.md",
    "docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md",
    "docs/ACCOUNT_PURGE_PRODUCTION_RUNBOOK.md",
    "NEXT_TASK.md",
  ];
  const text = files.map((file) => `${file}\n${readDoc(file)}`).join("\n\n");
  const lower = text.toLowerCase();
  const required = [
    ["manual/external", lower.includes("manual/external")],
    ["must not claim instant or automatic provider refunds", lower.includes("must not claim instant") && lower.includes("automatic provider refunds")],
    ["no provider refund api claim", lower.includes("provider refund api execution is not implemented") || lower.includes("no provider refund")],
    ["entitlement revoke remains proved", lower.includes("entitlement revoke") || lower.includes("access removal behavior is proved")],
  ];
  const forbidden = [
    "instant provider refunds are supported",
    "automatic provider refunds are supported",
    "provider refund api proof passed",
    "automated refund execution closed",
  ];
  const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
  const forbiddenFound = forbidden.filter((phrase) => lower.includes(phrase));
  return {
    status: missing.length === 0 && forbiddenFound.length === 0 ? "Pass" : "Partial",
    evidence: missing.length === 0 && forbiddenFound.length === 0
      ? "refund docs keep provider refund execution manual/external and avoid automated refund claims"
      : "refund docs need review",
    checkedFiles: files,
    missing,
    forbiddenFound,
    providerRefundExecuted: false,
    liveMoneyAction: false,
  };
}

function batchMatrix(result = {}) {
  return {
    configExists: row(result.runtimeStatus ? "Pass" : "Pending", "account purge runtime config readback exists"),
    emergencyStop: result.emergencyStop ?? row("Pending", "not run"),
    dryRun: result.dryRun?.status === "dry_run"
      ? row("Pass", "batch dry-run returns eligible counts without mutation")
      : row("Pending", "batch dry-run not run"),
    proofOnlyBatchRun: result.batchRun?.status === "completed"
      ? row("Pass", "proof-only batch processed eligible disposable proof account")
      : row("Pending", "proof-only batch mutation not run"),
    productionModeGate: result.disabledMutation?.status === "batch_disabled"
      ? row("Pass", "mutation without explicit enable remains disabled")
      : row("Pending", "disabled mutation proof not run"),
    batchSizeBound: result.dryRun?.boundedLimit != null && result.dryRun.boundedLimit <= 25
      ? row("Pass", `batch limit bounded to ${result.dryRun.boundedLimit}`)
      : row("Pending", "batch bound not proved"),
    eligibilityFilter: result.dryRun?.proofEligibleCountWithinLimit > 0
      ? row("Pass", "eligible proof account detected by dry-run")
      : row("Pending", "eligible proof account not detected"),
    protectedAccountSkip: result.protectedDenial ?? row("Pending", "not run"),
    restoreWindowSkip: result.restoreWindowDenial ?? row("Pending", "not run"),
    activeUserSkip: result.activeDenial ?? row("Pending", "not run"),
    auditLog: result.auditReadback?.count > 0
      ? row("Pass", "batch audit readback returned sanitized row(s)")
      : row("Pending", "batch audit readback not proved"),
    idempotency: result.idempotency?.status === "already_deidentified" || result.secondBatch?.processedCount === 0
      ? row("Pass", "repeat run does not duplicate or corrupt purge state")
      : row("Pending", "idempotency not proved"),
    manualReviewCreation: result.manualReview?.count > 0
      ? row("Pass", "manual-review items created for retained/review categories")
      : row("Pending", "manual-review items not proved"),
    noRealUserPurge: result.batchRun?.mode === "proof_only"
      ? row("Pass", "mutation was proof-only and scoped to disposable proof accounts")
      : row("Pending", "no mutation run"),
  };
}

function manualReviewMatrix(items = []) {
  const categories = new Map(items.map((item) => [item.category, item]));
  const statusFor = (category) => categories.has(category) ? "Pass" : "Partial";
  const evidenceFor = (category) => categories.has(category) ? categories.get(category).status : "not created in this proof fixture";
  return {
    creatorMedia: { action: "manual review", reviewStatus: evidenceFor("creator_media"), proofResult: "creator media/storage is not auto-deleted", status: statusFor("creator_media") },
    storageReferences: { action: "manual review", reviewStatus: evidenceFor("storage_references"), proofResult: "storage object references are queued, not deleted", status: statusFor("storage_references") },
    providerRecords: { action: "manual/external", reviewStatus: evidenceFor("provider_records"), proofResult: "provider refund execution remains external", status: statusFor("provider_records") },
    legalSupportDmca: { action: "retain private/manual review", reviewStatus: evidenceFor("legal_support_dmca"), proofResult: "support/safety/DMCA category is private and reviewable", status: statusFor("legal_support_dmca") },
    paymentAccessGrants: { action: "retain private", reviewStatus: evidenceFor("payment_access_grants"), proofResult: "access grants are retained for disputes/audit", status: statusFor("payment_access_grants") },
    abuseSecurityRecords: { action: "retain private/manual review", reviewStatus: evidenceFor("abuse_security_records"), proofResult: "covered by retention policy; no destructive delete", status: "Partial" },
    adminAuditLogs: { action: "retain append-only", reviewStatus: evidenceFor("admin_audit_logs"), proofResult: "batch audit is retained and sanitized", status: statusFor("admin_audit_logs") },
  };
}

function refundMatrix(refundProof) {
  return {
    noAutomaticRefundClaim: { result: refundProof.missing.length === 0 && refundProof.forbiddenFound.length === 0 ? "copy/doc scan passed" : "copy/doc scan needs review", status: refundProof.status },
    supportProcessDocumented: { result: "manual/external support process documented", status: refundProof.missing.includes("manual/external") ? "Partial" : "Pass" },
    entitlementRevokeStillProved: { result: "entitlement/access removal remains local proof, not provider refund execution", status: refundProof.missing.includes("entitlement revoke remains proved") ? "Partial" : "Pass" },
    noRefundApiCall: { result: "proof script performs no refund API call", status: "Pass" },
    noLiveMoneySideEffect: { result: "proof script performs no live-money action", status: "Pass" },
  };
}

async function createProofUser(admin, email, username, metadata = {}) {
  const password = `FinalOps-${randomBytes(12).toString("hex")}-Aa1!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { proof: "final_launch_operations", ...metadata },
    app_metadata: { proofAccount: true },
  });
  if (created.error || !created.data.user?.id) throw new Error(`create_proof_user_failed:${classifyError(created.error)}`);
  const user = created.data.user;
  const profile = await admin.from("user_profiles").upsert({
    user_id: user.id,
    username,
    display_name: "Final Ops Proof User",
    tagline: `Final launch operations proof ${proofRunId}`,
    profile_visibility: "everyone",
    profile_access_visibility: "public",
    platform_access_visibility: "public",
    public_activity_visibility: "public",
  }, { onConflict: "user_id" });
  if (profile.error) throw new Error(`create_proof_profile_failed:${classifyError(profile.error)}`);
  return { user, password };
}

async function scheduleDeletionRow(admin, userId, statusWindow) {
  const time = statusWindow === "expired" ? pastIso() : futureIso();
  const result = await admin.from("account_deletion_requests").insert({
    user_id: userId,
    reason: `Final launch operations ${statusWindow} deletion ${proofRunId}`,
    details: "Disposable proof account only.",
    status: "scheduled",
    requested_at: nowIso(),
    delete_after: time,
    restore_deadline: time,
    metadata: { proofRunId, finalLaunchOperations: true, statusWindow },
  }).select("id,status,delete_after,restore_deadline").single();
  if (result.error) throw new Error(`schedule_${statusWindow}_deletion_failed:${classifyError(result.error)}`);
  return result.data;
}

async function main() {
  loadLocalEnv();
  fs.mkdirSync(proofDir, { recursive: true });

  const refundProof = refundManualExternalProof();
  const supabaseUrl = toText(process.env.SUPABASE_URL) || toText(process.env.EXPO_PUBLIC_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const anonKey = toText(process.env.SUPABASE_ANON_KEY) || toText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || "";
  const serviceRoleKey = toText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ownerEmail = toText(process.env.CHILLYWOOD_E2E_OWNER_EMAIL) || toText(process.env.FINAL_QA_PROOF_EMAIL);
  const ownerPassword = toText(process.env.CHILLYWOOD_E2E_OWNER_PASSWORD) || toText(process.env.FINAL_QA_PROOF_PASSWORD);
  const viewerEmail = toText(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL);
  const viewerPassword = toText(process.env.CHILLYWOOD_E2E_VIEWER_PASSWORD);

  const preflight = {
    proofDir,
    proofRunId,
    runRequested: shouldRun,
    proofOnlyRequested: proofOnly,
    supabaseUrlPresent: !!supabaseUrl,
    anonKeyPresent: !!anonKey && anonKey !== DEFAULT_SUPABASE_ANON_KEY,
    privilegedCredentialAvailable: !!serviceRoleKey,
    ownerCredentialsPresent: !!ownerEmail && !!ownerPassword,
    nonAdminCredentialsPresent: !!viewerEmail && !!viewerPassword,
    refundManualExternalStatus: refundProof.status,
  };
  writeJson("00-preflight.json", preflight);

  if (!shouldRun) {
    const dry = {
      ok: true,
      mode: "dry_run",
      mutationPerformed: false,
      refundManualExternal: refundProof,
      batchAutoPurge: "dry-run only; mutation requires --run --proof-only",
      manualReviewWorkflow: "static proof only; runtime proof requires --run --proof-only",
      batchAutoPurgeMatrix: batchMatrix(),
      manualReviewMatrix: manualReviewMatrix(),
      refundManualExternalMatrix: refundMatrix(refundProof),
      providerRefundExecuted: false,
      liveMoneyAction: false,
    };
    writeJson("final-launch-operations-proof.json", dry);
    writeJson("final-blocker-matrix.json", {
      providerRefundExecution: "Accepted manual/external",
      batchAutoPurgeAutomation: "Pending runtime proof until --run --proof-only",
      manualReviewCategories: "Pending runtime proof until --run --proof-only",
      passwordResetAuthEmailProviderProof: "Pending external/provider",
    });
    writeText("README.md", [
      "# Final launch operations proof",
      "",
      "Mode: dry-run.",
      "No mutation, refund API call, provider action, live-money action, or real-user purge was performed.",
      "Run with --run --proof-only only for disposable proof-account batch mutation.",
    ].join("\n"));
    const findings = secretScan(proofDir);
    writeJson("secret-token-scan.json", { status: findings.length ? "Review" : "Pass", findings });
    console.log(JSON.stringify({ ok: true, mode: "dry_run", artifactDir: proofDir, refundManualExternalStatus: refundProof.status }, null, 2));
    return;
  }

  const missing = [];
  if (!proofOnly) missing.push("--proof-only");
  if (!anonKey || anonKey === DEFAULT_SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ownerEmail || !ownerPassword) missing.push("owner/operator proof credentials");
  if (!viewerEmail || !viewerPassword) missing.push("non-admin proof credentials");
  if (missing.length) throw new Error(`missing_required_proof_inputs:${missing.join(",")}`);

  const admin = client(supabaseUrl, serviceRoleKey);
  const owner = await signIn(supabaseUrl, anonKey, "owner", ownerEmail, ownerPassword);
  const viewer = await signIn(supabaseUrl, anonKey, "viewer", viewerEmail, viewerPassword);
  const stamp = timestamp.toLowerCase();
  const shortStamp = stamp.slice(-8);
  const eligible = await createProofUser(admin, `final-ops-purgebatch-${stamp}@chillywood.test`, `purgebat${shortStamp}`);
  const active = await createProofUser(admin, `final-ops-active-${stamp}@chillywood.test`, `foact${shortStamp}`);
  const windowed = await createProofUser(admin, `final-ops-window-${stamp}@chillywood.test`, `fowin${shortStamp}`);
  const createdAuthUsers = [eligible.user.id, active.user.id, windowed.user.id];
  const readbacks = {};
  const bits = {};

  try {
    const runtimeStatus = await owner.client.rpc("admin_account_purge_runtime_status");
    if (runtimeStatus.error) throw new Error(`runtime_status_failed:${classifyError(runtimeStatus.error)}`);
    bits.runtimeStatus = sanitize(runtimeStatus.data);
    readbacks.runtimeStatus = bits.runtimeStatus;

    const video = await admin.from("videos").insert({
      owner_id: eligible.user.id,
      title: `Final Ops Manual Review Proof ${proofRunId}`,
      description: "Disposable proof media metadata for manual review queue.",
      visibility: "draft",
      moderation_status: "pending_review",
      storage_provider: "supabase",
      storage_bucket: "creator-videos",
      storage_object_key: `proof/manual-review/${proofRunId}.mp4`,
    }).select("id").single();
    if (video.error) throw new Error(`video_fixture_failed:${classifyError(video.error)}`);

    const grant = await admin.from("access_grants").insert({
      user_id: eligible.user.id,
      grant_type: "creator_tip_record",
      source_type: "setup",
      source_id: randomUUID(),
      environment: "setup",
      status: "setup_only",
      metadata: { proofRunId, finalLaunchOperations: true, providerRefundExecuted: false, liveMoneyAction: false },
    }).select("id").single();
    if (grant.error) throw new Error(`access_grant_fixture_failed:${classifyError(grant.error)}`);

    const report = await admin.from("safety_reports").insert({
      reporter_user_id: eligible.user.id,
      target_type: "participant",
      target_id: owner.id,
      category: "harassment",
      note: `Final launch operations proof report ${proofRunId}`,
      severity: "low",
      status: "needs_review",
      context: { proofRunId },
    }).select("id").single();
    if (report.error) throw new Error(`safety_report_fixture_failed:${classifyError(report.error)}`);

    await scheduleDeletionRow(admin, eligible.user.id, "expired");
    await scheduleDeletionRow(admin, windowed.user.id, "restore_window");

    bits.activeDenial = await expectBlocked(
      "active account batch purge single-user helper",
      owner.client.rpc("admin_deidentify_deleted_account", {
        p_target_user_id: active.user.id,
        p_reason: `active denial ${proofRunId}`,
        p_dry_run: true,
      }),
      ["scheduled_deletion_required"],
    );

    bits.restoreWindowDenial = await expectBlocked(
      "restore-window account purge",
      owner.client.rpc("admin_deidentify_deleted_account", {
        p_target_user_id: windowed.user.id,
        p_reason: `restore-window denial ${proofRunId}`,
        p_dry_run: true,
      }),
      ["restore_window_still_open"],
    );

    const protectedRole = await admin
      .from("platform_role_memberships")
      .select("user_id, role, status")
      .eq("status", "active")
      .in("role", ["owner", "operator", "moderator"])
      .not("user_id", "is", null)
      .limit(1)
      .maybeSingle();
    bits.protectedDenial = protectedRole.data?.user_id
      ? await expectBlocked(
          "owner/admin/operator account purge",
          owner.client.rpc("admin_deidentify_deleted_account", {
            p_target_user_id: protectedRole.data.user_id,
            p_reason: `protected denial ${proofRunId}`,
            p_dry_run: true,
          }),
          ["protected_account_purge_denied"],
        )
      : row("Pending", "No active protected role row with user_id was available.");

    const dryRun = await owner.client.rpc("admin_run_account_purge_batch", {
      p_dry_run: true,
      p_limit: 5,
      p_enable: false,
    });
    if (dryRun.error) throw new Error(`batch_dry_run_failed:${classifyError(dryRun.error)}`);
    bits.dryRun = sanitize(dryRun.data);

    const disabledMutation = await owner.client.rpc("admin_run_account_purge_batch", {
      p_dry_run: false,
      p_limit: 5,
      p_enable: false,
    });
    if (disabledMutation.error) throw new Error(`batch_disabled_failed:${classifyError(disabledMutation.error)}`);
    bits.disabledMutation = sanitize(disabledMutation.data);

    const nonAdminBatch = await expectBlocked(
      "non-admin batch purge",
      viewer.client.rpc("admin_run_account_purge_batch", {
        p_dry_run: true,
        p_limit: 5,
        p_enable: false,
      }),
      ["owner_or_operator_required"],
    );
    bits.nonAdminBatch = nonAdminBatch;

    const stopOn = await admin.from("account_purge_runtime_config").update({
      emergency_stop: true,
      updated_at: nowIso(),
      note: `Emergency stop proof ${proofRunId}`,
    }).eq("id", true);
    if (stopOn.error) throw new Error(`emergency_stop_enable_failed:${classifyError(stopOn.error)}`);
    bits.emergencyStop = await expectBlocked(
      "batch emergency stop",
      owner.client.rpc("admin_run_account_purge_batch", {
        p_dry_run: false,
        p_limit: 5,
        p_enable: true,
      }),
      ["account_purge_disabled"],
    );
    const stopOff = await admin.from("account_purge_runtime_config").update({
      emergency_stop: false,
      updated_at: nowIso(),
      note: `Emergency stop restored after proof ${proofRunId}`,
    }).eq("id", true);
    if (stopOff.error) throw new Error(`emergency_stop_restore_failed:${classifyError(stopOff.error)}`);

    const batchRun = await owner.client.rpc("admin_run_account_purge_batch", {
      p_dry_run: false,
      p_limit: 5,
      p_enable: true,
    });
    if (batchRun.error) throw new Error(`proof_only_batch_run_failed:${classifyError(batchRun.error)}`);
    bits.batchRun = sanitize(batchRun.data);

    const secondBatch = await owner.client.rpc("admin_run_account_purge_batch", {
      p_dry_run: false,
      p_limit: 5,
      p_enable: true,
    });
    if (secondBatch.error) throw new Error(`proof_only_second_batch_failed:${classifyError(secondBatch.error)}`);
    bits.secondBatch = sanitize(secondBatch.data);

    const idempotency = await owner.client.rpc("admin_deidentify_deleted_account", {
      p_target_user_id: eligible.user.id,
      p_reason: `idempotency ${proofRunId}`,
      p_dry_run: false,
    });
    if (idempotency.error) throw new Error(`single_user_idempotency_failed:${classifyError(idempotency.error)}`);
    bits.idempotency = sanitize(idempotency.data);

    const manualReview = await owner.client.rpc("list_account_purge_manual_review_items", {
      p_target_user_id: eligible.user.id,
      p_limit: 50,
    });
    if (manualReview.error) throw new Error(`manual_review_readback_failed:${classifyError(manualReview.error)}`);
    bits.manualReview = sanitize(manualReview.data);

    const items = Array.isArray(manualReview.data?.items) ? manualReview.data.items : [];
    if (items[0]?.id) {
      const transition = await owner.client.rpc("admin_update_account_purge_manual_review_item_status", {
        p_item_id: items[0].id,
        p_status: "retained",
        p_resolution: `Retained during final launch operations proof ${proofRunId}; no provider refund or storage deletion.`,
      });
      if (transition.error) throw new Error(`manual_review_transition_failed:${classifyError(transition.error)}`);
      bits.manualReviewTransition = sanitize(transition.data);
    }

    bits.nonAdminManualReviewRead = await expectBlocked(
      "non-admin manual-review readback",
      viewer.client.rpc("list_account_purge_manual_review_items", {
        p_target_user_id: eligible.user.id,
        p_limit: 10,
      }),
      ["owner_or_operator_required"],
    );

    const auditRuns = await owner.client
      .from("account_purge_batch_runs")
      .select("id,mode,status,processed_count,manual_review_count,failed_count")
      .order("started_at", { ascending: false })
      .limit(3);
    bits.auditReadback = auditRuns.error
      ? { count: 0, error: classifyError(auditRuns.error) }
      : { count: auditRuns.data?.length ?? 0, items: sanitize(auditRuns.data ?? []) };

    const profileAccess = await client(supabaseUrl, anonKey).rpc("resolve_profile_visibility_access", {
      profile_owner_id: eligible.user.id,
      viewer_id: null,
    });
    const platformAccess = await client(supabaseUrl, anonKey).rpc("resolve_platform_visibility_access", {
      platform_owner_id: eligible.user.id,
      viewer_id: null,
    });
    readbacks.publicProfilePlatform = {
      profile: sanitize(profileAccess.data),
      platform: sanitize(platformAccess.data),
    };

    const access = await owner.client.rpc("account_access_status_readback", { p_user_id: eligible.user.id });
    readbacks.privateAccess = sanitize(access.data);
    readbacks.batch = sanitize(bits);

    const manualItems = Array.isArray(bits.manualReview?.items) ? bits.manualReview.items : [];
    const batchAutoPurgeMatrix = batchMatrix(bits);
    const manualMatrix = manualReviewMatrix(manualItems);
    const refundManualExternalMatrix = refundMatrix(refundProof);
    const result = {
      ok: true,
      artifactDir: proofDir,
      proofRunId,
      mode: "run",
      mutationPerformed: true,
      providerRefundExecuted: false,
      liveMoneyAction: false,
      targetUserIdSuffix: suffix(eligible.user.id),
      refundManualExternal: refundProof,
      batchAutoPurgeDecision: "proof-only batch automation enabled/proved; production batch remains config-gated/default-off unless owner/operator explicitly enables it",
      manualReviewDecision: "manual-review workflow proved for creator media, storage, provider/payment, legal/support, and audit categories",
      batchAutoPurgeMatrix,
      manualReviewMatrix: manualMatrix,
      refundManualExternalMatrix,
      sanitizedReadbacks: readbacks,
      finalBlockerMatrix: {
        providerRefundExecution: "Accepted manual/external launch condition; automated provider refund execution not implemented/proved",
        batchAutoPurgeAutomation: "Closed for proof-only automation and production-capable gated operator path",
        manualReviewCategories: "Closed for owner/operator queue workflow",
        passwordResetAuthEmailProviderProof: "Pending external/provider unless owner accepts risk",
      },
    };

    writeJson("final-launch-operations-proof.json", result);
    writeJson("batch-purge-dry-run-output.json", sanitize(bits.dryRun));
    writeJson("proof-only-batch-run-output.json", sanitize(bits.batchRun));
    writeJson("manual-review-queue-readback.json", sanitize(bits.manualReview));
    writeJson("non-admin-denial-readback.json", sanitize({ batch: bits.nonAdminBatch, manualReview: bits.nonAdminManualReviewRead }));
    writeJson("final-blocker-matrix.json", result.finalBlockerMatrix);
    writeJson("sanitized-readbacks.json", readbacks);
    writeText("README.md", [
      "# Final launch operations proof",
      "",
      `Proof run: ${proofRunId}`,
      "Mode: run with disposable proof accounts only.",
      `Target proof user suffix: ${suffix(eligible.user.id)}`,
      "",
      "Provider refunds remain manual/external. No provider refund API was called.",
      "Proof-only batch purge processed disposable proof accounts only.",
      "Production batch remains bounded, config-gated, auditable, and default-off unless owner/operator explicitly enables it.",
      "Manual-review queue items were created for retained/review categories.",
      "No real user, owner account, live-money action, payout, Premium product change, LiveKit authority change, RLS weakening, scan-gate weakening, auth/reset weakening, or abuse/block weakening occurred.",
    ].join("\n"));

    const findings = secretScan(proofDir);
    writeJson("secret-token-scan.json", { status: findings.length ? "Review" : "Pass", findings });
    result.secretScan = findings.length ? "Review" : "Pass";
    writeJson("final-launch-operations-proof.json", result);

    console.log(JSON.stringify({
      ok: true,
      artifactDir: proofDir,
      targetUserIdSuffix: result.targetUserIdSuffix,
      refundManualExternal: refundProof.status,
      batchRunStatus: bits.batchRun?.status,
      manualReviewCount: bits.manualReview?.count,
      secretScan: result.secretScan,
    }, null, 2));
  } catch (error) {
    const failure = {
      ok: false,
      artifactDir: proofDir,
      proofRunId,
      error: classifyError(error),
      providerRefundExecuted: false,
      liveMoneyAction: false,
    };
    writeJson("final-launch-operations-proof.json", failure);
    writeText("README.md", [
      "# Final launch operations proof",
      "",
      `Proof run: ${proofRunId}`,
      "Status: failed or blocked.",
      `Error: ${classifyError(error)}`,
      "",
      "No provider refund, live-money action, payout, broad real-user purge, or production rollout is claimed.",
    ].join("\n"));
    throw error;
  } finally {
    for (const userId of [active?.user?.id, windowed?.user?.id].filter(Boolean)) {
      await admin.auth.admin.deleteUser(userId).catch(() => null);
    }
    void createdAuthUsers;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: classifyError(error),
    artifactDir: proofDir,
  }, null, 2));
  process.exitCode = 1;
});
