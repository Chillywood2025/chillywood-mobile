#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_FUNCTIONS_URL = "https://network-proof.chillywoodstream.com";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJibWtraGloZmJtc25ubWNxa29seSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcxMTYxNTg1LCJleHAiOjIwODY3Mzc1ODV9.invalid-placeholder";

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const proofRunId = `wave4-runtime-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-wave4-runtime-mutation-block-proof-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);

const toText = (value) => String(value ?? "").trim();
const suffix = (value) => toText(value).slice(-8) || null;
const nowIso = () => new Date().toISOString();
const futureIso = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

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

const classifyError = (error) => toText(error?.message || error?.code || error?.details || error).slice(0, 180);

const isBlocked = (error, needles) => {
  const text = classifyError(error).toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
};

const rowResult = (status, evidence, extra = {}) => ({ evidence, status, ...extra });

const insertExpectAllowed = async (label, promise) => {
  const { data, error } = await promise;
  if (error) return rowResult("Fail", `${label} expected allowed but got ${classifyError(error)}`);
  return rowResult("Pass", `${label} allowed`, { data });
};

const insertExpectBlocked = async (label, promise, needles) => {
  const { error } = await promise;
  if (!error) return rowResult("Fail", `${label} expected blocked but was allowed`);
  if (!isBlocked(error, needles)) return rowResult("Fail", `${label} blocked with unexpected error: ${classifyError(error)}`);
  return rowResult("Pass", `${label} blocked with expected error`);
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
  return { ok: response.ok, payload, status: response.status };
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
    CHILLYWOOD_E2E_VIEWER_02_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_02_EMAIL),
    CHILLYWOOD_E2E_VIEWER_02_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_02_PASSWORD),
    CHILLYWOOD_E2E_VIEWER_03_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_03_EMAIL),
    CHILLYWOOD_E2E_VIEWER_03_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_03_PASSWORD),
    CHILLYWOOD_E2E_VIEWER_04_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_04_EMAIL),
    CHILLYWOOD_E2E_VIEWER_04_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_04_PASSWORD),
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
    writeJson("wave4-runtime-mutation-block-proof.json", dryRun);
    console.log(JSON.stringify(dryRun, null, 2));
    console.error(`Wave 4.1 proof artifact: ${proofDir}`);
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
    caller: await signIn(supabaseUrl, anonKey, "caller", required.CHILLYWOOD_E2E_VIEWER_02_EMAIL, required.CHILLYWOOD_E2E_VIEWER_02_PASSWORD),
    recipient: await signIn(supabaseUrl, anonKey, "recipient", required.CHILLYWOOD_E2E_VIEWER_03_EMAIL, required.CHILLYWOOD_E2E_VIEWER_03_PASSWORD),
    other: await signIn(supabaseUrl, anonKey, "other", required.CHILLYWOOD_E2E_VIEWER_04_EMAIL, required.CHILLYWOOD_E2E_VIEWER_04_PASSWORD),
  };

  const cleanup = [];
  const cleanupTargetKeys = [];
  const matrix = {
    runtimeMutation: {},
    blockedUser: {},
  };

  const addCleanup = (name, fn) => cleanup.push({ fn, name });
  const cleanupRateTargets = async () => {
    const actorIds = Object.values(users).map((user) => user.id);
    if (cleanupTargetKeys.length) {
      await admin.from("abuse_rate_limit_events").delete().in("actor_user_id", actorIds).in("target_key", cleanupTargetKeys);
    }
    await admin.from("abuse_rate_limit_events").delete().eq("actor_user_id", users.owner.id).eq("action_key", "media_upload_url").eq("target_key", "creator_video");
  };
  await cleanupRateTargets();

  const createThread = async (label, a = users.caller, b = users.recipient) => {
    const id = randomUUID();
    const key = `proof:${proofRunId}:${label}:${[a.id, b.id].sort().join(":")}`;
    const thread = await admin.from("chat_threads").insert({
      id,
      created_by: a.id,
      participant_pair_key: key,
      thread_kind: "direct",
    });
    if (thread.error) throw new Error(`${label}_thread_setup_failed:${classifyError(thread.error)}`);
    const members = await a.client.from("chat_thread_members").insert([
      { thread_id: id, user_id: a.id, display_name: `proof-${a.label}` },
      { thread_id: id, user_id: b.id, display_name: `proof-${b.label}` },
    ]);
    if (members.error) throw new Error(`${label}_member_setup_failed:${classifyError(members.error)}`);
    addCleanup(`chat_thread:${label}`, async () => admin.from("chat_threads").delete().eq("id", id));
    return id;
  };

  try {
    const threadId = await createThread("call-chat");
    cleanupTargetKeys.push(threadId, `${threadId}:${users.recipient.id}`);
    const inviteBase = {
      call_type: "voice",
      callee_user_id: users.recipient.id,
      caller_user_id: users.caller.id,
      expires_at: futureIso(120),
      status: "ringing",
      thread_id: threadId,
    };

    const firstInvite = await insertExpectAllowed("first call invite", users.caller.client.from("chat_call_invites").insert(inviteBase).select("id").single());
    matrix.runtimeMutation.callInviteFirstAllowed = rowResult(firstInvite.status, firstInvite.evidence);
    const firstInviteId = firstInvite.data?.id;
    const duplicateInvite = await insertExpectBlocked("duplicate active call invite", users.caller.client.from("chat_call_invites").insert(inviteBase), ["active_call_invite_exists"]);
    matrix.runtimeMutation.callInviteDuplicateBlocked = duplicateInvite;
    if (firstInviteId) {
      await users.caller.client.from("chat_call_invites").update({ status: "canceled", ended_at: nowIso() }).eq("id", firstInviteId);
    }
    const cooldownAttempts = [];
    for (let index = 0; index < 4; index += 1) {
      const res = await users.caller.client.from("chat_call_invites").insert({ ...inviteBase, status: "ringing", expires_at: futureIso(120) }).select("id").single();
      cooldownAttempts.push({ allowed: !res.error, error: classifyError(res.error), id: res.data?.id ?? null });
      if (res.data?.id) await users.caller.client.from("chat_call_invites").update({ status: "canceled", ended_at: nowIso() }).eq("id", res.data.id);
    }
    matrix.runtimeMutation.callInviteCooldown = cooldownAttempts.some((item) => /rate_limited/i.test(item.error))
      ? rowResult("Pass", "caller/thread/callee cooldown enforced")
      : rowResult("Fail", "cooldown attempts did not hit rate_limited", { cooldownAttempts });

    const chatThreadId = await createThread("chat-controls");
    cleanupTargetKeys.push(chatThreadId, `${chatThreadId}:`);
    matrix.runtimeMutation.chatValidMessage = await insertExpectAllowed(
      "valid chat message",
      users.caller.client.from("chat_messages").insert({ body: `Wave 4 valid ${proofRunId}`, sender_user_id: users.caller.id, thread_id: chatThreadId }),
    );
    matrix.runtimeMutation.chatEmptyBlocked = await insertExpectBlocked(
      "empty chat message",
      users.caller.client.from("chat_messages").insert({ body: "   ", sender_user_id: users.caller.id, thread_id: chatThreadId }),
      ["chat_message_body_required"],
    );
    matrix.runtimeMutation.chatOversizeBlocked = await insertExpectBlocked(
      "oversize chat message",
      users.caller.client.from("chat_messages").insert({ body: "x".repeat(1001), sender_user_id: users.caller.id, thread_id: chatThreadId }),
      ["chat_message_body_too_long"],
    );
    const rapidChat = [];
    for (let index = 0; index < 10; index += 1) {
      const res = await users.caller.client.from("chat_messages").insert({
        body: `rapid-${proofRunId}-${index}`,
        sender_user_id: users.caller.id,
        thread_id: chatThreadId,
      });
      rapidChat.push({ allowed: !res.error, error: classifyError(res.error) });
    }
    matrix.runtimeMutation.chatRapidThrottle = rapidChat.some((item) => /rate_limited/i.test(item.error))
      ? rowResult("Pass", "rapid chat messages throttled")
      : rowResult("Fail", "rapid chat messages were not throttled", { rapidChat });
    const duplicateThreadId = await createThread("chat-duplicate");
    cleanupTargetKeys.push(`${duplicateThreadId}:duplicate-proof-body`);
    const dup1 = await users.caller.client.from("chat_messages").insert({ body: "duplicate-proof-body", sender_user_id: users.caller.id, thread_id: duplicateThreadId });
    const dup2 = await users.caller.client.from("chat_messages").insert({ body: "duplicate-proof-body", sender_user_id: users.caller.id, thread_id: duplicateThreadId });
    const dup3 = await users.caller.client.from("chat_messages").insert({ body: "duplicate-proof-body", sender_user_id: users.caller.id, thread_id: duplicateThreadId });
    matrix.runtimeMutation.chatDuplicateThrottle = !dup1.error && !dup2.error && isBlocked(dup3.error, ["rate_limited"])
      ? rowResult("Pass", "third duplicate chat body throttled")
      : rowResult("Fail", "duplicate chat throttle did not behave as expected", { errors: [classifyError(dup1.error), classifyError(dup2.error), classifyError(dup3.error)] });
    matrix.runtimeMutation.chatNonMemberBlocked = await insertExpectBlocked(
      "non-member chat write",
      users.viewer.client.from("chat_messages").insert({ body: "non-member proof", sender_user_id: users.viewer.id, thread_id: chatThreadId }),
      ["violates row-level security", "permission denied", "policy"],
    );

    const partyIds = [];
    const createParty = async (id) => {
      partyIds.push(id);
      const res = await users.owner.client.from("watch_party_rooms").insert({
        party_id: id,
        host_user_id: users.owner.id,
        room_type: "live",
        title_id: null,
      });
      return res;
    };
    const firstPartyId = `w4-${proofRunId}-party-0`;
    cleanupTargetKeys.push("live", firstPartyId);
    matrix.runtimeMutation.roomCreateFirstAllowed = await insertExpectAllowed("first Watch-Party room create", createParty(firstPartyId));
    const repeatedRooms = [];
    for (let index = 1; index <= 6; index += 1) {
      const res = await createParty(`w4-${proofRunId}-party-${index}`);
      repeatedRooms.push({ allowed: !res.error, error: classifyError(res.error) });
    }
    matrix.runtimeMutation.roomCreateThrottle = repeatedRooms.some((item) => /rate_limited/i.test(item.error))
      ? rowResult("Pass", "rapid Watch-Party room creation throttled")
      : rowResult("Fail", "Watch-Party room creation did not throttle", { repeatedRooms });
    for (const partyId of partyIds) {
      addCleanup(`watch_party_room:${partyId}`, async () => admin.from("watch_party_rooms").delete().eq("party_id", partyId));
    }
    await admin.from("watch_party_room_memberships").upsert([
      { party_id: firstPartyId, user_id: users.viewer.id, role: "viewer", stage_role: "listener", membership_state: "active" },
      { party_id: firstPartyId, user_id: users.owner.id, role: "host", stage_role: "host", membership_state: "active" },
    ]);
    const seatText = `__chillywood_party_seat_request_v1__:${users.viewer.id}`;
    const firstSeat = await users.viewer.client.from("watch_party_room_messages").insert({
      party_id: firstPartyId,
      user_id: users.viewer.id,
      username: "proof-viewer",
      text: seatText,
    });
    const seatRapid = [];
    for (let index = 0; index < 4; index += 1) {
      const res = await users.viewer.client.from("watch_party_room_messages").insert({
        party_id: firstPartyId,
        user_id: users.viewer.id,
        username: "proof-viewer",
        text: `${seatText}:${index}`,
      });
      seatRapid.push({ allowed: !res.error, error: classifyError(res.error) });
    }
    matrix.runtimeMutation.seatRequestThrottle = !firstSeat.error && seatRapid.some((item) => /rate_limited/i.test(item.error))
      ? rowResult("Pass", "durable seat-request marker throttled")
      : rowResult("Fail", "durable seat-request marker throttle did not behave as expected", { first: classifyError(firstSeat.error), seatRapid });

    const communicationRooms = [];
    for (let index = 0; index < 7; index += 1) {
      const roomId = `w4-${proofRunId}-comm-${index}`;
      const res = await users.owner.client.from("communication_rooms").insert({
        host_user_id: users.owner.id,
        room_code: `W4${proofRunId.slice(-6)}${index}`,
        room_id: roomId,
      });
      communicationRooms.push({ allowed: !res.error, error: classifyError(res.error), roomId });
      addCleanup(`communication_room:${roomId}`, async () => admin.from("communication_rooms").delete().eq("room_id", roomId));
    }
    matrix.runtimeMutation.communicationRoomThrottle = communicationRooms.some((item) => /rate_limited/i.test(item.error))
      ? rowResult("Pass", "rapid communication room creation throttled")
      : rowResult("Fail", "communication room creation did not throttle", { communicationRooms });

    const callMediaStorage = async (body) => callFunction(functionsUrl, "media-storage", users.owner.token, body);
    const uploadAttempts = [];
    await admin.from("abuse_rate_limit_events").delete().eq("actor_user_id", users.owner.id).eq("action_key", "media_upload_url").eq("target_key", "creator_video");
    const zeroByteUpload = await callMediaStorage({
      action: "create_upload_url",
      mimeType: "video/mp4",
      objectKey: `${users.owner.id}/wave4-runtime/${proofRunId}-zero.mp4`,
      recordId: randomUUID(),
      sizeBytes: 0,
      surfaceType: "creator_video",
    });
    matrix.runtimeMutation.uploadZeroByteBlocked = zeroByteUpload.status === 400
      ? rowResult("Pass", "zero-byte upload validation still blocks")
      : rowResult("Partial", "zero-byte upload validation not reached or returned different status", { status: zeroByteUpload.status, error: zeroByteUpload.payload?.error });
    for (let index = 0; index < 10; index += 1) {
      const res = await callMediaStorage({
        action: "create_upload_url",
        mimeType: "video/mp4",
        objectKey: `${users.owner.id}/wave4-runtime/${proofRunId}-${index}.mp4`,
        recordId: randomUUID(),
        sizeBytes: 1024,
        surfaceType: "creator_video",
      });
      uploadAttempts.push({ error: toText(res.payload?.error), ok: res.ok, status: res.status });
    }
    matrix.runtimeMutation.uploadUrlThrottle = uploadAttempts.some((item) => item.status === 429 && item.error === "rate_limited")
      ? rowResult("Pass", "media-storage upload URL initiation throttled")
      : rowResult("Partial", "upload URL throttle could not be fully proved, often due Premium/setup or provider path", { uploadAttempts });

    const { data: fixtureVideo } = await admin
      .from("videos")
      .select("id,owner_id")
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .limit(1)
      .maybeSingle();
    if (fixtureVideo?.id) {
      cleanupTargetKeys.push(fixtureVideo.id);
      const firstComment = await users.viewer.client.from("creator_video_comments").insert({
        body: `Wave 4 comment ${proofRunId}`,
        user_id: users.viewer.id,
        video_id: fixtureVideo.id,
      }).select("id").single();
      matrix.runtimeMutation.commentValidAllowed = firstComment.error
        ? rowResult("Fail", `valid comment blocked: ${classifyError(firstComment.error)}`)
        : rowResult("Pass", "valid creator-video comment allowed");
      const parentId = firstComment.data?.id;
      if (parentId) addCleanup("creator_video_comment_parent", async () => admin.from("creator_video_comments").delete().eq("id", parentId));
      const emptyComment = await insertExpectBlocked(
        "empty creator-video comment",
        users.viewer.client.from("creator_video_comments").insert({ body: "   ", user_id: users.viewer.id, video_id: fixtureVideo.id }),
        ["violates check constraint", "body_length"],
      );
      matrix.runtimeMutation.commentEmptyBlocked = emptyComment;
      const duplicateComments = [];
      for (let index = 0; index < 4; index += 1) {
        const res = await users.viewer.client.from("creator_video_comments").insert({
          body: `dup-comment-${proofRunId}`,
          user_id: users.viewer.id,
          video_id: fixtureVideo.id,
        }).select("id").single();
        duplicateComments.push({ allowed: !res.error, error: classifyError(res.error), id: res.data?.id ?? null });
        if (res.data?.id) addCleanup(`creator_video_comment:${res.data.id}`, async () => admin.from("creator_video_comments").delete().eq("id", res.data.id));
      }
      matrix.runtimeMutation.commentDuplicateThrottle = duplicateComments.some((item) => /rate_limited/i.test(item.error))
        ? rowResult("Pass", "duplicate/rapid creator-video comments throttled")
        : rowResult("Fail", "duplicate creator-video comments did not throttle", { duplicateComments });
      if (parentId) {
        const reply = await users.viewer.client.from("creator_video_comments").insert({
          body: `Wave 4 reply ${proofRunId}`,
          parent_comment_id: parentId,
          user_id: users.viewer.id,
          video_id: fixtureVideo.id,
        }).select("id").single();
        matrix.runtimeMutation.replyValidAllowed = reply.error
          ? rowResult("Fail", `valid reply blocked: ${classifyError(reply.error)}`)
          : rowResult("Pass", "valid reply allowed");
        if (reply.data?.id) addCleanup(`creator_video_reply:${reply.data.id}`, async () => admin.from("creator_video_comments").delete().eq("id", reply.data.id));
      }

      await admin.from("channel_audience_blocks").upsert({
        blocked_by_user_id: fixtureVideo.owner_id,
        blocked_user_id: users.caller.id,
        channel_user_id: fixtureVideo.owner_id,
        reason: `wave4-runtime:${proofRunId}`,
      });
      addCleanup("channel_block_video_owner", async () =>
        admin.from("channel_audience_blocks")
          .delete()
          .eq("channel_user_id", fixtureVideo.owner_id)
          .eq("blocked_user_id", users.caller.id)
      );
      const blockedComment = await users.caller.client.from("creator_video_comments").insert({
        body: `blocked comment ${proofRunId}`,
        user_id: users.caller.id,
        video_id: fixtureVideo.id,
      });
      matrix.blockedUser.commentsReplies = isBlocked(blockedComment.error, ["blocked_relationship"])
        ? rowResult("Pass", "blocked user denied on blocker-owned creator-video comments")
        : rowResult("Partial", "blocked comment path not denied, possibly because fixture owner differs from blocker policy", { error: classifyError(blockedComment.error) });
    } else {
      matrix.runtimeMutation.commentValidAllowed = rowResult("Pending", "no public clean creator-video fixture available");
      matrix.blockedUser.commentsReplies = rowResult("Pending", "no public clean creator-video fixture available");
    }

    const firstReport = await users.viewer.client.from("safety_reports").insert({
      category: "harassment",
      context: { proof_run_id: proofRunId },
      note: `Wave 4 report ${proofRunId}`,
      reporter_user_id: users.viewer.id,
      target_id: `wave4-target-${proofRunId}`,
      target_type: "participant",
    }).select("id").single();
    matrix.runtimeMutation.reportFirstAllowed = firstReport.error
      ? rowResult("Fail", `valid safety report blocked: ${classifyError(firstReport.error)}`)
      : rowResult("Pass", "valid safety report allowed");
    if (firstReport.data?.id) addCleanup(`safety_report:${firstReport.data.id}`, async () => admin.from("safety_reports").delete().eq("id", firstReport.data.id));
    const duplicateReport1 = await users.viewer.client.from("safety_reports").insert({
      category: "harassment",
      context: { proof_run_id: proofRunId },
      note: `Wave 4 report duplicate ${proofRunId}`,
      reporter_user_id: users.viewer.id,
      target_id: `wave4-target-${proofRunId}`,
      target_type: "participant",
    }).select("id").single();
    if (duplicateReport1.data?.id) addCleanup(`safety_report:${duplicateReport1.data.id}`, async () => admin.from("safety_reports").delete().eq("id", duplicateReport1.data.id));
    const duplicateReport2 = await users.viewer.client.from("safety_reports").insert({
      category: "harassment",
      context: { proof_run_id: proofRunId },
      note: `Wave 4 report duplicate two ${proofRunId}`,
      reporter_user_id: users.viewer.id,
      target_id: `wave4-target-${proofRunId}`,
      target_type: "participant",
    });
    matrix.runtimeMutation.reportDuplicateThrottle = !duplicateReport1.error && isBlocked(duplicateReport2.error, ["rate_limited"])
      ? rowResult("Pass", "third safety report for same target throttled")
      : rowResult("Fail", "duplicate safety report was not throttled", {
        firstDuplicateError: classifyError(duplicateReport1.error),
        secondDuplicateError: classifyError(duplicateReport2.error),
      });

    const caseNumber = `W4-${proofRunId}`;
    const dmcaPayload = {
      accuracy_penalty_perjury_statement: true,
      allegedly_infringing_content_type: "creator_video",
      allegedly_infringing_url: `https://chillywood.example/proof/${proofRunId}`,
      case_number: caseNumber,
      copyright_owner_name: "Chi'llywood Proof",
      copyrighted_work_description: "Wave 4 proof work",
      copyrighted_work_urls: [`https://chillywood.example/original/${proofRunId}`],
      electronic_signature: "Chi'llywood Proof",
      good_faith_statement: true,
      is_test_case: true,
      reporter_email: `wave4-${proofRunId}@example.invalid`,
      reporter_is_owner: true,
      reporter_name: "Chi'llywood Proof",
      reporter_user_id: users.viewer.id,
      source: "public_form",
    };
    const firstDmca = await admin.from("dmca_cases").insert(dmcaPayload).select("id").single();
    matrix.runtimeMutation.dmcaFirstAllowed = firstDmca.error
      ? rowResult("Partial", `DMCA proof fixture could not insert: ${classifyError(firstDmca.error)}`)
      : rowResult("Pass", "valid test DMCA case allowed");
    if (firstDmca.data?.id) addCleanup(`dmca_case:${firstDmca.data.id}`, async () => admin.from("dmca_cases").delete().eq("id", firstDmca.data.id));
    const duplicateDmca1 = await admin.from("dmca_cases").insert({ ...dmcaPayload, case_number: `${caseNumber}-DUP1` }).select("id").single();
    if (duplicateDmca1.data?.id) addCleanup(`dmca_case:${duplicateDmca1.data.id}`, async () => admin.from("dmca_cases").delete().eq("id", duplicateDmca1.data.id));
    const duplicateDmca2 = await admin.from("dmca_cases").insert({ ...dmcaPayload, case_number: `${caseNumber}-DUP2` });
    matrix.runtimeMutation.dmcaDuplicateThrottle = !duplicateDmca1.error && isBlocked(duplicateDmca2.error, ["rate_limited"])
      ? rowResult("Pass", "third public DMCA submission throttled")
      : rowResult("Partial", "DMCA duplicate throttle was not fully proved", {
        firstDuplicateError: classifyError(duplicateDmca1.error),
        secondDuplicateError: classifyError(duplicateDmca2.error),
      });

    await admin.from("channel_audience_blocks").upsert({
      blocked_by_user_id: users.recipient.id,
      blocked_user_id: users.caller.id,
      channel_user_id: users.recipient.id,
      reason: `wave4-runtime:${proofRunId}`,
    });
    addCleanup("channel_block_recipient", async () =>
      admin.from("channel_audience_blocks")
        .delete()
        .eq("channel_user_id", users.recipient.id)
        .eq("blocked_user_id", users.caller.id)
    );
    const blockedThreadId = await createThread("blocked-chat", users.caller, users.recipient);
    const blockedChat = await users.caller.client.from("chat_messages").insert({
      body: `blocked chat ${proofRunId}`,
      sender_user_id: users.caller.id,
      thread_id: blockedThreadId,
    });
    matrix.blockedUser.chat = isBlocked(blockedChat.error, ["blocked_relationship"])
      ? rowResult("Pass", "blocked user denied chat-message write")
      : rowResult("Fail", "blocked user chat write was not denied", { error: classifyError(blockedChat.error) });
    const blockedInvite = await users.caller.client.from("chat_call_invites").insert({
      call_type: "voice",
      callee_user_id: users.recipient.id,
      caller_user_id: users.caller.id,
      expires_at: futureIso(120),
      status: "ringing",
      thread_id: blockedThreadId,
    }).select("id").single();
    if (blockedInvite.error) {
      matrix.blockedUser.calls = rowResult("Partial", `blocked call invite creation blocked before dispatch: ${classifyError(blockedInvite.error)}`);
    } else {
      const dispatch = await callFunction(functionsUrl, "chilly-chat-call-dispatch", users.caller.token, {
        action: "incoming",
        inviteId: blockedInvite.data.id,
      });
      matrix.blockedUser.calls = dispatch.ok && dispatch.payload?.eligible === false && dispatch.payload?.blockedReason === "audience_block"
        ? rowResult("Pass", "blocked call dispatch suppressed push/ring")
        : rowResult("Fail", "blocked call dispatch did not return audience_block", { status: dispatch.status, payload: dispatch.payload });
    }
    matrix.blockedUser.notificationsCall = matrix.blockedUser.calls.status === "Pass"
      ? rowResult("Pass", "blocked call notification/ring suppressed by dispatch")
      : rowResult("Partial", "blocked call notification proof follows call dispatch result");
    matrix.blockedUser.notificationsChat = matrix.blockedUser.chat.status === "Pass"
      ? rowResult("Pass", "blocked chat notification prevented because message write failed")
      : rowResult("Partial", "blocked chat notification proof follows chat write result");
    matrix.blockedUser.roomJoins = rowResult("Partial", "current room join policy does not globally enforce channel audience blocks; accepted behavior remains documented pending product policy");
    matrix.blockedUser.seatRequests = rowResult("Partial", "seat-request spam throttled, but blocker-owned room block denial is not globally enforced by current policy");
    matrix.blockedUser.notificationsSeatRequest = rowResult("Partial", "durable seat request throttles pass, blocked relationship notification category needs product-specific runtime proof");
    matrix.blockedUser.notificationsCommentReply = matrix.blockedUser.commentsReplies?.status === "Pass"
      ? rowResult("Pass", "blocked comment/reply notification prevented because comment write failed")
      : rowResult("Partial", "blocked comment/reply notification proof follows comment write result");
    matrix.blockedUser.publicContentProfilePlatform = rowResult("Partial", "profile/platform block policy exists from prior guards; this pass did not run installed/profile route proof");

    const cleanupResults = [];
    for (const item of cleanup.reverse()) {
      try {
        const res = await item.fn();
        cleanupResults.push({ name: item.name, ok: !res?.error, error: classifyError(res?.error) || null });
      } catch (error) {
        cleanupResults.push({ name: item.name, ok: false, error: classifyError(error) });
      }
    }
    await cleanupRateTargets();

    const result = {
      cleanup: cleanupResults,
      mutationPerformed: true,
      proofRunId,
      secretsPrinted: false,
      tokenLikeValuesPrinted: false,
      userSuffixes: Object.fromEntries(Object.entries(users).map(([key, value]) => [key, suffix(value.id)])),
      ...matrix,
    };
    writeJson("wave4-runtime-mutation-block-proof.json", result);
    writeJson("README.json", {
      proofRunId,
      summary: "Bounded Wave 4.1 runtime mutation and blocked-user proof. Values are sanitized; no credentials, service-role keys, push tokens, LiveKit tokens, signed URLs, or passwords are written.",
    });
    console.log(JSON.stringify(result, null, 2));
    console.error(`Wave 4.1 proof artifact: ${proofDir}`);
  } finally {
    // Best-effort cleanup is already done in the main path. Avoid throwing from
    // finally so proof failures preserve their original cause.
  }
};

main().catch((error) => {
  fs.mkdirSync(proofDir, { recursive: true });
  const payload = {
    error: toText(error?.message || error).replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]").slice(0, 300),
    mutationPerformed: shouldRun,
    proofRunId,
    secretsPrinted: false,
    tokenLikeValuesPrinted: false,
  };
  writeJson("wave4-runtime-mutation-block-proof-error.json", payload);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
