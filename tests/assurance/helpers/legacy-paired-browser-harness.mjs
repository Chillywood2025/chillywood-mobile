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
  for (const name of ["communicationCallMediaPolicy", "nativeCallTransitionProvenance", "communicationRoomIdentifier"]) {
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
    const hookSource = ${JSON.stringify(hook)};
    (${installLegacyPairedBrowser.toString()})({React, createRoot, Presence, PresenceAdapter, mediaPolicy, membershipAdmission, hookSource});
  })();`;
}

function installLegacyPairedBrowser({ React, createRoot, Presence, PresenceAdapter, mediaPolicy, membershipAdmission, hookSource }) {
  const clone = (value) => structuredClone(value);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const granted = { granted: true, canAskAgain: true, status: "granted" };
  const permissions = { state: "granted", shouldOpenSettings: false, canAskAgain: true };
  const NativePeer = RTCPeerConnection;
  const hub = {
    channels: [], memberships: new Map(), roomId: "BROWSER-CALL-1", serial: 0, callSerial: 1,
    roomStatus: "active", dropAnswers: false, events: [], errors: [], endpoints: [],
    async deliver(message, sender) {
      this.events.push({ kind: "broadcast", event: message.event, sender: sender.userId, at: performance.now() });
      if (this.dropAnswers && message.event === "webrtc:answer") return true;
      for (const channel of this.channels.filter((candidate) => candidate.active && candidate.endpoint !== sender && candidate.topic.startsWith("comm-room-"))) {
        // Delivery is independent of send acknowledgement, like Realtime.
        setTimeout(() => channel.emit("broadcast", message.event, { payload: { ...clone(message.payload), roomId: this.roomId, fromUserId: sender.userId } }), 0);
      }
      return true;
    },
    snapshot() { return { room: { roomId: this.roomId, roomCode: this.roomId, status: this.roomStatus, hostUserId: "alice", callType: "video", createdAt: "2026-09-28T00:00:00Z" }, memberships: clone([...this.memberships.values()]) }; },
    async membership(endpoint, input) {
      // HTTP acknowledgement is a later task, never an in-stack Promise.
      await delay(2);
      const previous = this.memberships.get(endpoint.userId);
      const next = { ...previous, ...input, userId: endpoint.userId, roomId: this.roomId };
      if (!next.membershipGeneration || (previous?.membershipState === "left" && input.membershipState === "active")) next.membershipGeneration = crypto.randomUUID();
      this.memberships.set(endpoint.userId, next);
      this.events.push({ kind: "commit", userId: endpoint.userId, mic: next.micEnabled, camera: next.cameraEnabled, state: next.membershipState });
      for (const channel of this.channels.filter((candidate) => candidate.active)) setTimeout(() => channel.emit("postgres_changes", "*", {}), 0);
      return clone(next);
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
    async send(message) { await hub.deliver(message, this.endpoint); return "ok"; }
  }
  function createEndpoint(userId) {
    const endpoint = { userId, peers: [], streams: [], audioContexts: [], drawTimers: [], receivedVideos: [], output: null, root: null, current: true };
    hub.endpoints.push(endpoint);
    hub.memberships.set(userId, { roomId: hub.roomId, userId, displayName: userId, role: userId === "alice" ? "host" : "participant", membershipGeneration: crypto.randomUUID(), membershipState: "active", cameraEnabled: true, micEnabled: true, joinedAt: "2026-09-28T00:00:00Z", leftAt: null, lastSeenAt: "2026-09-28T00:00:00Z" });
    const rtc = {
      RTCPeerConnection: class extends NativePeer {
        constructor(config) {
          super(config); endpoint.peers.push(this);
          this.addEventListener("icecandidate", (event) => hub.events.push({ kind: "ice-candidate", userId, present: !!event.candidate }));
          this.addEventListener("track", (event) => {
            if (event.track.kind !== "video") return;
            const video = document.createElement("video");
            video.muted = true; video.autoplay = true; video.playsInline = true;
            video.srcObject = new MediaStream([event.track]); document.body.appendChild(video);
            const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 24;
            endpoint.receivedVideos.push({ peer: this, video, canvas });
            void video.play().catch((error) => hub.errors.push(`Receiver playback: ${error}`));
          });
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
      broadcastCommunicationRoomSignal: (input) => hub.deliver({ event: input.event, payload: input.payload }, endpoint),
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
      joinCommunicationRoomSession: (input) => hub.membership(endpoint, input),
      touchCommunicationRoomSession: (input) => hub.membership(endpoint, input),
      heartbeatCommunicationRoomSession: async () => clone(hub.memberships.get(userId)),
      leaveCommunicationRoomSession: ({ expectedMembershipGeneration }) => {
        if (!expectedMembershipGeneration || hub.memberships.get(userId)?.membershipGeneration !== expectedMembershipGeneration) return Promise.resolve(null);
        return hub.membership(endpoint, { membershipState: "left", micEnabled: false, cameraEnabled: false, leftAt: new Date().toISOString() });
      },
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
    for (const peer of endpoint.peers) {
      for (const report of (await peer.getStats()).values()) {
        if (report.type === "inbound-rtp" && !report.isRemote) reports.push({ kind: report.kind, bytes: report.bytesReceived ?? 0, packets: report.packetsReceived ?? 0, frames: report.framesDecoded ?? 0, energy: report.totalAudioEnergy ?? 0, samples: report.totalSamplesReceived ?? 0 });
      }
    }
    return reports;
  };
  const receivedPixels = (endpoint) => endpoint.receivedVideos.filter(({ peer, video }) => peer.connectionState !== "closed" && video.readyState >= 2).map(({ video, canvas }) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let brightness = 0, fingerprint = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      brightness += pixels[i] + pixels[i + 1] + pixels[i + 2];
      fingerprint = (Math.imul(fingerprint, 31) + pixels[i] + 3 * pixels[i + 1] + 7 * pixels[i + 2]) >>> 0;
    }
    return { brightness: brightness / (pixels.length / 4 * 3), fingerprint, mediaTime: video.currentTime };
  });
  window.__pairedCall = {
    async start({ dropAnswers = false } = {}) { hub.dropAnswers = dropAnswers; createEndpoint("alice"); createEndpoint("bob"); await delay(0); },
    async freshCall() {
      if (hub.endpoints.some((endpoint) => endpoint.peers.some((peer) => peer.connectionState !== "closed") || endpoint.streams.some((stream) => stream.getTracks().some((track) => track.readyState !== "ended")))) throw new Error("Previous native resources must be closed before a fresh call");
      hub.roomId = `BROWSER-CALL-${++hub.callSerial}`; hub.roomStatus = "active";
      for (const endpoint of hub.endpoints) {
        const previous = hub.memberships.get(endpoint.userId);
        hub.memberships.set(endpoint.userId, { ...previous, roomId: hub.roomId, membershipGeneration: crypto.randomUUID(), membershipState: "active", leftAt: null, cameraEnabled: false, micEnabled: false });
      }
      for (const endpoint of hub.endpoints) endpoint.render();
      await delay(0);
    },
    async read() { return { errors: [...hub.errors], events: clone(hub.events), endpoints: await Promise.all(hub.endpoints.map(async (endpoint) => ({
      userId: endpoint.userId, channelState: endpoint.output?.channelState, error: endpoint.output?.error, micEnabled: endpoint.output?.micEnabled, cameraEnabled: endpoint.output?.cameraEnabled,
      participants: endpoint.output?.participants?.map(({ streamURL: _url, ...rest }) => rest), stats: await stats(endpoint), pixels: receivedPixels(endpoint),
      peers: endpoint.peers.map((peer) => ({ connection: peer.connectionState, signaling: peer.signalingState, gathering: peer.iceGatheringState, localType: peer.localDescription?.type, remoteType: peer.remoteDescription?.type, senders: peer.getSenders().map((sender) => sender.track?.kind ?? "none") })),
      tracks: endpoint.streams.flatMap((stream) => stream.getTracks().map((item) => ({ kind: item.kind, state: item.readyState, enabled: item.enabled }))),
    }))) }; },
    async control(userId, name, value) { const endpoint = hub.endpoints.find((item) => item.userId === userId); if (!endpoint?.output || typeof endpoint.output[name] !== "function") throw new Error(`Missing control ${name}`); return endpoint.output[name](value); },
    async end() { await Promise.all(hub.endpoints.map((endpoint) => endpoint.output.leaveRoom())); },
    async dispose() { for (const endpoint of hub.endpoints) { endpoint.root.unmount(); endpoint.drawTimers.forEach(clearInterval); endpoint.streams.forEach((stream) => stream.getTracks().forEach((item) => item.stop())); endpoint.peers.forEach((peer) => peer.close()); for (const context of endpoint.audioContexts) await context.close(); } },
  };
}
