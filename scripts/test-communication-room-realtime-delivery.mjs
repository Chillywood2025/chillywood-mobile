#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const timeout = (milliseconds, label) => new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label}_timed_out`)), milliseconds);
  timer.unref?.();
});

const assertEmptyStateInvalidation = (payload, metadata) => {
  assert.ok(payload && typeof payload === "object" && !Array.isArray(payload),
    "state invalidation has an object payload");
  // Realtime v2.112.6 realtime.send adds its generated message UUID when the
  // application payload has no id. Its replication envelope repeats that UUID
  // in meta.id. Only this provider field is permitted; row data stays forbidden.
  if (Object.hasOwn(payload, "id")) {
    assert.match(payload.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      "provider message id is a generated UUIDv4");
    if (metadata?.id !== undefined) {
      assert.equal(payload.id, metadata.id, "provider payload id matches its message metadata");
    }
  }
  const { id: providerMessageId, ...applicationPayload } = payload;
  void providerMessageId;
  assert.deepEqual(applicationPayload, {}, "state invalidation application payload is exactly empty");
};

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
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: (input, init) => fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)])
        : AbortSignal.timeout(8_000),
    }),
  },
};
const admin = createClient(apiUrl, serviceRoleKey, clientOptions);
const sender = createClient(apiUrl, anonKey, clientOptions);
const receiver = createClient(apiUrl, anonKey, clientOptions);
const nonce = crypto.randomBytes(8).toString("hex");
const roomId = `RT${nonce}`.toUpperCase();
const password = `Local-${crypto.randomBytes(16).toString("hex")}!`;
const senderEmail = `realtime-sender-${nonce}@example.invalid`;
const receiverEmail = `realtime-receiver-${nonce}@example.invalid`;
const participantEmail = `realtime-participant-${nonce}@example.invalid`;
const createdUserIds = [];
let channel = null;

const requireNoError = (result, label) => {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? "unknown error"}`);
  return result.data;
};

try {
  for (const email of [senderEmail, receiverEmail, participantEmail]) {
    const created = requireNoError(await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    }), `create ${email}`);
    assert.ok(created.user?.id, `created user id for ${email}`);
    createdUserIds.push(created.user.id);
  }
  const [senderUserId, receiverUserId, participantUserId] = createdUserIds;

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
  let pendingStateUpdate = null;
  let stateUpdateFailure = null;
  let stateUpdateCount = 0;
  const expectStateUpdate = (label) => {
    assert.equal(stateUpdateFailure, null, "previous state notifications succeeded");
    assert.equal(pendingStateUpdate, null, "state mutation checks run sequentially");
    let resolve;
    const notification = new Promise((resolveNotification) => {
      resolve = resolveNotification;
    });
    pendingStateUpdate = { label, resolve };
    return async () => {
      const outcome = await Promise.race([
        notification,
        timeout(8_000, label),
      ]);
      if (outcome.error) throw outcome.error;
      assert.equal(stateUpdateFailure, null, "state notifications retain their exact payload contract");
      return outcome.snapshot;
    };
  };
  channel.on("broadcast", { event: "state:update" }, async (message) => {
    const pending = pendingStateUpdate;
    pendingStateUpdate = null;
    stateUpdateCount += 1;
    try {
      // This trigger hint carries no row, user, generation, or operation data.
      // The provider may append its independently generated message UUID.
      // Every projection below comes from the signed-in receiver's RLS reads.
      assertEmptyStateInvalidation(message.payload, message.meta);
      assert.ok(pending, "every state hint belongs to a pending durable mutation");
      const [roomResult, membershipsResult] = await Promise.all([
        receiver.from("communication_rooms")
          .select("room_id,status")
          .eq("room_id", roomId)
          .maybeSingle(),
        receiver.from("communication_room_memberships")
          .select("room_id,user_id,camera_enabled,mic_enabled,membership_state")
          .eq("room_id", roomId),
      ]);
      pending.resolve({
        snapshot: {
          room: requireNoError(roomResult, `${pending.label}: receiver room read`),
          memberships: requireNoError(membershipsResult, `${pending.label}: receiver membership read`),
        },
      });
    } catch (error) {
      stateUpdateFailure ??= error;
      pending?.resolve({ error });
    }
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

  const receiveMediaState = expectStateUpdate("committed_media_state_hint");
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
  const mediaState = await receiveMediaState();
  assert.equal(mediaState.room?.status, "active");
  assert.equal(mediaState.memberships.find((entry) => entry.user_id === senderUserId)?.camera_enabled, false,
    "trigger notification independently refreshes committed camera state");

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

  // These mutations never call the signal RPC: the database trigger alone
  // must notify the existing private subscriber after each durable change.
  const receiveInsertedMembership = expectStateUpdate("membership_insert_state_hint");
  requireNoError(await admin.from("communication_room_memberships").insert({
    camera_enabled: false,
    membership_state: "active",
    mic_enabled: true,
    role: "participant",
    room_id: roomId,
    user_id: participantUserId,
  }), "insert local participant membership");
  const insertedMembership = await receiveInsertedMembership();
  assert.equal(insertedMembership.room?.status, "active");
  assert.equal(insertedMembership.memberships.length, 3);
  assert.deepEqual(
    insertedMembership.memberships.find((entry) => entry.user_id === participantUserId),
    {
      camera_enabled: false,
      membership_state: "active",
      mic_enabled: true,
      room_id: roomId,
      user_id: participantUserId,
    },
    "receiver reads the inserted membership under its current session",
  );

  const receiveUpdatedMembership = expectStateUpdate("membership_update_state_hint");
  const updatedMembership = requireNoError(await sender.from("communication_room_memberships")
    .update({ mic_enabled: false })
    .eq("room_id", roomId)
    .eq("user_id", senderUserId)
    .select("mic_enabled")
    .single(), "sender durable microphone commit without a signal RPC");
  assert.equal(updatedMembership.mic_enabled, false);
  const updatedSnapshot = await receiveUpdatedMembership();
  assert.equal(updatedSnapshot.memberships.find((entry) => entry.user_id === senderUserId)?.mic_enabled, false,
    "receiver refreshes the committed membership UPDATE from the trigger alone");

  const receiveDeletedMembership = expectStateUpdate("membership_delete_state_hint");
  requireNoError(await admin.from("communication_room_memberships")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", participantUserId), "delete local participant membership");
  const deletedMembership = await receiveDeletedMembership();
  assert.equal(deletedMembership.room?.status, "active");
  assert.equal(deletedMembership.memberships.length, 2);
  assert.equal(deletedMembership.memberships.some((entry) => entry.user_id === participantUserId), false,
    "receiver refreshes membership deletion without receiving the deleted row's identity");

  const receiveEndedRoom = expectStateUpdate("terminal_room_state_hint");
  requireNoError(await sender.from("communication_rooms")
    .update({ status: "ended" })
    .eq("room_id", roomId), "host commits terminal room state");
  const endedRoom = requireNoError(await admin.from("communication_rooms")
    .select("status")
    .eq("room_id", roomId)
    .single(), "local fixture confirms the terminal commit");
  assert.equal(endedRoom.status, "ended");
  const terminalSnapshot = await receiveEndedRoom();
  assert.equal(terminalSnapshot.room, null, "terminal hint still reaches the joined receiver after room visibility closes");
  assert.deepEqual(terminalSnapshot.memberships, [], "terminal refresh preserves membership RLS");
  assert.equal(stateUpdateFailure, null);
  assert.equal(stateUpdateCount, 5, "one private hint with empty application data arrives for each tested durable mutation");
  process.stdout.write("communication room Realtime delivery: PASS (private media relay; empty database hints for membership INSERT/UPDATE/DELETE and terminal room UPDATE; receiver RLS projections)\n");
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
