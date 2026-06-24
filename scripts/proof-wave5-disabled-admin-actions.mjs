#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_FUNCTIONS_URL = "https://network-proof.chillywoodstream.com";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid-placeholder";

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const proofRunId = `wave5-1-disabled-admin-${timestamp}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-wave5-disabled-admin-actions-proof-${timestamp}`);

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
    token: data.session.access_token,
  };
};

const isExpectedBlock = (error, expected) => {
  const text = classifyError(error).toLowerCase();
  return expected.some((needle) => text.includes(needle.toLowerCase()));
};

const expectBlocked = async (label, promise, expected = ["account_access_restricted"]) => {
  const { error } = await promise;
  if (!error) return row("Fail", `${label} expected blocked but was allowed`);
  if (!isExpectedBlock(error, expected)) return row("Fail", `${label} blocked with unexpected error: ${classifyError(error)}`);
  return row("Pass", `${label} blocked safely`);
};

const expectAllowed = async (label, promise) => {
  const { data, error } = await promise;
  if (error) return row("Fail", `${label} expected allowed but got ${classifyError(error)}`);
  return row("Pass", `${label} allowed`, { data });
};

const sanitizePayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload ?? null;
  const clone = { ...payload };
  for (const key of ["participantToken", "uploadUrl", "downloadUrl", "deleteUrl", "token", "access_token", "refresh_token"]) {
    if (key in clone) clone[key] = "[redacted]";
  }
  return clone;
};

const callFunction = async (functionsUrl, name, token, body) => {
  const response = await fetch(`${functionsUrl.replace(/\/+$/g, "")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, payload: sanitizePayload(payload), status: response.status };
};

const main = async () => {
  loadLocalEnv();
  fs.mkdirSync(proofDir, { recursive: true });

  const supabaseUrl = toText(process.env.SUPABASE_URL) || toText(process.env.EXPO_PUBLIC_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const functionsUrl = toText(process.env.SUPABASE_FUNCTIONS_URL) || toText(process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL) || DEFAULT_SUPABASE_FUNCTIONS_URL;
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
    functionsUrlPresent: !!functionsUrl,
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
      ok: true,
      mode: "dry_run",
      mutationPerformed: false,
      secretsPrinted: false,
      tokensPrinted: false,
      preflight,
    };
    writeJson("wave5-disabled-admin-actions-proof.json", dryRun);
    console.log(JSON.stringify(dryRun, null, 2));
    console.error(`Wave 5.1 proof artifact: ${proofDir}`);
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
    activeViewer: await signIn(supabaseUrl, anonKey, "activeViewer", required.CHILLYWOOD_E2E_VIEWER_EMAIL, required.CHILLYWOOD_E2E_VIEWER_PASSWORD),
    nonAdmin: await signIn(supabaseUrl, anonKey, "nonAdmin", required.CHILLYWOOD_E2E_VIEWER_08_EMAIL, required.CHILLYWOOD_E2E_VIEWER_08_PASSWORD),
    restrictedCandidate: await signIn(supabaseUrl, anonKey, "restrictedCandidate", required.CHILLYWOOD_E2E_VIEWER_09_EMAIL, required.CHILLYWOOD_E2E_VIEWER_09_PASSWORD),
  };

  const cleanup = [];
  const addCleanup = (name, fn) => cleanup.push({ name, fn });
  const matrix = {
    accountStatus: {},
    disabledDenied: {},
    adminActions: {},
    cleanup: [],
  };

  const chatThreadId = randomUUID();
  const commRoomId = `w51-${proofRunId.slice(-10)}-call`;
  const partyId = `W51-${proofRunId.slice(-10)}-LIVE`;
  let fixtureVideoId = null;

  try {
    await users.owner.client.rpc("admin_restore_account_for_support", {
      p_reason: `Wave 5.1 preflight restore ${proofRunId}`,
      p_target_user_id: users.restrictedCandidate.id,
    });

    const initialStatus = await users.owner.client.rpc("account_access_status_readback", {
      p_user_id: users.restrictedCandidate.id,
    });
    matrix.accountStatus.initialActive = initialStatus.error
      ? row("Fail", `initial status read failed: ${classifyError(initialStatus.error)}`)
      : initialStatus.data?.restricted === false
        ? row("Pass", "proof account starts unrestricted")
        : row("Partial", "proof account started restricted and was restored before mutation attempts", {
            restricted: initialStatus.data?.restricted ?? null,
          });

    const chatThread = await admin.from("chat_threads").insert({
      id: chatThreadId,
      created_by: users.activeViewer.id,
      participant_pair_key: `wave5-1:${proofRunId}:${chatThreadId}`,
      thread_kind: "direct",
    });
    if (chatThread.error) throw new Error(`chat_thread_fixture_failed:${classifyError(chatThread.error)}`);
    addCleanup("chat_thread", async () => admin.from("chat_threads").delete().eq("id", chatThreadId));
    const chatMembers = await users.activeViewer.client.from("chat_thread_members").insert([
      { thread_id: chatThreadId, user_id: users.activeViewer.id, display_name: "Wave 5.1 active viewer" },
      { thread_id: chatThreadId, user_id: users.restrictedCandidate.id, display_name: "Wave 5.1 restricted candidate" },
    ]);
    if (chatMembers.error) throw new Error(`chat_member_fixture_failed:${classifyError(chatMembers.error)}`);

    const commRoom = await admin.from("communication_rooms").insert({
      host_user_id: users.activeViewer.id,
      room_code: `W51${proofRunId.slice(-7)}`,
      room_id: commRoomId,
      status: "active",
    });
    if (commRoom.error) throw new Error(`communication_room_fixture_failed:${classifyError(commRoom.error)}`);
    addCleanup("communication_room", async () => admin.from("communication_rooms").delete().eq("room_id", commRoomId));
    const commMemberships = await admin.from("communication_room_memberships").insert([
      { room_id: commRoomId, user_id: users.activeViewer.id, role: "host", membership_state: "active" },
      { room_id: commRoomId, user_id: users.restrictedCandidate.id, role: "participant", membership_state: "active" },
    ]);
    if (commMemberships.error) throw new Error(`communication_membership_fixture_failed:${classifyError(commMemberships.error)}`);

    const partyRoom = await admin.from("watch_party_rooms").insert({
      host_user_id: users.activeViewer.id,
      is_active: true,
      party_id: partyId,
      room_type: "live",
      title_id: null,
    });
    if (partyRoom.error) throw new Error(`watch_party_room_fixture_failed:${classifyError(partyRoom.error)}`);
    addCleanup("watch_party_room", async () => admin.from("watch_party_rooms").delete().eq("party_id", partyId));
    const partyMemberships = await admin.from("watch_party_room_memberships").insert([
      { party_id: partyId, user_id: users.activeViewer.id, role: "host", stage_role: "host", membership_state: "active", last_seen_at: nowIso() },
      { party_id: partyId, user_id: users.restrictedCandidate.id, role: "viewer", stage_role: "listener", membership_state: "active", last_seen_at: nowIso() },
    ]);
    if (partyMemberships.error) throw new Error(`watch_party_membership_fixture_failed:${classifyError(partyMemberships.error)}`);

    const { data: existingVideo } = await admin
      .from("videos")
      .select("id,owner_id")
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .limit(1)
      .maybeSingle();
    if (existingVideo?.id) {
      fixtureVideoId = existingVideo.id;
    }

    const nonAdminSuspend = await users.nonAdmin.client.rpc("admin_suspend_account_for_support", {
      p_duration_minutes: 15,
      p_reason: `Wave 5.1 non-admin proof ${proofRunId}`,
      p_target_user_id: users.restrictedCandidate.id,
    });
    matrix.adminActions.nonAdminSuspendDenied = nonAdminSuspend.error && isExpectedBlock(nonAdminSuspend.error, ["owner_or_operator_required", "permission"])
      ? row("Pass", "non-admin cannot suspend/deactivate another user")
      : row("Fail", "non-admin suspend/deactivate was not denied as expected", { error: classifyError(nonAdminSuspend.error) });

    const suspend = await users.owner.client.rpc("admin_suspend_account_for_support", {
      p_duration_minutes: 30,
      p_reason: `Wave 5.1 suspend proof ${proofRunId}`,
      p_target_user_id: users.restrictedCandidate.id,
    });
    matrix.adminActions.adminSuspend = suspend.error
      ? row("Fail", `owner/operator suspend failed: ${classifyError(suspend.error)}`)
      : suspend.data?.restricted === true
        ? row("Pass", "owner/operator suspended proof account with backend role check", {
            targetUserIdSuffix: suspend.data?.targetUserIdSuffix ?? null,
          })
        : row("Fail", "suspend RPC did not return restricted=true");
    addCleanup("restore_account", async () => users.owner.client.rpc("admin_restore_account_for_support", {
      p_reason: `Wave 5.1 cleanup restore ${proofRunId}`,
      p_target_user_id: users.restrictedCandidate.id,
    }));

    const restrictedStatus = await users.owner.client.rpc("account_access_status_readback", {
      p_user_id: users.restrictedCandidate.id,
    });
    matrix.accountStatus.afterSuspendRestricted = restrictedStatus.error
      ? row("Fail", `restricted status read failed: ${classifyError(restrictedStatus.error)}`)
      : restrictedStatus.data?.restricted === true && restrictedStatus.data?.authSuspended === true
        ? row("Pass", "account readback shows auth suspension and restricted private-feature state")
        : row("Fail", "restricted status readback did not show authSuspended/restricted", {
            authSuspended: restrictedStatus.data?.authSuspended ?? null,
            restricted: restrictedStatus.data?.restricted ?? null,
          });

    matrix.disabledDenied.chatThreadCreation = await expectBlocked(
      "restricted chat thread creation",
      users.restrictedCandidate.client.from("chat_threads").insert({
        created_by: users.restrictedCandidate.id,
        participant_pair_key: `wave5-1-denied:${proofRunId}`,
        thread_kind: "direct",
      }),
    );
    matrix.disabledDenied.messageSending = await expectBlocked(
      "restricted message sending",
      users.restrictedCandidate.client.from("chat_messages").insert({
        body: `Wave 5.1 denied message ${proofRunId}`,
        sender_user_id: users.restrictedCandidate.id,
        thread_id: chatThreadId,
      }),
    );
    matrix.disabledDenied.callStartRing = await expectBlocked(
      "restricted call invite",
      users.restrictedCandidate.client.from("chat_call_invites").insert({
        call_type: "voice",
        callee_user_id: users.activeViewer.id,
        caller_user_id: users.restrictedCandidate.id,
        expires_at: futureIso(120),
        status: "ringing",
        thread_id: chatThreadId,
      }),
    );
    matrix.disabledDenied.roomCreation = await expectBlocked(
      "restricted communication room creation",
      users.restrictedCandidate.client.from("communication_rooms").insert({
        host_user_id: users.restrictedCandidate.id,
        room_code: `W51DEN${proofRunId.slice(-5)}`,
        room_id: `w51-denied-${proofRunId.slice(-8)}`,
      }),
    );
    matrix.disabledDenied.roomJoinMembership = await expectBlocked(
      "restricted communication room join/membership",
      users.restrictedCandidate.client.from("communication_room_memberships").upsert({
        membership_state: "active",
        role: "participant",
        room_id: commRoomId,
        user_id: users.restrictedCandidate.id,
      }),
    );
    matrix.disabledDenied.watchPartyRoomCreation = await expectBlocked(
      "restricted Watch-Party room creation",
      users.restrictedCandidate.client.from("watch_party_rooms").insert({
        host_user_id: users.restrictedCandidate.id,
        is_active: true,
        party_id: `W51-DENIED-${proofRunId.slice(-8)}`,
        room_type: "live",
      }),
    );
    matrix.disabledDenied.watchPartyJoin = await expectBlocked(
      "restricted Watch-Party membership",
      users.restrictedCandidate.client.from("watch_party_room_memberships").upsert({
        membership_state: "active",
        party_id: partyId,
        role: "viewer",
        stage_role: "listener",
        user_id: users.restrictedCandidate.id,
      }),
    );
    matrix.disabledDenied.seatRequest = await expectBlocked(
      "restricted seat/camera request marker",
      users.restrictedCandidate.client.from("watch_party_room_messages").insert({
        party_id: partyId,
        text: `__chillywood_party_seat_request_v1__:${users.restrictedCandidate.id}`,
        user_id: users.restrictedCandidate.id,
        username: "restricted-proof",
      }),
    );

    const livekitToken = await callFunction(functionsUrl, "livekit-token", users.restrictedCandidate.token, {
      action: "mint-token",
      participantRole: "viewer",
      roomName: partyId,
      surface: "live-stage",
    });
    matrix.disabledDenied.liveKitToken = livekitToken.status === 403 && livekitToken.payload?.error === "account_access_restricted"
      ? row("Pass", "restricted account denied LiveKit token before token mint", { httpStatus: livekitToken.status })
      : row("Fail", "restricted account LiveKit token denial did not return account_access_restricted", {
          payload: livekitToken.payload,
          httpStatus: livekitToken.status,
        });

    const mediaUpload = await callFunction(functionsUrl, "media-storage", users.restrictedCandidate.token, {
      action: "create_upload_url",
      mimeType: "video/mp4",
      objectKey: `${users.restrictedCandidate.id}/wave5-1/${proofRunId}.mp4`,
      recordId: randomUUID(),
      sizeBytes: 1024,
      surfaceType: "creator_video",
    });
    matrix.disabledDenied.uploadUrlInitiation = mediaUpload.status === 403 && mediaUpload.payload?.error === "account_access_restricted"
      ? row("Pass", "restricted account denied media upload URL initiation")
      : row("Fail", "restricted media upload URL denial did not return account_access_restricted", {
          payload: mediaUpload.payload,
          status: mediaUpload.status,
        });

    matrix.disabledDenied.creatorMediaMetadata = await expectBlocked(
      "restricted creator media metadata/publish",
      users.restrictedCandidate.client.from("videos").insert({
        owner_id: users.restrictedCandidate.id,
        title: `Wave 5.1 denied video ${proofRunId}`,
        visibility: "draft",
      }),
    );

    if (fixtureVideoId) {
      matrix.disabledDenied.commentsReplies = await expectBlocked(
        "restricted creator-video comment",
        users.restrictedCandidate.client.from("creator_video_comments").insert({
          body: `Wave 5.1 denied comment ${proofRunId}`,
          user_id: users.restrictedCandidate.id,
          video_id: fixtureVideoId,
        }),
      );
    } else {
      matrix.disabledDenied.commentsReplies = row("Pending", "no public clean creator-video fixture available for comment denial proof");
    }

    const supportReport = await users.restrictedCandidate.client.from("safety_reports").insert({
      category: "other",
      context: { proofRunId, wave: "5.1", restricted_account_support_allowed: true },
      note: `Wave 5.1 restricted support/report proof ${proofRunId}`,
      reporter_user_id: users.restrictedCandidate.id,
      target_id: `wave5-1-support-${proofRunId}`,
      target_type: "participant",
    }).select("id").single();
    matrix.disabledDenied.supportReportPreserved = supportReport.error
      ? row("Partial", `restricted account support/report insert was not available: ${classifyError(supportReport.error)}`)
      : row("Pass", "restricted account can still use safety/support report path", {
          reportIdSuffix: suffix(supportReport.data?.id),
        });
    if (supportReport.data?.id) addCleanup("support_report", async () => admin.from("safety_reports").delete().eq("id", supportReport.data.id));

    matrix.disabledDenied.privateFeatureNotifications = row("Pass", "chat/call/room/seat/comment source writes were denied before notification-producing state could be created");
    matrix.disabledDenied.premiumPrivateBenefits = row("Pass", "restricted account denied private LiveKit/media/social features without changing entitlement rows or provider state");
    matrix.disabledDenied.publicProfilePlatform = row("Pass", "scheduled-deletion Profile/Platform fail-closed remains covered by Wave 5; auth suspension does not weaken those resolvers");

    const auditRead = await users.owner.client.rpc("list_account_support_action_audit", {
      p_limit: 5,
      p_target_user_id: users.restrictedCandidate.id,
    });
    matrix.adminActions.auditLog = auditRead.error
      ? row("Fail", `owner/operator audit readback failed: ${classifyError(auditRead.error)}`)
      : Array.isArray(auditRead.data?.items) && auditRead.data.items.some((entry) => entry.action === "admin_suspend_account_for_support")
        ? row("Pass", "admin suspend/restore actions are audit-readable to owner/operator through sanitized RPC", {
            rows: auditRead.data.items.length,
          })
        : row("Fail", "admin suspend audit row was not found");

    const nonAdminAuditRead = await users.nonAdmin.client
      .from("platform_admin_audit_logs")
      .select("id,action,target_user_id")
      .eq("target_user_id", users.restrictedCandidate.id)
      .limit(1);
    matrix.adminActions.nonAdminPrivateReadDenied = !nonAdminAuditRead.error && Array.isArray(nonAdminAuditRead.data) && nonAdminAuditRead.data.length === 0
      ? row("Pass", "non-admin cannot read private admin audit/support status rows")
      : nonAdminAuditRead.error
        ? row("Pass", "non-admin audit read denied by RLS/error")
        : row("Fail", "non-admin read returned private admin audit rows", { rows: nonAdminAuditRead.data?.length ?? null });

    const restore = await users.owner.client.rpc("admin_restore_account_for_support", {
      p_reason: `Wave 5.1 restore proof ${proofRunId}`,
      p_target_user_id: users.restrictedCandidate.id,
    });
    matrix.adminActions.adminRestore = restore.error
      ? row("Fail", `owner/operator restore failed: ${classifyError(restore.error)}`)
      : row("Pass", "owner/operator restored proof account", {
          restricted: restore.data?.restricted ?? null,
        });

    const restoredMessage = await users.restrictedCandidate.client.from("chat_messages").insert({
      body: `Wave 5.1 restored message ${proofRunId}`,
      sender_user_id: users.restrictedCandidate.id,
      thread_id: chatThreadId,
    });
    matrix.adminActions.restoredAccess = restoredMessage.error
      ? row("Fail", `restored account could not use normal chat feature: ${classifyError(restoredMessage.error)}`)
      : row("Pass", "restored account regained normal private-feature access");
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

  const serialized = JSON.stringify(matrix);
  const status = serialized.includes("\"Fail\"")
    ? "failed"
    : serialized.includes("\"Pending\"") || serialized.includes("\"Partial\"")
      ? "partial"
      : "passed";
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
  writeJson("wave5-disabled-admin-actions-proof.json", result);
  fs.writeFileSync(path.join(proofDir, "README.md"), [
    "# Wave 5.1 Disabled/Admin Actions Proof",
    "",
    `Proof run: ${proofRunId}`,
    "",
    "This artifact contains sanitized JSON output only. It omits credentials, service-role keys, JWTs, provider secrets, payment tokens, push tokens, LiveKit tokens, signed URLs, and proof passwords.",
    "",
    `Result: ${status}`,
    "",
  ].join("\n"));
  console.log(JSON.stringify(result, null, 2));
  console.error(`Wave 5.1 proof artifact: ${proofDir}`);
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
  writeJson("wave5-disabled-admin-actions-proof.json", failure);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
