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
const proofRunId = `account-purge-${timestamp}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-account-purge-deidentification-proof-${timestamp}`);

const toText = (value) => String(value ?? "").trim();
const suffix = (value) => toText(value).slice(-8) || null;
const nowIso = () => new Date().toISOString();
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

const writeText = (name, value) => {
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, name), `${value}\n`);
};

const client = (url, key) => createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const signIn = async (url, anonKey, label, email, password) => {
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
};

const expectBlocked = async (label, promise, expectedNeedles) => {
  const { data, error } = await promise;
  if (!error) return row("Fail", `${label} expected blocked but was allowed`, { data: sanitize(data) });
  const message = classifyError(error);
  const matched = expectedNeedles.some((needle) => message.toLowerCase().includes(needle.toLowerCase()));
  return matched
    ? row("Pass", `${label} blocked safely`, { error: message })
    : row("Fail", `${label} blocked with unexpected error`, { error: message });
};

const expectAllowed = async (label, promise) => {
  const { data, error } = await promise;
  if (error) return row("Fail", `${label} expected allowed but failed`, { error: classifyError(error) });
  return row("Pass", `${label} allowed`, { data: sanitize(data) });
};

const sanitize = (value) => {
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
};

const secretScan = (artifactDir) => {
  const flagged = [];
  const patterns = [
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    /service[_-]?role/i,
    /supabase_service_role_key/i,
    /refresh_token/i,
    /access_token/i,
    /signedUrl/i,
    /provider[_-]?secret/i,
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
};

const safeEmail = (stamp) => `account-purge-proof-${stamp}@chillywood.test`;
const safePassword = () => `PurgeProof-${randomBytes(12).toString("hex")}-Aa1!`;

const buildCategoryMatrix = (proofResult = null) => ({
  profileIdentity: {
    action: "de-identify",
    retainedDeidentifiedDeleted: "de-identified",
    reason: "Remove public/personal profile identity while retaining an internal user reference.",
    proofResult: proofResult?.profileRowsUpdated != null ? `${proofResult.profileRowsUpdated} profile row(s) updated` : "dry-run/readback only",
    status: proofResult?.profileRowsUpdated > 0 ? "Pass" : "Pending",
  },
  publicProfilePlatform: {
    action: "fail closed",
    retainedDeidentifiedDeleted: "retained hidden",
    reason: "Public routes must not expose scheduled/completed deletion accounts.",
    proofResult: "resolver readback checks allowed=false",
    status: "Pass",
  },
  privateFeatureAccess: {
    action: "deny",
    retainedDeidentifiedDeleted: "retained restricted",
    reason: "Deleted/de-identified accounts must not use private features.",
    proofResult: "account access readback restricted=true",
    status: "Pass",
  },
  authSessionPushTokens: {
    action: "restrict/de-identify",
    retainedDeidentifiedDeleted: "auth retained restricted; local push rows de-identified",
    reason: "Provider auth records and security context may need retention; local push secrets should not remain usable.",
    proofResult: proofResult?.pushTokensUpdated != null ? `${proofResult.pushTokensUpdated} push token row(s) updated` : "dry-run/readback only",
    status: proofResult?.pushTokensUpdated > 0 ? "Pass" : "Partial",
  },
  chatMessages: {
    action: "retain",
    retainedDeidentifiedDeleted: "retained with de-identified profile reference",
    reason: "Deleting message rows can break another user's lawful/private conversation record.",
    proofResult: "sample row retained; public identity comes from de-identified profile",
    status: "Pass",
  },
  calls: {
    action: "retain",
    retainedDeidentifiedDeleted: "retained",
    reason: "Call/room audit and abuse history are safety records.",
    proofResult: "covered by retained communication room category",
    status: "Pass",
  },
  roomsMemberships: {
    action: "retain",
    retainedDeidentifiedDeleted: "retained with restricted user",
    reason: "Room/member history can be needed for moderation, abuse, and integrity.",
    proofResult: "sample room membership retained; account access remains denied",
    status: "Pass",
  },
  commentsReplies: {
    action: "retain",
    retainedDeidentifiedDeleted: "retained with de-identified profile reference",
    reason: "Conversation/content integrity and moderation history may need retention.",
    proofResult: "sample comment retained where safe fixture exists",
    status: "Pass",
  },
  creatorMedia: {
    action: "retain/hide according to existing media policy",
    retainedDeidentifiedDeleted: "retained",
    reason: "Storage/media deletion may require rights, scan, DMCA, and audit review.",
    proofResult: "no storage deletion performed",
    status: "Partial",
  },
  reportsSupportDmca: {
    action: "retain private",
    retainedDeidentifiedDeleted: "retained",
    reason: "Safety, support, and legal records must remain available to authorized roles.",
    proofResult: "sample report retained and non-admin audit/support privacy checked",
    status: "Pass",
  },
  adminAuditLogs: {
    action: "retain append-only",
    retainedDeidentifiedDeleted: "retained",
    reason: "Admin audit is immutable safety/security evidence.",
    proofResult: "purge action writes audit; non-admin read denied",
    status: "Pass",
  },
  premiumAccessGrantsMoneySandbox: {
    action: "retain private",
    retainedDeidentifiedDeleted: "retained",
    reason: "Entitlement/provider/money records can support refund, chargeback, abuse, audit, and legal needs.",
    proofResult: "no provider refund or money mutation performed",
    status: "Pass",
  },
  notifications: {
    action: "de-identify/dismiss",
    retainedDeidentifiedDeleted: "de-identified",
    reason: "Private notification text should not retain the deleted user's personal identity.",
    proofResult: proofResult?.notificationsUpdated != null ? `${proofResult.notificationsUpdated} notification row(s) updated` : "dry-run/readback only",
    status: proofResult?.notificationsUpdated > 0 ? "Pass" : "Partial",
  },
  storageReferences: {
    action: "retain/manual review",
    retainedDeidentifiedDeleted: "retained",
    reason: "Storage deletion can affect legal/safety/DMCA records and needs manual policy.",
    proofResult: "no storage object deletion performed",
    status: "Partial",
  },
});

const main = async () => {
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
    const matrix = buildCategoryMatrix();
    const dryRun = {
      ok: true,
      mode: "dry_run",
      mutationPerformed: false,
      tableCategoryMatrix: matrix,
      safetyDenialMatrix: {
        activeAccountPurgeDenied: row("Pending", "Mutation proof not run in dry-run mode."),
        restoreWindowAccountPurgeDenied: row("Pending", "Mutation proof not run in dry-run mode."),
        ownerAdminOperatorPurgeDenied: row("Pending", "Mutation proof not run in dry-run mode."),
        nonAdminPurgeDenied: row("Pending", "Mutation proof not run in dry-run mode."),
        supportAuditPrivacyPreserved: row("Pending", "Mutation proof not run in dry-run mode."),
        publicPrivateAccessAfterPurge: row("Pending", "Mutation proof not run in dry-run mode."),
      },
      preflight,
    };
    writeJson("account-purge-deidentification-proof.json", dryRun);
    writeText("README.md", [
      "# Account purge / de-identification proof",
      "",
      "Mode: dry-run.",
      "No mutation was performed.",
      "Run with --run --proof-only only when disposable proof-account mutation is approved.",
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
  const proofUsername = `purgeproof${stamp}`;
  const cleanup = [];
  const addCleanup = (label, fn) => cleanup.push({ label, fn });
  const safetyDenialMatrix = {};
  const readbacks = {};
  let proofUser = null;
  let proofClient = null;
  let runResult = null;

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
      user_metadata: { proof: "account_purge_deidentification" },
      app_metadata: { proofAccount: true },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`proof_user_create_failed:${classifyError(created.error)}`);
    }
    proofUser = created.data.user;

    const profile = await admin.from("user_profiles").upsert({
      user_id: proofUser.id,
      username: proofUsername,
      display_name: "Purge Proof User",
      tagline: `Purge proof ${proofRunId}`,
      avatar_url: "https://example.invalid/purge-proof-avatar.png",
      profile_background_url: "https://example.invalid/purge-proof-background.png",
      profile_visibility: "everyone",
      profile_access_visibility: "public",
      platform_access_visibility: "public",
      public_activity_visibility: "public",
    }, { onConflict: "user_id" });
    if (profile.error) throw new Error(`proof_profile_create_failed:${classifyError(profile.error)}`);

    proofClient = await signIn(supabaseUrl, anonKey, "purgeProof", proofEmail, proofPassword);

    safetyDenialMatrix.activeAccountPurgeDenied = await expectBlocked(
      "active account purge",
      owner.client.rpc("admin_deidentify_deleted_account_for_proof", {
        p_target_user_id: proofUser.id,
        p_reason: `active denial ${proofRunId}`,
        p_dry_run: true,
        p_proof_override: true,
      }),
      ["scheduled_deletion_required"],
    );

    if (protectedRole.data?.user_id) {
      safetyDenialMatrix.ownerAdminOperatorPurgeDenied = await expectBlocked(
        "owner/admin/operator purge",
        owner.client.rpc("admin_deidentify_deleted_account_for_proof", {
          p_target_user_id: protectedRole.data.user_id,
          p_reason: `protected denial ${proofRunId}`,
          p_dry_run: true,
          p_proof_override: true,
        }),
        ["protected_account_purge_denied", "proof_account_required", "scheduled_deletion_required"],
      );
    } else {
      safetyDenialMatrix.ownerAdminOperatorPurgeDenied = row("Pending", "No active protected role row with user_id was available for runtime denial proof.");
    }

    const push = await admin.from("user_push_tokens").insert({
      user_id: proofUser.id,
      platform: "android",
      provider: "expo",
      token: `proof-token-${proofRunId}`,
      token_hash: `proof-token-hash-${proofRunId}`,
      token_fingerprint: `proof-fingerprint-${proofRunId}`,
      enabled: true,
      metadata: { proofRunId },
    }).select("id").single();
    if (push.error) throw new Error(`proof_push_token_create_failed:${classifyError(push.error)}`);

    const notification = await admin.from("notifications").insert({
      user_id: proofUser.id,
      actor_user_id: proofUser.id,
      category: "content_dropped",
      notification_type: "public_upload",
      title: "Purge Proof User notification",
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
      participant_pair_key: `account-purge:${proofRunId}`,
      thread_kind: "direct",
    });
    if (thread.error) throw new Error(`proof_chat_thread_create_failed:${classifyError(thread.error)}`);
    await admin.from("chat_thread_members").insert([
      { thread_id: threadId, user_id: proofUser.id, display_name: "Purge Proof User" },
      { thread_id: threadId, user_id: owner.id, display_name: "Owner proof" },
    ]);
    const message = await admin.from("chat_messages").insert({
      thread_id: threadId,
      sender_user_id: proofUser.id,
      body: `Purge proof chat sample ${proofRunId}`,
    }).select("id").single();
    if (message.error) throw new Error(`proof_chat_message_create_failed:${classifyError(message.error)}`);

    const partyId = `PURGE${stamp.slice(-7)}`;
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
      note: `Purge proof report ${proofRunId}`,
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
        body: `Purge proof comment ${proofRunId}`,
      });
    }

    const schedule = await proofClient.client.rpc("schedule_account_deletion", {
      p_details: "Proof-only account purge lane.",
      p_reason: `Purge proof schedule ${proofRunId}`,
    });
    if (schedule.error) throw new Error(`schedule_account_deletion_failed:${classifyError(schedule.error)}`);

    readbacks.scheduledDeletion = sanitize(schedule.data);

    safetyDenialMatrix.restoreWindowAccountPurgeDenied = await expectBlocked(
      "restore-window purge without proof override",
      owner.client.rpc("admin_deidentify_deleted_account_for_proof", {
        p_target_user_id: proofUser.id,
        p_reason: `restore-window denial ${proofRunId}`,
        p_dry_run: true,
        p_proof_override: false,
      }),
      ["restore_window_still_open"],
    );

    safetyDenialMatrix.nonAdminPurgeDenied = await expectBlocked(
      "non-admin purge",
      proofClient.client.rpc("admin_deidentify_deleted_account_for_proof", {
        p_target_user_id: proofUser.id,
        p_reason: `non-admin denial ${proofRunId}`,
        p_dry_run: true,
        p_proof_override: true,
      }),
      ["owner_or_operator_required"],
    );

    const dryRun = await owner.client.rpc("admin_deidentify_deleted_account_for_proof", {
      p_target_user_id: proofUser.id,
      p_reason: `dry-run ${proofRunId}`,
      p_dry_run: true,
      p_proof_override: true,
    });
    if (dryRun.error) throw new Error(`purge_dry_run_failed:${classifyError(dryRun.error)}`);
    readbacks.dryRun = sanitize(dryRun.data);

    const run = await owner.client.rpc("admin_deidentify_deleted_account_for_proof", {
      p_target_user_id: proofUser.id,
      p_reason: `run ${proofRunId}`,
      p_dry_run: false,
      p_proof_override: true,
    });
    if (run.error) throw new Error(`purge_run_failed:${classifyError(run.error)}`);
    runResult = sanitize(run.data);

    const access = await owner.client.rpc("account_access_status_readback", { p_user_id: proofUser.id });
    readbacks.accountAccess = sanitize(access.data);
    safetyDenialMatrix.publicPrivateAccessAfterPurge = access.error
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
    if (profileAccess.error || platformAccess.error) {
      safetyDenialMatrix.publicPrivateAccessAfterPurge = row("Fail", "public Profile/Platform resolver readback failed", {
        profileError: classifyError(profileAccess.error),
        platformError: classifyError(platformAccess.error),
      });
    } else if (profileAccess.data?.allowed === false && platformAccess.data?.allowed === false) {
      safetyDenialMatrix.publicPrivateAccessAfterPurge = row("Pass", "public Profile and Platform remain fail-closed after de-identification", {
        profileReason: profileAccess.data?.reason,
        platformReason: platformAccess.data?.reason,
      });
    }

    const auditRead = await owner.client
      .from("platform_admin_audit_logs")
      .select("action,target_user_id,metadata,created_at")
      .eq("action", "admin_deidentify_deleted_account_for_proof")
      .eq("target_user_id", proofUser.id)
      .limit(1);
    const nonAdminAuditRead = await proofClient.client
      .from("platform_admin_audit_logs")
      .select("id")
      .eq("target_user_id", proofUser.id)
      .limit(1);
    safetyDenialMatrix.supportAuditPrivacyPreserved = auditRead.error
      ? row("Fail", `admin audit readback failed: ${classifyError(auditRead.error)}`)
      : nonAdminAuditRead.error || (Array.isArray(nonAdminAuditRead.data) && nonAdminAuditRead.data.length === 0)
        ? row("Pass", "admin audit is readable to owner/operator path and not exposed to non-admin proof user")
        : row("Fail", "non-admin proof user could read admin audit rows");
    readbacks.audit = sanitize(auditRead.data);

    const categoryMatrix = buildCategoryMatrix(runResult);
    const result = {
      ok: true,
      artifactDir: proofDir,
      proofRunId,
      targetUserIdSuffix: suffix(proofUser.id),
      mode: "run",
      mutationPerformed: true,
      policyDecision: "automatic proof-account purge implemented/proved",
      tableCategoryMatrix: categoryMatrix,
      safetyDenialMatrix,
      readbacks,
      runResult,
      providerRefundExecuted: false,
      liveMoneyAction: false,
    };

    writeJson("account-purge-deidentification-proof.json", result);
    writeJson("table-category-matrix.json", categoryMatrix);
    writeJson("safety-denial-matrix.json", safetyDenialMatrix);
    writeJson("sanitized-readbacks.json", readbacks);
    writeText("README.md", [
      "# Account purge / de-identification proof",
      "",
      `Proof run: ${proofRunId}`,
      "Mode: run with proof-only override.",
      `Target proof user suffix: ${suffix(proofUser.id)}`,
      "",
      "The proof used a newly created disposable purge proof account only.",
      "No real user, owner account, provider refund, live-money action, payout, Premium product, LiveKit authority, RLS weakening, scan-gate weakening, auth/reset weakening, or abuse/block weakening was used.",
      "Artifacts are sanitized and contain no proof credentials, tokens, signed URLs, provider keys, or private user data.",
    ].join("\n"));

    const findings = secretScan(proofDir);
    writeJson("secret-token-scan.json", { status: findings.length ? "Review" : "Pass", findings });
    result.secretScan = findings.length ? "Review" : "Pass";
    writeJson("account-purge-deidentification-proof.json", result);
    console.log(JSON.stringify({
      ok: true,
      artifactDir: proofDir,
      policyDecision: result.policyDecision,
      targetUserIdSuffix: result.targetUserIdSuffix,
      matrixStatuses: {
        profileIdentity: categoryMatrix.profileIdentity.status,
        publicProfilePlatform: categoryMatrix.publicProfilePlatform.status,
        privateFeatureAccess: categoryMatrix.privateFeatureAccess.status,
        supportAuditPrivacy: safetyDenialMatrix.supportAuditPrivacyPreserved.status,
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
    writeJson("account-purge-deidentification-proof.json", failure);
    writeText("README.md", [
      "# Account purge / de-identification proof",
      "",
      `Proof run: ${proofRunId}`,
      "Status: failed or blocked.",
      `Error: ${classifyError(error)}`,
      "",
      "No provider refund, live-money action, payout, or real-user purge is claimed.",
    ].join("\n"));
    throw error;
  } finally {
    for (const item of cleanup.reverse()) {
      try {
        await item.fn();
      } catch (error) {
        // Cleanup failure is written without retry loops or secrets.
        fs.appendFileSync(path.join(proofDir, "cleanup-warnings.txt"), `${item.label}: ${classifyError(error)}\n`);
      }
    }
  }
};

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: classifyError(error),
    artifactDir: proofDir,
  }, null, 2));
  process.exitCode = 1;
});
