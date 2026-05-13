#!/usr/bin/env node
import assert from "node:assert/strict";

const now = Date.parse("2026-05-12T12:00:00.000Z");
const STALE_MS = 120_000;

const clone = (value) => JSON.parse(JSON.stringify(value));

const baseServer = {
  currentParticipants: 8,
  currentPublishers: 2,
  currentRooms: 1,
  lastAssignmentAt: null,
  lastHeartbeatAt: new Date(now - 10_000).toISOString(),
  maxParticipants: 1000,
  maxPublishers: 100,
  maxRooms: 100,
  publicWsUrl: "wss://live.chillywoodstream.com",
  region: "operator-set",
  serverId: "chillywood-prod-01",
  status: "active",
  weight: 100,
};

const isFresh = (server) => {
  const heartbeat = Date.parse(server.lastHeartbeatAt || "");
  return Number.isFinite(heartbeat) && now - heartbeat <= STALE_MS;
};

const eligibleReason = (server) => {
  if (server.status !== "active") return `status_${server.status}`;
  if (!/^wss:\/\//.test(server.publicWsUrl)) return "missing_public_ws_url";
  if (!isFresh(server)) return "stale_heartbeat";
  if (server.currentRooms >= server.maxRooms) return "room_capacity_full";
  if (server.currentParticipants >= server.maxParticipants) return "participant_capacity_full";
  if (server.maxPublishers !== null && server.currentPublishers >= server.maxPublishers) return "publisher_capacity_full";
  return null;
};

const chooseServer = (servers) => {
  const eligible = servers.filter((server) => !eligibleReason(server));
  if (!eligible.length) return null;
  return eligible.sort((left, right) => (
    right.weight - left.weight
    || (left.currentRooms / left.maxRooms) - (right.currentRooms / right.maxRooms)
    || left.serverId.localeCompare(right.serverId)
  ))[0];
};

const createRouter = (servers) => {
  const state = {
    assignments: new Map(),
    audit: [],
    servers: clone(servers),
  };

  const assignmentKey = (roomId, roomType = "proof") => `${roomType}:${roomId}`;

  const assign = (roomId, roomType = "proof") => {
    const key = assignmentKey(roomId, roomType);
    const existing = state.assignments.get(key);
    if (existing) {
      const server = state.servers.find((candidate) => candidate.serverId === existing.serverId);
      if (!server || !["active", "draining"].includes(server.status)) {
        state.audit.push({ event: "assignment_failed", reason: "assigned_server_unavailable", roomId, roomType });
        return { ok: false, reason: "assigned_server_unavailable" };
      }

      state.audit.push({ event: "assignment_reused", roomId, roomType, serverId: existing.serverId });
      return { ok: true, serverId: existing.serverId };
    }

    const server = chooseServer(state.servers);
    if (!server) {
      state.audit.push({ event: "no_eligible_server", roomId, roomType });
      return { ok: false, reason: "no_eligible_server" };
    }

    state.assignments.set(key, { serverId: server.serverId });
    state.audit.push({ event: "room_assigned", roomId, roomType, serverId: server.serverId });
    return { ok: true, serverId: server.serverId };
  };

  const setStatus = (serverId, status) => {
    const server = state.servers.find((candidate) => candidate.serverId === serverId);
    assert.ok(server, `missing ${serverId}`);
    server.status = status;
    state.audit.push({ event: `server_${status}`, serverId });
  };

  const setFull = (serverId) => {
    const server = state.servers.find((candidate) => candidate.serverId === serverId);
    assert.ok(server, `missing ${serverId}`);
    server.currentRooms = server.maxRooms;
  };

  const setStale = (serverId) => {
    const server = state.servers.find((candidate) => candidate.serverId === serverId);
    assert.ok(server, `missing ${serverId}`);
    server.lastHeartbeatAt = new Date(now - STALE_MS - 1_000).toISOString();
  };

  return { assign, setFull, setStale, setStatus, state };
};

const singleBox = createRouter([baseServer]);

const firstRoom = singleBox.assign("ROOM_A");
assert.deepEqual(firstRoom, { ok: true, serverId: "chillywood-prod-01" });

const reusedRoom = singleBox.assign("ROOM_A");
assert.deepEqual(reusedRoom, { ok: true, serverId: "chillywood-prod-01" });

singleBox.setStatus("chillywood-prod-01", "draining");

const existingOnDraining = singleBox.assign("ROOM_A");
assert.deepEqual(existingOnDraining, { ok: true, serverId: "chillywood-prod-01" });

const newWhileDraining = singleBox.assign("ROOM_B");
assert.deepEqual(newWhileDraining, { ok: false, reason: "no_eligible_server" });

singleBox.setStatus("chillywood-prod-01", "active");

const afterReactivate = singleBox.assign("ROOM_C");
assert.deepEqual(afterReactivate, { ok: true, serverId: "chillywood-prod-01" });

singleBox.setStatus("chillywood-prod-01", "offline");

const newWhileOffline = singleBox.assign("ROOM_D");
assert.deepEqual(newWhileOffline, { ok: false, reason: "no_eligible_server" });

const fullBox = createRouter([{ ...baseServer, currentRooms: 100 }]);
assert.deepEqual(fullBox.assign("ROOM_FULL"), { ok: false, reason: "no_eligible_server" });

const staleBox = createRouter([{ ...baseServer, lastHeartbeatAt: new Date(now - STALE_MS - 1_000).toISOString() }]);
assert.deepEqual(staleBox.assign("ROOM_STALE"), { ok: false, reason: "no_eligible_server" });

const chatCallRouter = createRouter([baseServer]);
const chatCallFirstRoom = chatCallRouter.assign("CHAT_CALL_A", "chat_call");
assert.deepEqual(chatCallFirstRoom, { ok: true, serverId: "chillywood-prod-01" });

const chatCallReusedRoom = chatCallRouter.assign("CHAT_CALL_A", "chat_call");
assert.deepEqual(chatCallReusedRoom, { ok: true, serverId: "chillywood-prod-01" });

chatCallRouter.setStatus("chillywood-prod-01", "draining");

const chatCallExistingOnDraining = chatCallRouter.assign("CHAT_CALL_A", "chat_call");
assert.deepEqual(chatCallExistingOnDraining, { ok: true, serverId: "chillywood-prod-01" });

const chatCallNewWhileDraining = chatCallRouter.assign("CHAT_CALL_B", "chat_call");
assert.deepEqual(chatCallNewWhileDraining, { ok: false, reason: "no_eligible_server" });

const futureScale = createRouter([
  { ...baseServer, currentRooms: 99, serverId: "chillywood-livekit-us-1", publicWsUrl: "wss://live-1.example.test" },
  { ...baseServer, currentRooms: 5, serverId: "chillywood-livekit-us-2", publicWsUrl: "wss://live-2.example.test" },
  { ...baseServer, serverId: "chillywood-livekit-standby-1", publicWsUrl: "wss://live-standby.example.test", status: "standby" },
]);

assert.deepEqual(futureScale.assign("ROOM_SCALE_A"), { ok: true, serverId: "chillywood-livekit-us-2" });
futureScale.setStatus("chillywood-livekit-us-1", "offline");
futureScale.setStatus("chillywood-livekit-us-2", "draining");
assert.deepEqual(futureScale.assign("ROOM_SCALE_B"), { ok: false, reason: "no_eligible_server" });
futureScale.setStatus("chillywood-livekit-standby-1", "active");
assert.deepEqual(futureScale.assign("ROOM_SCALE_C"), { ok: true, serverId: "chillywood-livekit-standby-1" });

assert.ok(singleBox.state.audit.some((entry) => entry.event === "room_assigned"));
assert.ok(singleBox.state.audit.some((entry) => entry.event === "assignment_reused"));
assert.ok(singleBox.state.audit.some((entry) => entry.event === "no_eligible_server"));
assert.ok(chatCallRouter.state.audit.some((entry) => entry.event === "room_assigned" && entry.roomType === "chat_call"));
assert.ok(chatCallRouter.state.audit.some((entry) => entry.event === "assignment_reused" && entry.roomType === "chat_call"));
assert.ok(chatCallRouter.state.audit.some((entry) => entry.event === "no_eligible_server" && entry.roomType === "chat_call"));

console.log(JSON.stringify({
  chatCallAuditEvents: chatCallRouter.state.audit.map((entry) => entry.roomType ? `${entry.roomType}:${entry.event}` : entry.event),
  futureScaleAuditEvents: futureScale.state.audit.map((entry) => entry.event),
  singleBoxAuditEvents: singleBox.state.audit.map((entry) => entry.event),
  status: "passed",
}, null, 2));
