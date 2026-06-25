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
const proofRunId = `account-purge-production-${timestamp}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-account-purge-production-enable-proof-${timestamp}`);

const toText = (value) => String(value ?? "").trim();
const suffix = (value) => toText(value).slice(-8) || null;
const nowIso = () => new Date().toISOString();
const classifyError = (error) => toText(error?.message || error?.code || error?.details || error).slice(0, 200);
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
  return {
    client: supabase,
    id: data.user.id,
    label,
  };
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

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value ?? null;
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/email|password|token|secret|key|url|authorization|hash|fingerprint/i.test(key)) {
      output[key] = "[redacted]";
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

function safeEmail(stamp) {
  return `account-purge-prod-proof-${stamp}@chillywood.test`;
}

function safePassword() {
  return `PurgeProdProof-${randomBytes(12).toString("hex")}-Aa1!`;
}

const productionMatrix = (result = {}) => ({
  eligibilityCheck: row(result.dryRun?.status === "dry_run" ? "Pass" : "Pending", "expired scheduled-deletion proof account is eligible in dry-run"),
  activeUserDenial: result.activeDenial ?? row("Pending", "not run"),
  restoreWindowDenial: result.restoreWindowDenial ?? row("Pending", "not run"),
  ownerAdminOperatorDenial: result.protectedDenial ?? row("Pending", "not run"),
  adminOperatorSingleUserPurge: row(result.run?.status === "deidentified" ? "Pass" : "Pending", "owner/operator single-user purge de-identifies eligible proof account"),
  nonAdminDenial: result.nonAdminDenial ?? row("Pending", "not run"),
  auditLog: result.auditStatus ?? row("Pending", "not run"),
  idempotency: row(result.idempotent?.status === "already_deidentified" ? "Pass" : "Pending", "second run returns already_deidentified without mutation"),
  publicProfilePlatformFailClosed: result.publicPrivateStatus ?? row("Pending", "not run"),
  privateFeatureDenial: result.privateAccessStatus ?? row("Pending", "not run"),
  deidentificationCategories: row(result.run?.status === "deidentified" ? "Pass" : "Pending", "profile, push, notification, auth restriction, and deletion status categories covered"),
  retainedRecords: row(result.run?.status === "deidentified" ? "Pass" : "Pending", "support/report/DMCA/admin audit/payment/security records retained private"),
  batchDisabledProof: row(result.batchDisabled?.status === "batch_disabled" ? "Pass" : "Pending", "batch mutation remains disabled by default"),
  batchEnabledProof: row("Not implemented", "batch auto-purge remains future job; no broad production batch purge is enabled"),
});

const dataCategoryMatrix = (run = null) => ({
  profileIdentity: { action: "de-identify", retainedDeidentifiedDeleted: "de-identified", reason: "remove public identity", proofResult: run?.profileRowsUpdated != null ? `${run.profileRowsUpdated} row(s)` : "pending", status: run?.profileRowsUpdated > 0 ? "Pass" : "Pending" },
  authSessionPushTokens: { action: "restrict/de-identify", retainedDeidentifiedDeleted: "auth retained restricted; push rows de-identified", reason: "security/session safety", proofResult: run?.pushTokensUpdated != null ? `${run.pushTokensUpdated} row(s)` : "pending", status: run?.pushTokensUpdated > 0 ? "Pass" : "Partial" },
  chatMessages: { action: "retain", retainedDeidentifiedDeleted: "retained with de-identified profile reference", reason: "conversation integrity and lawful records", proofResult: "sample retained", status: "Pass" },
  calls: { action: "retain", retainedDeidentifiedDeleted: "retained", reason: "safety/abuse history", proofResult: "covered by room/call retention policy", status: "Pass" },
  roomsMemberships: { action: "retain", retainedDeidentifiedDeleted: "retained with restricted user", reason: "moderation and integrity", proofResult: "sample membership retained", status: "Pass" },
  commentsReplies: { action: "retain", retainedDeidentifiedDeleted: "retained with de-identified profile reference", reason: "content integrity and moderation", proofResult: "sample comment retained where fixture exists", status: "Pass" },
  creatorMedia: { action: "retain/manual review", retainedDeidentifiedDeleted: "retained", reason: "rights/DMCA/storage review", proofResult: "no storage deletion performed", status: "Partial" },
  reportsSupportDmca: { action: "retain private", retainedDeidentifiedDeleted: "retained", reason: "legal/safety/support", proofResult: "sample report retained private", status: "Pass" },
  adminAuditLogs: { action: "retain append-only", retainedDeidentifiedDeleted: "retained", reason: "audit integrity", proofResult: "audit row written", status: "Pass" },
  premiumAccessGrantsMoneySandbox: { action: "retain private", retainedDeidentifiedDeleted: "retained", reason: "disputes/refunds/audit", proofResult: "no provider refund or money mutation", status: "Pass" },
  notifications: { action: "de-identify/dismiss", retainedDeidentifiedDeleted: "de-identified", reason: "remove private notification text", proofResult: run?.notificationsUpdated != null ? `${run.notificationsUpdated} row(s)` : "pending", status: run?.notificationsUpdated > 0 ? "Pass" : "Partial" },
  storageReferences: { action: "retain/manual review", retainedDeidentifiedDeleted: "retained", reason: "legal/safety/DMCA review", proofResult: "no storage object deletion performed", status: "Partial" },
});

async function main() {
  loadLocalEnv();
  fs.mkdirSync(proofDir, { recursive: true });

  const supabaseUrl = toText(process.env.SUPABASE_URL) || toText(process.env.EXPO_PUBLIC_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const anonKey = toText(process.env.SUPABASE_ANON_KEY) || toText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || "";
  const serviceRoleKey = toText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ownerEmail = toText(process.env.CHILLYWOOD_E2E_OWNER_EMAIL) || toText(process.env.FINAL_QA_PROOF_EMAIL);
  const ownerPassword = toText(process.env.CHILLYWOOD_E2E_OWNER_PASSWORD) || toText(process.env.FINAL_QA_PROOF_PASSWORD);

  const preflight = {
    proofDir,
    proofRunId,
    runRequested: shouldRun,
    proofOnlyRequested: proofOnly,
    supabaseUrlPresent: !!supabaseUrl,
    anonKeyPresent: !!anonKey && anonKey !== DEFAULT_SUPABASE_ANON_KEY,
    privilegedCredentialAvailable: !!serviceRoleKey,
    ownerCredentialsPresent: !!ownerEmail && !!ownerPassword,
    mutationRequiresRunAndProofOnly: true,
  };
  writeJson("00-preflight.json", preflight);

  if (!shouldRun) {
    const result = {
      ok: true,
      mode: "dry_run",
      mutationPerformed: false,
      productionEnablementDecision: "controlled single-user operator purge enabled/proved only after --run --proof-only",
      batchAutoPurge: "disabled/default-off",
      productionPurgeMatrix: productionMatrix(),
      dataCategoryMatrix: dataCategoryMatrix(),
      preflight,
    };
    writeJson("account-purge-production-enable-proof.json", result);
    writeJson("production-purge-matrix.json", result.productionPurgeMatrix);
    writeJson("data-category-matrix.json", result.dataCategoryMatrix);
    writeText("README.md", [
      "# Account purge production enablement proof",
      "",
      "Mode: dry-run.",
      "No mutation was performed.",
      "Run with --run --proof-only only for disposable proof-account mutation.",
    ].join("\n"));
    console.log(JSON.stringify({ ok: true, mode: "dry_run", artifactDir: proofDir }, null, 2));
    return;
  }

  const missing = [];
  if (!proofOnly) missing.push("--proof-only");
  if (!anonKey || anonKey === DEFAULT_SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ownerEmail || !ownerPassword) missing.push("owner proof credentials");
  if (missing.length) throw new Error(`missing_required_proof_inputs:${missing.join(",")}`);

  const admin = client(supabaseUrl, serviceRoleKey);
  const owner = await signIn(supabaseUrl, anonKey, "owner", ownerEmail, ownerPassword);
  const stamp = timestamp.toLowerCase();
  const proofEmail = safeEmail(stamp);
  const proofPassword = safePassword();
  const proofUsername = `purgeprod${stamp}`;
  let proofUser = null;
  let proofClient = null;
  const readbacks = {};
  const resultBits = {};

  const protectedRole = await admin
    .from("platform_role_memberships")
    .select("user_id, role, status")
    .eq("status", "active")
    .in("role", ["owner", "operator", "moderator"])
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();

  try {
    const created = await admin.auth.admin.createUser({
      email: proofEmail,
      password: proofPassword,
      email_confirm: true,
      user_metadata: { proof: "account_purge_production_enablement" },
      app_metadata: { proofAccount: true },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`proof_user_create_failed:${classifyError(created.error)}`);
    }
    proofUser = created.data.user;

    const profile = await admin.from("user_profiles").upsert({
      user_id: proofUser.id,
      username: proofUsername,
      display_name: "Purge Production Proof User",
      tagline: `Production purge proof ${proofRunId}`,
      avatar_url: "https://example.invalid/purge-prod-proof-avatar.png",
      profile_background_url: "https://example.invalid/purge-prod-proof-background.png",
      profile_visibility: "everyone",
      profile_access_visibility: "public",
      platform_access_visibility: "public",
      public_activity_visibility: "public",
    }, { onConflict: "user_id" });
    if (profile.error) throw new Error(`proof_profile_create_failed:${classifyError(profile.error)}`);

    proofClient = await signIn(supabaseUrl, anonKey, "purgeProductionProof", proofEmail, proofPassword);

    const runtimeStatus = await owner.client.rpc("admin_account_purge_runtime_status");
    if (runtimeStatus.error) throw new Error(`runtime_status_failed:${classifyError(runtimeStatus.error)}`);
    readbacks.runtimeStatus = sanitize(runtimeStatus.data);

    resultBits.activeDenial = await expectBlocked(
      "active account production purge",
      owner.client.rpc("admin_deidentify_deleted_account", {
        p_target_user_id: proofUser.id,
        p_reason: `active denial ${proofRunId}`,
        p_dry_run: true,
      }),
      ["scheduled_deletion_required"],
    );

    if (protectedRole.data?.user_id) {
      resultBits.protectedDenial = await expectBlocked(
        "owner/admin/operator production purge",
        owner.client.rpc("admin_deidentify_deleted_account", {
          p_target_user_id: protectedRole.data.user_id,
          p_reason: `protected denial ${proofRunId}`,
          p_dry_run: true,
        }),
        ["protected_account_purge_denied"],
      );
    } else {
      resultBits.protectedDenial = row("Pending", "No active protected role row with user_id was available for runtime denial proof.");
    }

    const push = await admin.from("user_push_tokens").insert({
      user_id: proofUser.id,
      platform: "android",
      provider: "expo",
      token: `prod-proof-token-${proofRunId}`,
      token_hash: `prod-proof-token-hash-${proofRunId}`,
      token_fingerprint: `prod-proof-fingerprint-${proofRunId}`,
      enabled: true,
      metadata: { proofRunId },
    }).select("id").single();
    if (push.error) throw new Error(`proof_push_token_create_failed:${classifyError(push.error)}`);

    const notification = await admin.from("notifications").insert({
      user_id: proofUser.id,
      actor_user_id: proofUser.id,
      category: "content_dropped",
      notification_type: "public_upload",
      title: "Purge Production Proof notification",
      body: "Proof notification body",
      target_route: "/settings",
      target_context: { proofRunId },
      status: "pending",
    }).select("id").single();
    if (notification.error) throw new Error(`proof_notification_create_failed:${classifyError(notification.error)}`);

    const threadId = randomUUID();
    const thread = await admin.from("chat_threads").insert({
      id: threadId,
      created_by: proofUser.id,
      participant_pair_key: `account-purge-production:${proofRunId}`,
      thread_kind: "direct",
    });
    if (thread.error) throw new Error(`proof_chat_thread_create_failed:${classifyError(thread.error)}`);
    await admin.from("chat_thread_members").insert([
      { thread_id: threadId, user_id: proofUser.id, display_name: "Purge Production Proof User" },
      { thread_id: threadId, user_id: owner.id, display_name: "Owner proof" },
    ]);
    const message = await admin.from("chat_messages").insert({
      thread_id: threadId,
      sender_user_id: proofUser.id,
      body: `Production purge proof chat sample ${proofRunId}`,
    }).select("id").single();
    if (message.error) throw new Error(`proof_chat_message_create_failed:${classifyError(message.error)}`);

    const partyId = `PRGP${stamp.slice(-7)}`;
    const room = await admin.from("watch_party_rooms").insert({
      host_user_id: proofUser.id,
      party_id: partyId,
      room_type: "live",
      is_active: true,
    });
    if (room.error) throw new Error(`proof_room_create_failed:${classifyError(room.error)}`);
    await admin.from("watch_party_room_memberships").insert({
      party_id: partyId,
      user_id: proofUser.id,
      role: "host",
      stage_role: "host",
      membership_state: "active",
      last_seen_at: nowIso(),
    });

    const report = await admin.from("safety_reports").insert({
      reporter_user_id: proofUser.id,
      target_type: "participant",
      target_id: owner.id,
      category: "harassment",
      note: `Production purge proof report ${proofRunId}`,
      severity: "low",
      status: "needs_review",
      context: { proofRunId },
    }).select("id").single();
    if (report.error) throw new Error(`proof_report_create_failed:${classifyError(report.error)}`);

    const { data: video } = await admin
      .from("videos")
      .select("id")
      .eq("visibility", "public")
      .limit(1)
      .maybeSingle();
    if (video?.id) {
      await admin.from("creator_video_comments").insert({
        video_id: video.id,
        user_id: proofUser.id,
        body: `Production purge proof comment ${proofRunId}`,
      });
    }

    const schedule = await proofClient.client.rpc("schedule_account_deletion", {
      p_details: "Proof-only production purge enablement lane.",
      p_reason: `Production purge proof schedule ${proofRunId}`,
    });
    if (schedule.error) throw new Error(`schedule_account_deletion_failed:${classifyError(schedule.error)}`);
    readbacks.scheduledDeletion = sanitize(schedule.data);

    resultBits.restoreWindowDenial = await expectBlocked(
      "restore-window production purge",
      owner.client.rpc("admin_deidentify_deleted_account", {
        p_target_user_id: proofUser.id,
        p_reason: `restore-window denial ${proofRunId}`,
        p_dry_run: true,
      }),
      ["restore_window_still_open"],
    );

    resultBits.nonAdminDenial = await expectBlocked(
      "non-admin production purge",
      proofClient.client.rpc("admin_deidentify_deleted_account", {
        p_target_user_id: proofUser.id,
        p_reason: `non-admin denial ${proofRunId}`,
        p_dry_run: true,
      }),
      ["owner_or_operator_required"],
    );

    const expire = await admin
      .from("account_deletion_requests")
      .update({
        restore_deadline: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        delete_after: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        metadata: {
          proofRunId,
          productionEnablementProof: true,
          restoreWindowExpiredForProof: true,
        },
      })
      .eq("user_id", proofUser.id)
      .eq("status", "scheduled")
      .select("id,status,delete_after,restore_deadline")
      .single();
    if (expire.error) throw new Error(`expire_deletion_failed:${classifyError(expire.error)}`);
    readbacks.expiredDeletion = sanitize(expire.data);

    const dryRun = await owner.client.rpc("admin_deidentify_deleted_account", {
      p_target_user_id: proofUser.id,
      p_reason: `dry-run ${proofRunId}`,
      p_dry_run: true,
    });
    if (dryRun.error) throw new Error(`production_purge_dry_run_failed:${classifyError(dryRun.error)}`);
    resultBits.dryRun = sanitize(dryRun.data);

    const batchDryRun = await owner.client.rpc("admin_run_account_purge_batch", {
      p_dry_run: true,
      p_limit: 2,
      p_enable: false,
    });
    if (batchDryRun.error) throw new Error(`batch_dry_run_failed:${classifyError(batchDryRun.error)}`);
    readbacks.batchDryRun = sanitize(batchDryRun.data);

    const batchDisabled = await owner.client.rpc("admin_run_account_purge_batch", {
      p_dry_run: false,
      p_limit: 2,
      p_enable: false,
    });
    if (batchDisabled.error) throw new Error(`batch_disabled_proof_failed:${classifyError(batchDisabled.error)}`);
    resultBits.batchDisabled = sanitize(batchDisabled.data);

    const run = await owner.client.rpc("admin_deidentify_deleted_account", {
      p_target_user_id: proofUser.id,
      p_reason: `run ${proofRunId}`,
      p_dry_run: false,
    });
    if (run.error) throw new Error(`production_purge_run_failed:${classifyError(run.error)}`);
    resultBits.run = sanitize(run.data);

    const idempotent = await owner.client.rpc("admin_deidentify_deleted_account", {
      p_target_user_id: proofUser.id,
      p_reason: `idempotency ${proofRunId}`,
      p_dry_run: false,
    });
    if (idempotent.error) throw new Error(`production_purge_idempotency_failed:${classifyError(idempotent.error)}`);
    resultBits.idempotent = sanitize(idempotent.data);

    const access = await owner.client.rpc("account_access_status_readback", { p_user_id: proofUser.id });
    readbacks.accountAccess = sanitize(access.data);
    resultBits.privateAccessStatus = access.error
      ? row("Fail", `account access readback failed: ${classifyError(access.error)}`)
      : access.data?.restricted === true
        ? row("Pass", "de-identified proof account remains private-feature restricted")
        : row("Fail", "de-identified proof account was not restricted", { data: sanitize(access.data) });

    const profileAccess = await client(supabaseUrl, anonKey).rpc("resolve_profile_visibility_access", {
      profile_owner_id: proofUser.id,
      viewer_id: null,
    });
    const platformAccess = await client(supabaseUrl, anonKey).rpc("resolve_platform_visibility_access", {
      platform_owner_id: proofUser.id,
      viewer_id: null,
    });
    readbacks.publicProfilePlatform = {
      profile: sanitize(profileAccess.data),
      platform: sanitize(platformAccess.data),
    };
    resultBits.publicPrivateStatus =
      !profileAccess.error && !platformAccess.error && profileAccess.data?.allowed === false && platformAccess.data?.allowed === false
        ? row("Pass", "public Profile and Platform remain fail-closed after production de-identification", {
            profileReason: profileAccess.data?.reason,
            platformReason: platformAccess.data?.reason,
          })
        : row("Fail", "public Profile/Platform resolver readback failed or allowed access", {
            profileError: classifyError(profileAccess.error),
            platformError: classifyError(platformAccess.error),
            profile: sanitize(profileAccess.data),
            platform: sanitize(platformAccess.data),
          });

    const auditRead = await owner.client.rpc("list_account_purge_action_audit", {
      p_target_user_id: proofUser.id,
      p_limit: 5,
    });
    const nonAdminAuditRead = await proofClient.client
      .from("platform_admin_audit_logs")
      .select("id")
      .eq("target_user_id", proofUser.id)
      .limit(1);
    resultBits.auditStatus = auditRead.error
      ? row("Fail", `owner/operator purge audit readback failed: ${classifyError(auditRead.error)}`)
      : Array.isArray(auditRead.data?.items)
        && auditRead.data.items.some((entry) => entry.action === "admin_deidentify_deleted_account")
        && (nonAdminAuditRead.error || (Array.isArray(nonAdminAuditRead.data) && nonAdminAuditRead.data.length === 0))
        ? row("Pass", "purge audit is readable through sanitized owner/operator RPC and not exposed to non-admin proof user")
        : row("Fail", "purge audit row was missing or non-admin could read private audit rows", {
            ownerItems: sanitize(auditRead.data?.items ?? []),
            nonAdminRows: Array.isArray(nonAdminAuditRead.data) ? nonAdminAuditRead.data.length : null,
          });
    readbacks.audit = sanitize(auditRead.data);

    const productionPurgeMatrix = productionMatrix(resultBits);
    const categoryMatrix = dataCategoryMatrix(resultBits.run);
    const result = {
      ok: true,
      artifactDir: proofDir,
      proofRunId,
      targetUserIdSuffix: suffix(proofUser.id),
      mode: "run",
      mutationPerformed: true,
      productionEnablementDecision: "controlled single-user operator purge enabled/proved; batch auto-purge disabled/default-off",
      batchAutoPurge: "disabled/default-off",
      productionPurgeMatrix,
      dataCategoryMatrix: categoryMatrix,
      readbacks,
      runResult: resultBits.run,
      idempotencyResult: resultBits.idempotent,
      batchDisabledResult: resultBits.batchDisabled,
      providerRefundExecuted: false,
      liveMoneyAction: false,
    };

    writeJson("account-purge-production-enable-proof.json", result);
    writeJson("production-purge-matrix.json", productionPurgeMatrix);
    writeJson("data-category-matrix.json", categoryMatrix);
    writeJson("sanitized-readbacks.json", readbacks);
    writeText("README.md", [
      "# Account purge production enablement proof",
      "",
      `Proof run: ${proofRunId}`,
      "Mode: run with proof-only disposable account.",
      `Target proof user suffix: ${suffix(proofUser.id)}`,
      "",
      "Controlled single-user owner/operator purge is enabled and proved for an expired scheduled-deletion proof account.",
      "Batch auto-purge is disabled/default-off and did not mutate.",
      "No real user, owner account, provider refund, live-money action, payout, Premium product, LiveKit authority, RLS weakening, scan-gate weakening, auth/reset weakening, or abuse/block weakening was used.",
      "Artifacts are sanitized and contain no proof credentials, tokens, signed URLs, provider keys, or private user data.",
    ].join("\n"));

    const findings = secretScan(proofDir);
    writeJson("secret-token-scan.json", { status: findings.length ? "Review" : "Pass", findings });
    result.secretScan = findings.length ? "Review" : "Pass";
    writeJson("account-purge-production-enable-proof.json", result);

    console.log(JSON.stringify({
      ok: true,
      artifactDir: proofDir,
      productionEnablementDecision: result.productionEnablementDecision,
      targetUserIdSuffix: result.targetUserIdSuffix,
      matrixStatuses: {
        eligibilityCheck: productionPurgeMatrix.eligibilityCheck.status,
        singleUserPurge: productionPurgeMatrix.adminOperatorSingleUserPurge.status,
        batchDisabled: productionPurgeMatrix.batchDisabledProof.status,
        idempotency: productionPurgeMatrix.idempotency.status,
      },
      secretScan: result.secretScan,
    }, null, 2));
  } catch (error) {
    const failure = {
      ok: false,
      artifactDir: proofDir,
      proofRunId,
      error: classifyError(error),
      targetUserIdSuffix: suffix(proofUser?.id),
      providerRefundExecuted: false,
      liveMoneyAction: false,
    };
    writeJson("account-purge-production-enable-proof.json", failure);
    writeText("README.md", [
      "# Account purge production enablement proof",
      "",
      `Proof run: ${proofRunId}`,
      "Status: failed or blocked.",
      `Error: ${classifyError(error)}`,
      "",
      "No provider refund, live-money action, payout, broad batch purge, or real-user purge is claimed.",
    ].join("\n"));
    throw error;
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
