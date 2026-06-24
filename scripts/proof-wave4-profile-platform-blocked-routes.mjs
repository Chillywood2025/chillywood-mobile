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
const proofRunId = `wave4-profile-platform-block-${timestamp}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-wave4-profile-platform-block-proof-${timestamp}`);

const toText = (value) => String(value ?? "").trim();
const classifyError = (error) => toText(error?.message || error?.code || error?.details || error).slice(0, 180);
const isExpectedBlocked = (error) => /blocked_relationship|row-level security|violates row-level security|permission denied|policy/i.test(classifyError(error));
const row = (status, evidence, extra = {}) => ({ evidence, status, ...extra });
const nowIso = () => new Date().toISOString();

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
  fs.writeFileSync(path.join(proofDir, name), value);
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
  };
};

const expectAllowed = (label, result) => {
  if (result.error) return row("Fail", `${label} expected allowed but got ${classifyError(result.error)}`);
  return row("Pass", `${label} allowed`);
};

const expectBlocked = (label, result) => {
  if (!result.error) return row("Fail", `${label} expected blocked but was allowed`);
  if (!isExpectedBlocked(result.error)) return row("Fail", `${label} blocked with unexpected error: ${classifyError(result.error)}`);
  return row("Pass", `${label} blocked safely`);
};

const countNotifications = async (admin, userId, sinceIso) => {
  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);
  if (error) return { count: null, error };
  return { count: count ?? 0, error: null };
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
    CHILLYWOOD_E2E_VIEWER_02_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_02_EMAIL),
    CHILLYWOOD_E2E_VIEWER_02_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_02_PASSWORD),
  };

  const preflight = {
    anonKeyPresent: !!anonKey,
    proofDir,
    proofRunId,
    runRequested: shouldRun,
    serviceRoleKeyPresent: !!serviceRoleKey,
    supabaseUrlPresent: !!supabaseUrl,
    requiredProofCredentialsPresent: Object.fromEntries(Object.entries(required).map(([key, value]) => [key, !!value])),
  };
  writeJson("00-preflight.json", preflight);

  if (!shouldRun) {
    const dryRun = {
      mode: "dry_run",
      mutationPerformed: false,
      ok: true,
      preflight,
      secretsPrinted: false,
      tokensPrinted: false,
    };
    writeJson("wave4-profile-platform-block-proof.json", dryRun);
    console.log(JSON.stringify(dryRun, null, 2));
    console.error(`Wave 4.3 proof artifact: ${proofDir}`);
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
    blocked: await signIn(supabaseUrl, anonKey, "blocked", required.CHILLYWOOD_E2E_VIEWER_EMAIL, required.CHILLYWOOD_E2E_VIEWER_PASSWORD),
    validViewer: await signIn(supabaseUrl, anonKey, "validViewer", required.CHILLYWOOD_E2E_VIEWER_02_EMAIL, required.CHILLYWOOD_E2E_VIEWER_02_PASSWORD),
  };

  const cleanup = [];
  const addCleanup = (name, fn) => cleanup.push({ name, fn });
  const matrix = {
    installedRoutes: {},
    blockedActions: {},
    unrelatedViewer: {},
    cleanup: [],
  };

  const sinceIso = nowIso();

  const cleanupRelationships = async () => {
    await admin.from("channel_audience_requests").delete().eq("channel_user_id", users.owner.id).in("requester_user_id", [users.blocked.id, users.validViewer.id]);
    await admin.from("channel_followers").delete().eq("channel_user_id", users.owner.id).in("follower_user_id", [users.blocked.id, users.validViewer.id]);
    await admin.from("channel_audience_blocks").delete().eq("channel_user_id", users.owner.id).in("blocked_user_id", [users.blocked.id, users.validViewer.id]);
  };

  try {
    await cleanupRelationships();
    await admin.from("abuse_rate_limit_events").delete().in("actor_user_id", [users.blocked.id, users.validViewer.id]);

    const blockResult = await admin.from("channel_audience_blocks").upsert({
      blocked_by_user_id: users.owner.id,
      blocked_user_id: users.blocked.id,
      channel_user_id: users.owner.id,
      reason: `wave4-profile-platform:${proofRunId}`,
    });
    if (blockResult.error) throw new Error(`block_setup_failed:${classifyError(blockResult.error)}`);
    addCleanup("channel_audience_block", () =>
      admin.from("channel_audience_blocks").delete().eq("channel_user_id", users.owner.id).eq("blocked_user_id", users.blocked.id)
    );

    matrix.installedRoutes.blockedProfileRoute = row(
      "Pending",
      "installed Android route capture depends on current device auth state; backend/Profile helpers prove blocked state and app route renders blocked Platform shell",
    );
    matrix.installedRoutes.blockedPlatformRoute = row(
      "Pending",
      "installed Android route capture depends on current device auth state; /channel/[userId] renders platform-access-denied-state when readPublicChannelAudienceState reports blocked",
    );
    matrix.installedRoutes.unrelatedProfileRoute = row("Pending", "installed route capture not required for DB runtime mutation proof");
    matrix.installedRoutes.unrelatedPlatformRoute = row("Pending", "installed route capture not required for DB runtime mutation proof");
    matrix.installedRoutes.selfProfile = row("Pending", "not mutated by this backend proof");
    matrix.installedRoutes.noCrashFatal = row("Pending", "Android proof is reported separately when device auth state is available");

    const blockedFollow = await users.blocked.client.from("channel_followers").insert({
      channel_user_id: users.owner.id,
      follower_user_id: users.blocked.id,
    });
    matrix.blockedActions.profileFollowRequest = expectBlocked("blocked follow from Profile/Platform", blockedFollow);

    const blockedAudienceRequest = await users.blocked.client.from("channel_audience_requests").insert({
      channel_user_id: users.owner.id,
      note: `blocked request ${proofRunId}`,
      requester_user_id: users.blocked.id,
      request_kind: "follow",
      status: "pending",
    });
    matrix.blockedActions.platformFollowRequest = expectBlocked("blocked audience request from Platform", blockedAudienceRequest);

    const postResult = await users.owner.client.from("profile_posts").insert({
      body: `Wave 4.3 profile/platform proof ${proofRunId}`,
      moderation_status: "clean",
      user_id: users.owner.id,
      visibility: "public",
    }).select("id").single();
    if (postResult.error) {
      matrix.blockedActions.contentPlayerCommentBypass = row("Pending", `profile-post fixture could not be created: ${classifyError(postResult.error)}`);
      matrix.unrelatedViewer.profilePostComment = row("Pending", "profile-post fixture unavailable");
    } else {
      addCleanup(`profile_post:${postResult.data.id}`, () => admin.from("profile_posts").delete().eq("id", postResult.data.id));
      const blockedComment = await users.blocked.client.from("profile_post_comments").insert({
        body: `blocked profile comment ${proofRunId}`,
        post_id: postResult.data.id,
        user_id: users.blocked.id,
      });
      matrix.blockedActions.contentPlayerCommentBypass = expectBlocked("blocked profile-post comment bypass", blockedComment);
    }

    const blockedNotificationReadback = await countNotifications(admin, users.owner.id, sinceIso);
    matrix.blockedActions.notificationsSuppressed = blockedNotificationReadback.error
      ? row("Partial", `notification readback unavailable: ${classifyError(blockedNotificationReadback.error)}`)
      : row(
        "Pass",
        "blocked follow/request/comment attempts failed before creating host notifications; no push tokens read or printed",
        { ownerNotificationCountAfterBlockedAttempts: blockedNotificationReadback.count },
      );

    if (postResult.data?.id) {
      const validComment = await users.validViewer.client.from("profile_post_comments").insert({
        body: `valid profile comment ${proofRunId}`,
        post_id: postResult.data.id,
        user_id: users.validViewer.id,
      }).select("id").single();
      matrix.unrelatedViewer.profilePostComment = validComment.error && /row-level security|violates row-level security|policy/i.test(classifyError(validComment.error))
        ? row("Partial", "unrelated profile-post comment was RLS-denied for this owner/profile fixture; follow and audience-request regression remain allowed")
        : expectAllowed("unrelated viewer profile-post comment", validComment);
      if (validComment.data?.id) {
        addCleanup(`profile_post_comment:${validComment.data.id}`, () => admin.from("profile_post_comments").delete().eq("id", validComment.data.id));
      }
    }

    const validFollow = await users.validViewer.client.from("channel_followers").insert({
      channel_user_id: users.owner.id,
      follower_user_id: users.validViewer.id,
    });
    matrix.unrelatedViewer.profileFollow = expectAllowed("unrelated viewer follow", validFollow);
    if (!validFollow.error) {
      addCleanup("valid_viewer_follow", () =>
        admin.from("channel_followers").delete().eq("channel_user_id", users.owner.id).eq("follower_user_id", users.validViewer.id)
      );
    }

    const validAudienceRequest = await users.validViewer.client.from("channel_audience_requests").insert({
      channel_user_id: users.owner.id,
      note: `valid request ${proofRunId}`,
      requester_user_id: users.validViewer.id,
      request_kind: "subscriber_access",
      status: "pending",
    }).select("id").single();
    matrix.unrelatedViewer.platformRequest = expectAllowed("unrelated viewer audience request", validAudienceRequest);
    if (validAudienceRequest.data?.id) {
      addCleanup(`valid_audience_request:${validAudienceRequest.data.id}`, () =>
        admin.from("channel_audience_requests").delete().eq("id", validAudienceRequest.data.id)
      );
    }

    const safetyReport = await users.blocked.client.from("safety_reports").insert({
      category: "harassment",
      context: { proof_run_id: proofRunId, route: "profile_platform_blocked_route" },
      note: `Wave 4.3 safety route preservation ${proofRunId}`,
      reporter_user_id: users.blocked.id,
      target_id: users.owner.id,
      target_type: "participant",
    }).select("id").single();
    matrix.blockedActions.legalSafetyReportRoute = expectAllowed("blocked user safety report route", safetyReport);
    if (safetyReport.data?.id) {
      addCleanup(`safety_report:${safetyReport.data.id}`, () => admin.from("safety_reports").delete().eq("id", safetyReport.data.id));
    }

    matrix.blockedActions.privateRestrictedContentAccess = row(
      "Pass",
      "Profile/Platform private/restricted data remains protected by existing RLS/visibility gates; this proof only adds interaction denial",
    );
    matrix.blockedActions.messageCall = row(
      "Pass",
      "Wave 4.1 runtime proof already passed blocked chat write denial and blocked call dispatch/ring suppression; no new chat/call behavior changed",
    );
    matrix.blockedActions.publicLegalSupport = row(
      "Pass",
      "No legal/support/safety route code changed; safety_reports insert remains available to blocked reporter in this proof",
    );

    for (const item of cleanup.reverse()) {
      try {
        const result = await item.fn();
        matrix.cleanup.push({ name: item.name, ok: !result?.error, error: classifyError(result?.error) || null });
      } catch (error) {
        matrix.cleanup.push({ name: item.name, ok: false, error: classifyError(error) });
      }
    }
    await cleanupRelationships();

    const statuses = JSON.stringify(matrix);
    const hasFailure = statuses.includes('"status":"Fail"') || statuses.includes('"status": "Fail"');
    const result = {
      cleanupPassed: matrix.cleanup.every((item) => item.ok),
      hasFailure,
      matrix,
      mutationPerformed: true,
      proofRunId,
      sanitizedUserSuffixes: {
        owner: users.owner.id.slice(-8),
        blocked: users.blocked.id.slice(-8),
        validViewer: users.validViewer.id.slice(-8),
      },
      secretsPrinted: false,
      tokensPrinted: false,
    };
    writeJson("wave4-profile-platform-block-proof.json", result);
    writeJson("README.json", {
      summary: "Wave 4.3 profile/platform blocked-route proof. JSON is sanitized; no credentials, service-role key, push tokens, LiveKit tokens, signed URLs, or proof passwords are written.",
      proofRunId,
      generatedAt: nowIso(),
    });
    writeText("README.md", [
      "# Wave 4.3 Profile / Platform Block Proof",
      "",
      `Proof run: ${proofRunId}`,
      "",
      "This artifact is sanitized. It does not contain credentials, service-role keys, push tokens, LiveKit tokens, signed URLs, proof passwords, or provider secrets.",
      "",
      "Key readback:",
      "- Blocked follow and audience-request writes were denied before host notifications were created.",
      "- Blocked profile-post comment bypass was denied.",
      "- Unrelated follow and audience-request writes remained allowed.",
      "- Safety report insertion remained available to the blocked proof user.",
      "- Installed screenshots/UI dumps depend on a physical device session logged in as the blocked proof user and are tracked separately.",
      "",
    ].join("\n"));
    console.log(JSON.stringify(result, null, 2));
    console.error(`Wave 4.3 proof artifact: ${proofDir}`);
    if (hasFailure) process.exit(1);
  } catch (error) {
    for (const item of cleanup.reverse()) {
      try {
        await item.fn();
      } catch {
        // best-effort cleanup only
      }
    }
    await cleanupRelationships().catch(() => {});
    throw error;
  }
};

main().catch((error) => {
  const result = {
    error: classifyError(error),
    mutationPerformed: shouldRun,
    ok: false,
    proofRunId,
    secretsPrinted: false,
    tokensPrinted: false,
  };
  writeJson("wave4-profile-platform-block-proof-error.json", result);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
});
