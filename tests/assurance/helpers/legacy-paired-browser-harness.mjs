/* Browser fixture: actual production hooks + Chromium RTC, simulated server.
 * This does not stand in for authenticated database, PushKit/CallKit, or device
 * capture qualification. No SDP answer, connection state, or received RTP is
 * fabricated. The pinned Supabase Phoenix Presence implementation applies the
 * same joins/leaves diff that a presence metadata replacement produces.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export function createLegacyBrowserAudioReceiver(track) {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const output = context.createGain();
  // Pull actual decoded remote audio without making the test tone audible.
  // RTP packet arrival alone does not start Chromium's audio playout path.
  output.gain.value = 0;
  source.connect(output); output.connect(context.destination);
  return { context, source, output, ready: context.resume() };
}

// The browser uses this same store as the offline adapter contract checks.
// It models durable admission ownership; database/RLS proof runs separately.
export function createLegacyBrowserMembershipStore({ onCommit = () => {} } = {}) {
  const memberships = new Map();
  const clone = (value) => structuredClone(value);
  const key = ({ roomId, userId }) => JSON.stringify([roomId, userId]);
  const reject = (message) => { throw Object.assign(new Error(message), { code: "P0001" }); };
  const isActive = (membership) => membership && !membership.leftAt
    && ["active", "reconnecting"].includes(membership.membershipState);
  const read = (identity) => memberships.get(key(identity)) ?? null;
  const commit = (membership, operation) => {
    memberships.set(key(membership), clone(membership));
    onCommit(clone(membership), operation);
    return clone(membership);
  };
  return {
    seed(membership) { memberships.set(key(membership), clone(membership)); },
    read(identity) { return clone(read(identity)); },
    snapshot(roomId) { return clone([...memberships.values()].filter((membership) => membership.roomId === roomId)); },
    prepare({ roomId, userId }) {
      return { roomId, userId, attemptId: crypto.randomUUID(), expectedPreviousGeneration: read({ roomId, userId })?.membershipGeneration ?? null };
    },
    join(input) {
      const { admission } = input;
      if (!admission || admission.roomId !== input.roomId || admission.userId !== input.userId
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(admission.attemptId ?? "")) {
        reject("communication_membership_admission_conflict");
      }
      const previous = read(input);
      if (previous?.membershipAdmissionAttempt === admission.attemptId) {
        if (!isActive(previous)) reject("communication_membership_admission_retired");
        return clone(previous);
      }
      if ((previous?.membershipGeneration ?? null) !== admission.expectedPreviousGeneration) {
        reject("communication_membership_admission_conflict");
      }
      const now = new Date().toISOString();
      return commit({
        ...previous, roomId: input.roomId, userId: input.userId,
        displayName: input.displayName ?? previous?.displayName ?? input.userId,
        avatarUrl: input.avatarUrl ?? previous?.avatarUrl,
        role: previous?.role ?? "participant", membershipState: "active", leftAt: null,
        cameraEnabled: !!input.cameraEnabled, micEnabled: typeof input.micEnabled === "boolean" ? input.micEnabled : true,
        joinedAt: previous?.joinedAt ?? now, lastSeenAt: now,
        membershipGeneration: crypto.randomUUID(), membershipAdmissionAttempt: admission.attemptId,
      }, "join");
    },
    touch(input) {
      if (input.membershipState !== undefined && !["active", "reconnecting"].includes(input.membershipState)) {
        reject("communication_membership_state_invalid");
      }
      const previous = read(input);
      if (!input.expectedMembershipGeneration || previous?.membershipGeneration !== input.expectedMembershipGeneration) {
        reject("communication_membership_generation_changed");
      }
      if (!previous.membershipAdmissionAttempt) reject("communication_membership_owned_admission_required");
      if (!isActive(previous)) reject("communication_membership_not_active");
      const changes = Object.fromEntries(["membershipState", "cameraEnabled", "micEnabled", "displayName", "avatarUrl"]
        .filter((name) => input[name] !== undefined).map((name) => [name, input[name]]));
      return commit({ ...previous, ...changes, lastSeenAt: new Date().toISOString() }, "touch");
    },
    heartbeat(input) {
      const previous = read(input);
      if (!input.expectedMembershipGeneration || previous?.membershipGeneration !== input.expectedMembershipGeneration) {
        reject("communication_membership_generation_changed");
      }
      if (!previous.membershipAdmissionAttempt) reject("communication_membership_owned_admission_required");
      if (!isActive(previous)) reject("communication_membership_not_active");
      return commit({ ...previous, lastSeenAt: new Date().toISOString() }, "heartbeat");
    },
    signal(input) {
      const membership = read(input);
      if (input.event === "room:end") {
        if (input.expectedMembershipGeneration !== undefined) reject("communication_signal_event_invalid");
        if (membership?.role !== "host") reject("communication_signal_host_required");
      } else {
        if (!input.expectedMembershipGeneration && membership?.membershipAdmissionAttempt) {
          reject("communication_membership_owned_signal_required");
        }
        if (input.expectedMembershipGeneration && membership?.membershipGeneration !== input.expectedMembershipGeneration) {
          reject("communication_membership_generation_changed");
        }
        if (!isActive(membership)) reject("communication_membership_not_active");
      }
      const payload = { ...clone(input.payload), roomId: input.roomId, fromUserId: input.userId };
      delete payload.senderUserId;
      if (input.event === "room:end") delete payload.membershipGeneration;
      else payload.membershipGeneration = membership.membershipGeneration;
      return {
        event: input.event, roomId: input.roomId,
        payload,
      };
    },
    leave(input) {
      const previous = read(input);
      if (!input.expectedMembershipGeneration || previous?.membershipGeneration !== input.expectedMembershipGeneration) {
        reject("cleanup_generation_changed");
      }
      if (["left", "removed"].includes(previous.membershipState) && previous.leftAt
        && previous.cameraEnabled === false && previous.micEnabled === false) return clone(previous);
      return commit({ ...previous, membershipState: "left", cameraEnabled: false, micEnabled: false, leftAt: new Date().toISOString() }, "leave");
    },
  };
}

export function buildLegacyPairedBrowserBundle({ sourceRoot = process.cwd() } = {}) {
  const read = (name) => fs.readFileSync(path.join(sourceRoot, name), "utf8");
  const compile = (source, fileName) => ts.transpileModule(source, {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const modules = {
    react: read("node_modules/react/cjs/react.production.js"),
    "react-dom": read("node_modules/react-dom/cjs/react-dom.production.js"),
    "react-dom/client": read("node_modules/react-dom/cjs/react-dom-client.production.js"),
    scheduler: read("node_modules/scheduler/cjs/scheduler.production.js"),
    phoenix: read("node_modules/@supabase/phoenix/priv/static/phoenix.cjs.js"),
    "@supabase/phoenix": read("node_modules/@supabase/phoenix/priv/static/phoenix.cjs.js"),
    "presence-adapter": read("node_modules/@supabase/realtime-js/dist/main/phoenix/presenceAdapter.js"),
    "membership-admission": compile(read("_lib/communicationMembershipAdmission.ts"), "communicationMembershipAdmission.ts"),
  };
  for (const name of ["communicationCallMediaPolicy", "nativeCallTransitionProvenance", "communicationRoomIdentifier", "accountBoundSupabaseRpc"]) {
    modules[`./${name}.mjs`] = compile(read(`_lib/${name}.mjs`), `${name}.ts`);
  }
  const hook = compile(read("hooks/use-communication-room-session.ts"), "use-communication-room-session.ts");
  return `(() => {
    const sources = ${JSON.stringify(modules)};
    const cache = {};
    const require = (name) => {
      if (cache[name]) return cache[name].exports;
      if (!sources[name]) throw new Error('Unmapped browser module: ' + name);
      const module = {exports:{}}; cache[name] = module;
      new Function('module','exports','require','process',sources[name])(module,module.exports,require,{env:{NODE_ENV:'production'}});
      return module.exports;
    };
    const React = require('react');
    const {createRoot} = require('react-dom/client');
    const {Presence} = require('phoenix');
    const PresenceAdapter = require('presence-adapter').default;
    const mediaPolicy = require('./communicationCallMediaPolicy.mjs');
    const membershipAdmission = require('membership-admission');
    const accountBoundRpc = require('./accountBoundSupabaseRpc.mjs');
    const hookSource = ${JSON.stringify(hook)};
    (${installLegacyPairedBrowser.toString()})({React, createRoot, Presence, PresenceAdapter, mediaPolicy, membershipAdmission, accountBoundRpc, hookSource, membershipStoreFactory: (${createLegacyBrowserMembershipStore.toString()}), audioReceiverFactory: (${createLegacyBrowserAudioReceiver.toString()})});
  })();`;
}

function installLegacyPairedBrowser({ React, createRoot, Presence, PresenceAdapter, mediaPolicy, membershipAdmission, accountBoundRpc, hookSource, membershipStoreFactory, audioReceiverFactory }) {
  const clone = (value) => structuredClone(value);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const granted = { granted: true, canAskAgain: true, status: "granted" };
  const permissions = { state: "granted", shouldOpenSettings: false, canAskAgain: true };
  const NativePeer = RTCPeerConnection;
  const membershipStore = membershipStoreFactory({ onCommit: (membership, operation) => {
    hub.events.push({ kind: "commit", operation, userId: membership.userId, mic: membership.micEnabled, camera: membership.cameraEnabled, state: membership.membershipState, generation: membership.membershipGeneration, admissionAttempt: membership.membershipAdmissionAttempt });
    for (const channel of hub.channels.filter((candidate) => candidate.active)) setTimeout(() => channel.emit("postgres_changes", "*", {}), 0);
  } });
  const hub = {
    channels: [], roomId: "BROWSER-CALL-1", serial: 0, callSerial: 1, endpointSerial: 0, peerSerial: 0,
    roomStatus: "active", dropAnswers: false, events: [], errors: [], endpoints: [], retiredEndpoints: [], heldSignals: [], holdNext: null,
    dispatch(message, sender) {
      for (const channel of this.channels.filter((candidate) => candidate.active && candidate.endpoint.userId !== sender.userId && candidate.topic === `comm-room-${message.roomId}`)) {
        // Delivery is independent of send acknowledgement, like Realtime.
        // Preserve the admission stamped when the relay accepted this packet,
        // including packets delayed across a later same-user app restart.
        setTimeout(() => channel.emit("broadcast", message.event, { payload: clone(message.payload) }), 0);
      }
    },
    async deliver(input, sender) {
      if (input.userId && input.userId !== sender.userId) throw new Error("browser signal account identity changed");
      const message = membershipStore.signal({ ...input, userId: sender.userId });
      this.events.push({ kind: "broadcast", event: message.event, sender: sender.userId, generation: message.payload.membershipGeneration, at: performance.now() });
      if (this.dropAnswers && message.event === "webrtc:answer") return true;
      if (this.holdNext?.userId === sender.userId && this.holdNext.event === message.event) {
        this.holdNext = null;
        this.heldSignals.push({ message: clone(message), sender });
        this.events.push({ kind: "held-signal", event: message.event, sender: sender.userId, generation: message.payload.membershipGeneration });
        return true;
      }
      this.dispatch(message, sender);
      return true;
    },
    snapshot() { return { room: { roomId: this.roomId, roomCode: this.roomId, status: this.roomStatus, hostUserId: "alice", callType: "video", createdAt: "2026-09-28T00:00:00Z" }, memberships: membershipStore.snapshot(this.roomId) }; },
    async membership(endpoint, operation, input) {
      // HTTP acknowledgement is a later task, never an in-stack Promise.
      await delay(2);
      if (input.userId !== endpoint.userId) throw new Error("browser membership account identity changed");
      return membershipStore[operation](input);
    },
  };
  class Channel {
    constructor(endpoint, topic, config) {
      this.endpoint = endpoint; this.topic = topic; this.key = config?.config?.presence?.key;
      this.handlers = []; this.state = {}; this.active = true; this.meta = null;
      hub.channels.push(this);
    }
    on(type, filter, callback) { this.handlers.push({ type, filter, callback }); return this; }
    emit(type, event, payload) {
      for (const handler of this.handlers.filter((h) => h.type === type && (h.filter.event === event || h.filter.event === "*"))) {
        try { Promise.resolve(handler.callback(payload)).catch((error) => hub.errors.push(String(error.stack ?? error))); }
        catch (error) { hub.errors.push(String(error.stack ?? error)); }
      }
    }
    presenceState() { return PresenceAdapter.transformState(this.state); }
    applyDiff(diff) {
      this.state = Presence.syncDiff(this.state, diff,
        (key, current, joined) => this.emit("presence", "join", PresenceAdapter.onJoinPayload(key, current, joined)),
        (key, current, left) => {
          hub.events.push({ kind: "presence-leave", key, remaining: current.metas.length });
          this.emit("presence", "leave", PresenceAdapter.onLeavePayload(key, current, left));
        });
      this.emit("presence", "sync", {});
    }
    subscribe(callback) {
      setTimeout(() => {
        if (!this.active) return;
        if (this.key) {
          for (const other of hub.channels.filter((c) => c.active && c.topic === this.topic && c.meta)) this.applyDiff({ joins: { [other.key]: { metas: [other.meta] } }, leaves: {} });
        }
        Promise.resolve(callback?.("SUBSCRIBED")).catch((error) => hub.errors.push(String(error.stack ?? error)));
      }, 2);
      return this;
    }
    async track(payload) {
      const old = this.meta;
      this.meta = { ...clone(payload), phx_ref: String(++hub.serial), ...(old ? { phx_ref_prev: old.phx_ref } : {}) };
      const diff = { joins: { [this.key]: { metas: [this.meta] } }, leaves: old ? { [this.key]: { metas: [old] } } : {} };
      for (const channel of hub.channels.filter((c) => c.active && c.topic === this.topic)) channel.applyDiff(clone(diff));
      return "ok";
    }
    async untrack() {
      if (this.meta) {
        const diff = { joins: {}, leaves: { [this.key]: { metas: [this.meta] } } };
        this.meta = null;
        for (const channel of hub.channels.filter((c) => c.active && c.topic === this.topic)) channel.applyDiff(clone(diff));
      }
      return "ok";
    }
    async send(message) { await hub.deliver({ ...message, roomId: this.topic.replace(/^comm-room-/u, "") }, this.endpoint); return "ok"; }
  }
  function createEndpoint(userId, { seed = true } = {}) {
    const endpoint = { userId, instanceId: ++hub.endpointSerial, peers: [], streams: [], audioContexts: [], drawTimers: [], receivedVideos: [], receivedAudio: [], output: null, root: null, current: true, mounted: true, pendingControl: null };
    hub.endpoints.push(endpoint);
    if (seed) membershipStore.seed({ roomId: hub.roomId, userId, displayName: userId, role: userId === "alice" ? "host" : "participant", membershipGeneration: crypto.randomUUID(), membershipAdmissionAttempt: null, membershipState: "active", cameraEnabled: true, micEnabled: true, joinedAt: "2026-09-28T00:00:00Z", leftAt: null, lastSeenAt: "2026-09-28T00:00:00Z" });
    const rtc = {
      RTCPeerConnection: class extends NativePeer {
        constructor(config) {
          super(config); endpoint.peers.push(this);
          this.fixturePeerId = ++hub.peerSerial; this.remoteDescriptionApplications = 0;
          this.addEventListener("icecandidate", (event) => hub.events.push({ kind: "ice-candidate", userId, present: !!event.candidate }));
          this.addEventListener("track", (event) => {
            if (event.track.kind === "audio") {
              const receiver = audioReceiverFactory(event.track);
              endpoint.audioContexts.push(receiver.context);
              endpoint.receivedAudio.push({ peer: this, track: event.track, ...receiver });
              void receiver.ready.catch((error) => hub.errors.push(`Receiver audio playout: ${error}`));
              return;
            }
            if (event.track.kind !== "video") return;
            const video = document.createElement("video");
            video.muted = true; video.autoplay = true; video.playsInline = true;
            video.srcObject = new MediaStream([event.track]); document.body.appendChild(video);
            const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 24;
            endpoint.receivedVideos.push({ peer: this, video, canvas });
            void video.play().catch((error) => hub.errors.push(`Receiver playback: ${error}`));
          });
        }
        async setRemoteDescription(description) {
          this.remoteDescriptionApplications += 1;
          return super.setRemoteDescription(description);
        }
      },
      RTCSessionDescription, RTCIceCandidate, MediaStream,
    };
    const createStream = async ({ audio, video }) => {
      const stream = new MediaStream();
      if (video) {
        const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 120;
        const context = canvas.getContext("2d"); let frame = 0;
        const draw = () => { frame += 1; context.fillStyle = userId === "alice" ? "#ff1010" : "#1020ff"; context.fillRect(0, 0, 160, 120); context.fillStyle = "white"; context.fillRect(frame % 140, 20, 20, 80); };
        draw(); endpoint.drawTimers.push(setInterval(draw, 40));
        canvas.captureStream(25).getVideoTracks().forEach((track) => stream.addTrack(track));
      }
      if (audio) {
        const audioContext = new AudioContext(); await audioContext.resume();
        const oscillator = audioContext.createOscillator(); oscillator.frequency.value = userId === "alice" ? 440 : 660;
        const destination = audioContext.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start();
        destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
        endpoint.audioContexts.push(audioContext);
      }
      endpoint.streams.push(stream);
      return stream;
    };
    const track = (stream, kind) => stream?.getTracks().find((item) => item.kind === kind) ?? null;
    const communication = {
      broadcastCommunicationRoomSignal: (input) => hub.deliver(input, endpoint),
      buildCommunicationChannelName: (roomId) => `comm-room-${roomId}`,
      buildCommunicationPresencePayload: ({ identity, media }) => ({ userId: identity.userId, displayName: identity.displayName, cameraOn: media.cameraEnabled, micOn: media.micEnabled, joinedAt: "2026-09-28T00:00:00Z" }),
      COMMUNICATION_DEFAULT_ICE_SERVERS: [], COMMUNICATION_ROOM_MAX_PARTICIPANTS: 4,
      createCommunicationMediaStream: createStream,
      getCommunicationRTCModule: () => rtc,
      getCommunicationStreamURL: (stream) => stream ? `browser-stream:${stream.id}` : "",
      getCommunicationTrack: track,
      getActiveCommunicationMemberships: (members) => members.filter((member) => !member.leftAt && member.membershipState !== "left"),
      getCommunicationRoomSnapshot: async () => { await delay(2); return hub.snapshot(); },
      readCommunicationIdentity: async () => ({ userId, displayName: userId }),
      prepareCommunicationRoomAdmission: (input) => hub.membership(endpoint, "prepare", input),
      joinCommunicationRoomSession: (input) => hub.membership(endpoint, "join", input),
      touchCommunicationRoomSession: (input) => hub.membership(endpoint, "touch", input),
      heartbeatCommunicationRoomSession: (input) => hub.membership(endpoint, "heartbeat", input),
      leaveCommunicationRoomSession: (input) => hub.membership(endpoint, "leave", input),
      endCommunicationRoom: async () => { hub.roomStatus = "ended"; return hub.snapshot().room; },
      stopCommunicationStream: (stream) => stream?.getTracks().forEach((item) => item.stop()),
      setCommunicationTrackEnabled: (stream, kind, enabled) => { const found = track(stream, kind); if (!found) return false; found.enabled = enabled; return true; },
    };
    const getPermission = async () => granted;
    const mocks = {
      react: React,
      "react-native": { AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) }, Linking: { openSettings: async () => {} } },
      "expo-av": { Audio: { getPermissionsAsync: async () => granted, requestPermissionsAsync: async () => granted } },
      "expo-camera": { useCameraPermissions: () => [granted, getPermission, getPermission] },
      "../_lib/accessEntitlements": { resolveRoomAccess: async () => ({ isAllowed: true }) },
      "../_lib/analytics": { trackEvent() {} },
      "../_lib/communication": communication,
      "../_lib/communicationMembershipAdmission": membershipAdmission,
      "../_lib/accountBoundSupabaseRpc.mjs": accountBoundRpc,
      "../_lib/communicationCallMediaPolicy.mjs": mediaPolicy,
      "../_lib/logger": { reportRuntimeError: (scope, error) => hub.events.push({ kind: "reported-error", userId, scope, error: String(error?.message ?? error) }) },
      "../_lib/mediaPermissions": { UNDETERMINED_MEDIA_PERMISSION: permissions, resolveMediaPermission: () => permissions, getMediaPermissionRecoveryMessage: () => null },
      "../_lib/mediaSessionLifecycle": { registerActiveMediaSessionStopper: () => () => {} },
      "../_lib/performancePolicy": { ROOM_HEARTBEAT_MS: 15_000 },
      "../_lib/roomRules": { normalizeRoomMembershipState: (value) => value },
      "../_lib/supabase": { supabase: {
        channel: (topic, config) => new Channel(endpoint, topic, config),
        getChannels: () => hub.channels.filter((channel) => channel.active && channel.endpoint === endpoint),
        realtime: { setAuth: async () => {} },
        removeChannel: async (channel) => { await channel.untrack(); channel.active = false; },
      } },
    };
    const module = { exports: {} };
    new Function("module", "exports", "require", "__DEV__", hookSource)(module, module.exports, (name) => {
      if (!(name in mocks)) throw new Error(`Unmapped production hook import: ${name}`);
      return mocks[name];
    }, false);
    endpoint.useHook = module.exports.useCommunicationRoomSession;
    const App = () => {
      endpoint.output = endpoint.useHook({ roomId: hub.roomId, authenticatedUserId: userId, authenticatedAccessToken: `synthetic-${userId}`, initialMediaPreferences: { cameraEnabled: true, micEnabled: true }, analyticsContext: { surface: "chat-thread" }, restartDisconnectedSession: false, enabled: endpoint.current });
      return null;
    };
    const container = document.createElement("div"); document.body.appendChild(container);
    endpoint.root = createRoot(container); endpoint.render = () => endpoint.root.render(React.createElement(App));
    endpoint.render();
    return endpoint;
  }
  const stats = async (endpoint) => {
    const reports = [];
    for (const peer of endpoint.peers.filter((candidate) => candidate.connectionState === "connected")) {
      for (const report of (await peer.getStats()).values()) {
        if (report.type === "inbound-rtp" && !report.isRemote) reports.push({ peerId: peer.fixturePeerId, kind: report.kind, bytes: report.bytesReceived ?? 0, packets: report.packetsReceived ?? 0, frames: report.framesDecoded ?? 0, energy: Number.isFinite(report.totalAudioEnergy) ? report.totalAudioEnergy : null, samples: Number.isFinite(report.totalSamplesReceived) ? report.totalSamplesReceived : null, samplesDuration: Number.isFinite(report.totalSamplesDuration) ? report.totalSamplesDuration : null });
      }
    }
    return reports;
  };
  const receivedPixels = (endpoint) => endpoint.receivedVideos.filter(({ peer, video }) => peer.connectionState !== "closed" && video.readyState >= 2).map(({ peer, video, canvas }) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let brightness = 0, fingerprint = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      brightness += pixels[i] + pixels[i + 1] + pixels[i + 2];
      fingerprint = (Math.imul(fingerprint, 31) + pixels[i] + 3 * pixels[i + 1] + 7 * pixels[i + 2]) >>> 0;
    }
    return { peerId: peer.fixturePeerId, brightness: brightness / (pixels.length / 4 * 3), fingerprint, mediaTime: video.currentTime };
  });
  const resources = (endpoint) => ({
    peers: endpoint.peers.map((peer) => ({ id: peer.fixturePeerId, connection: peer.connectionState, signaling: peer.signalingState, gathering: peer.iceGatheringState, localType: peer.localDescription?.type, remoteType: peer.remoteDescription?.type, remoteDescriptionApplications: peer.remoteDescriptionApplications, senders: peer.getSenders().map((sender) => sender.track?.kind ?? "none") })),
    tracks: endpoint.streams.flatMap((stream) => stream.getTracks().map((item) => ({ kind: item.kind, state: item.readyState, enabled: item.enabled }))),
    audioReceivers: endpoint.receivedAudio.map(({ peer, track, context }) => ({ peerId: peer.fixturePeerId, contextState: context.state, trackState: track.readyState, trackEnabled: track.enabled })),
  });
  window.__pairedCall = {
    async start({ dropAnswers = false } = {}) { hub.dropAnswers = dropAnswers; createEndpoint("alice"); createEndpoint("bob"); await delay(0); },
    holdNextSignal(userId, event) {
      if (hub.holdNext) throw new Error("A signal hold is already armed");
      hub.holdNext = { userId, event };
    },
    beginControl(userId, name, value) {
      const endpoint = hub.endpoints.find((item) => item.userId === userId);
      if (!endpoint?.output || typeof endpoint.output[name] !== "function") throw new Error(`Missing control ${name}`);
      const pending = { name, settled: false, result: null }; endpoint.pendingControl = pending;
      void Promise.resolve(endpoint.output[name](value)).then((result) => {
        pending.settled = true; pending.result = result;
      }, (error) => { pending.settled = true; hub.errors.push(String(error.stack ?? error)); });
    },
    async restartEndpoint(userId) {
      const previous = hub.endpoints.find((endpoint) => endpoint.userId === userId);
      if (!previous) throw new Error(`Missing endpoint ${userId}`);
      const previousMembershipGeneration = membershipStore.read({ roomId: hub.roomId, userId })?.membershipGeneration;
      previous.current = false; previous.root.unmount(); previous.mounted = false;
      hub.endpoints = hub.endpoints.filter((endpoint) => endpoint !== previous);
      hub.retiredEndpoints.push(previous);
      // Preserve the durable ACTIVE row, like a process restart without End.
      // Only the new production hook's owned join can replace its generation.
      const replacement = createEndpoint(userId, { seed: false });
      await delay(0);
      return { roomId: hub.roomId, retiredInstanceId: previous.instanceId, replacementInstanceId: replacement.instanceId, previousMembershipGeneration };
    },
    async releaseHeldSignals() {
      const queued = hub.heldSignals.splice(0);
      for (const { message, sender } of queued) {
        hub.events.push({ kind: "released-signal", event: message.event, sender: sender.userId, generation: message.payload.membershipGeneration });
        hub.dispatch(message, sender);
      }
      await delay(0);
      return queued.length;
    },
    async freshCall() {
      if ([...hub.endpoints, ...hub.retiredEndpoints].some((endpoint) => endpoint.peers.some((peer) => peer.connectionState !== "closed") || endpoint.streams.some((stream) => stream.getTracks().some((track) => track.readyState !== "ended")))) throw new Error("Previous native resources must be closed before a fresh call");
      const previousRoomId = hub.roomId;
      hub.roomId = `BROWSER-CALL-${++hub.callSerial}`; hub.roomStatus = "active";
      for (const endpoint of hub.endpoints) {
        const previous = membershipStore.read({ roomId: previousRoomId, userId: endpoint.userId });
        membershipStore.seed({ ...previous, roomId: hub.roomId, membershipGeneration: crypto.randomUUID(), membershipAdmissionAttempt: null, membershipState: "active", leftAt: null, cameraEnabled: false, micEnabled: false });
      }
      for (const endpoint of hub.endpoints) endpoint.render();
      await delay(0);
    },
    async read() { return { roomId: hub.roomId, errors: [...hub.errors], events: clone(hub.events), heldSignals: hub.heldSignals.map(({ message, sender }) => ({ event: message.event, sender: sender.userId, generation: message.payload.membershipGeneration })), retiredEndpoints: hub.retiredEndpoints.map((endpoint) => ({ userId: endpoint.userId, instanceId: endpoint.instanceId, pendingControl: clone(endpoint.pendingControl), ...resources(endpoint) })), endpoints: await Promise.all(hub.endpoints.map(async (endpoint) => ({
      userId: endpoint.userId, instanceId: endpoint.instanceId, membership: membershipStore.read({ roomId: hub.roomId, userId: endpoint.userId }), channelState: endpoint.output?.channelState, error: endpoint.output?.error, micEnabled: endpoint.output?.micEnabled, cameraEnabled: endpoint.output?.cameraEnabled,
      participants: endpoint.output?.participants?.map(({ streamURL: _url, ...rest }) => rest), stats: await stats(endpoint), pixels: receivedPixels(endpoint),
      ...resources(endpoint),
    }))) }; },
    async control(userId, name, value) { const endpoint = hub.endpoints.find((item) => item.userId === userId); if (!endpoint?.output || typeof endpoint.output[name] !== "function") throw new Error(`Missing control ${name}`); return endpoint.output[name](value); },
    async end() { await Promise.all(hub.endpoints.map((endpoint) => endpoint.output.leaveRoom())); },
    async dispose() { for (const endpoint of [...hub.endpoints, ...hub.retiredEndpoints]) { if (endpoint.mounted) endpoint.root.unmount(); endpoint.mounted = false; endpoint.drawTimers.forEach(clearInterval); endpoint.streams.forEach((stream) => stream.getTracks().forEach((item) => item.stop())); endpoint.peers.forEach((peer) => peer.close()); for (const context of endpoint.audioContexts) await context.close(); } },
  };
}
