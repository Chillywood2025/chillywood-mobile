#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const timeout = (milliseconds, label) => new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label}_timed_out`)), milliseconds);
  timer.unref?.();
});

const parseLocalEnvironment = () => {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const environment = {};
  for (const line of output.split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    environment[key] = rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
  }
  const apiUrl = String(environment.API_URL ?? "");
  const hostname = new URL(apiUrl).hostname;
  assert.ok(hostname === "127.0.0.1" || hostname === "localhost", "local Supabase only");
  assert.ok(environment.ANON_KEY, "local anon key is available");
  assert.ok(environment.SERVICE_ROLE_KEY, "local service role key is available");
  return {
    anonKey: environment.ANON_KEY,
    apiUrl,
    serviceRoleKey: environment.SERVICE_ROLE_KEY,
  };
};

const { anonKey, apiUrl, serviceRoleKey } = parseLocalEnvironment();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(apiUrl, serviceRoleKey, clientOptions);
const sender = createClient(apiUrl, anonKey, clientOptions);
const receiver = createClient(apiUrl, anonKey, clientOptions);
const nonce = crypto.randomBytes(8).toString("hex");
const roomId = `RT${nonce}`.toUpperCase();
const password = `Local-${crypto.randomBytes(16).toString("hex")}!`;
const senderEmail = `realtime-sender-${nonce}@example.invalid`;
const receiverEmail = `realtime-receiver-${nonce}@example.invalid`;
const createdUserIds = [];
let channel = null;

const requireNoError = (result, label) => {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? "unknown error"}`);
  return result.data;
};

try {
  for (const email of [senderEmail, receiverEmail]) {
    const created = requireNoError(await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    }), `create ${email}`);
    assert.ok(created.user?.id, `created user id for ${email}`);
    createdUserIds.push(created.user.id);
  }
  const [senderUserId, receiverUserId] = createdUserIds;

  requireNoError(await admin.from("communication_rooms").insert({
    content_access_rule: "open",
    host_user_id: senderUserId,
    last_activity_at: new Date().toISOString(),
    room_code: roomId,
    room_id: roomId,
    status: "active",
  }), "create local communication room");
  requireNoError(await admin.from("communication_room_memberships").insert([
    {
      camera_enabled: true,
      membership_state: "active",
      mic_enabled: true,
      role: "host",
      room_id: roomId,
      user_id: senderUserId,
    },
    {
      camera_enabled: true,
      membership_state: "active",
      mic_enabled: true,
      role: "participant",
      room_id: roomId,
      user_id: receiverUserId,
    },
  ]), "create local communication memberships");

  const senderSession = requireNoError(
    await sender.auth.signInWithPassword({ email: senderEmail, password }),
    "sign in sender",
  );
  const receiverSession = requireNoError(
    await receiver.auth.signInWithPassword({ email: receiverEmail, password }),
    "sign in receiver",
  );
  assert.ok(senderSession.session?.access_token, "sender session token");
  assert.ok(receiverSession.session?.access_token, "receiver session token");
  await receiver.realtime.setAuth(receiverSession.session.access_token);

  let resolveVisibleProjection;
  const visibleProjection = new Promise((resolve) => {
    resolveVisibleProjection = resolve;
  });
  channel = receiver.channel(`comm-room-${roomId}`, {
    config: { broadcast: { ack: false, self: false }, private: true },
  });
  channel.on("broadcast", { event: "media:update" }, async (message) => {
    try {
      const payload = message.payload ?? {};
      assert.equal(payload.fromUserId, senderUserId, "server derives the sender identity");
      assert.equal(payload.roomId, roomId, "server binds the exact room");
      assert.equal(payload.cameraOn, false, "notification carries the committed camera hint");
      assert.equal(payload.micOn, true, "notification carries the committed microphone hint");
      const authoritativeRead = requireNoError(await receiver
        .from("communication_room_memberships")
        .select("room_id,user_id,camera_enabled,mic_enabled,membership_state")
        .eq("room_id", roomId)
        .eq("user_id", senderUserId)
        .single(), "receiver authoritative membership read");
      resolveVisibleProjection({
        cameraOn: authoritativeRead.camera_enabled,
        micOn: authoritativeRead.mic_enabled,
      });
    } catch (error) {
      resolveVisibleProjection(Promise.reject(error));
    }
  });

  await Promise.race([
    new Promise((resolve, reject) => {
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reject(error ?? new Error(`receiver_channel_${status.toLowerCase()}`));
        }
      });
    }),
    timeout(8_000, "receiver_subscription"),
  ]);

  const committed = requireNoError(await sender
    .from("communication_room_memberships")
    .update({
      camera_enabled: false,
      last_seen_at: new Date().toISOString(),
      membership_state: "active",
      mic_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("room_id", roomId)
    .eq("user_id", senderUserId)
    .select("room_id,user_id,camera_enabled,mic_enabled,membership_state")
    .single(), "sender durable media commit");
  assert.equal(committed.camera_enabled, false, "camera state committed before notification");

  const broadcast = requireNoError(await sender.rpc("broadcast_communication_room_signal", {
    p_event: "media:update",
    p_payload: { cameraOn: false, micOn: true },
    p_room_id: roomId,
  }), "server-relayed media notification");
  assert.deepEqual(
    { event: broadcast.event, roomId: broadcast.roomId, sent: broadcast.sent },
    { event: "media:update", roomId, sent: true },
  );

  const projection = await Promise.race([
    visibleProjection,
    timeout(8_000, "receiver_visible_projection"),
  ]);
  assert.deepEqual(projection, { cameraOn: false, micOn: true });
  process.stdout.write("communication room Realtime delivery: PASS (local durable commit -> server relay -> private receiver -> authoritative projection)\n");
} finally {
  if (channel) await receiver.removeChannel(channel).catch(() => undefined);
  await sender.auth.signOut({ scope: "local" }).catch(() => undefined);
  await receiver.auth.signOut({ scope: "local" }).catch(() => undefined);
  await Promise.resolve(
    admin.from("communication_room_memberships").delete().eq("room_id", roomId),
  ).catch(() => undefined);
  await Promise.resolve(
    admin.from("communication_rooms").delete().eq("room_id", roomId),
  ).catch(() => undefined);
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }
}
