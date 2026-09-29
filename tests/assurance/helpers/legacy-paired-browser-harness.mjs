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

// Measure a sustained interval of received PCM, not an assumed wall-clock
// drain. WebRTC playout and AudioWorklet messages can lag the test runner.
// The caller still owns a bounded deadline: continuous audio or absent input
// must never become a success simply because the receiver has not caught up.
export function createLegacyBrowserSilenceObservation({ minimumDurationSeconds = 0.3, maximumEnergy = 0.0001 } = {}) {
  if (!(minimumDurationSeconds > 0) || !(maximumEnergy > 0)) throw new Error("Invalid silence observation limits");
  let baseline = null, previous = null, lastWindow = null;
  let noisyWindows = 0, observations = 0;
  const inspect = (observation) => {
    const { samples, energy, packets, sampleRate } = observation;
    if (!Number.isSafeInteger(samples) || samples < 0 || !Number.isFinite(energy) || energy < 0
      || !Number.isSafeInteger(packets) || packets < 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error("Missing or invalid received PCM/RTP observation");
    }
    if (previous && (samples < previous.samples || energy < previous.energy || packets < previous.packets
      || sampleRate !== previous.sampleRate)) throw new Error("Received PCM/RTP observation changed identity or moved backwards");
    previous = { samples, energy, packets, sampleRate };
    observations += 1;
    if (!baseline) { baseline = previous; return false; }
    lastWindow = {
      samples: samples - baseline.samples, energy: energy - baseline.energy,
      packets: packets - baseline.packets, durationSeconds: (samples - baseline.samples) / sampleRate,
    };
    if (lastWindow.energy >= maximumEnergy) {
      noisyWindows += 1;
      baseline = previous;
      return false;
    }
    return lastWindow.samples > 0 && lastWindow.packets > 0
      && lastWindow.durationSeconds >= minimumDurationSeconds;
  };
  return { inspect, read: () => ({ minimumDurationSeconds, maximumEnergy, observations, noisyWindows, lastWindow }) };
}

export async function createLegacyBrowserAudioSource(frequency) {
  const context = new AudioContext(); await context.resume();
  const oscillator = context.createOscillator(); oscillator.frequency.value = frequency;
  const destination = context.createMediaStreamDestination();
  oscillator.connect(destination); oscillator.start();
  return { context, oscillator, stream: destination.stream, track: destination.stream.getAudioTracks()[0] };
}

export function createLegacyBrowserAudioReceiver(track) {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(new MediaStream([track]));
  // An actual media element consumes the remote WebRTC playout stream. The
  // separate worklet measures only this received track, before device muting.
  const playback = document.createElement("audio");
  playback.autoplay = true; playback.muted = false;
  playback.srcObject = new MediaStream([track]); document.body.appendChild(playback);
  const receiver = { context, source, playback, meter: null, samples: null, energy: null, error: null, ready: null };
  const moduleUrl = URL.createObjectURL(new Blob([`
    class ReceivedAudioMeter extends AudioWorkletProcessor {
      constructor() { super(); this.samples = 0; this.energy = 0; this.lastReport = 0; }
      process(inputs) {
        const channels = inputs[0];
        if (channels?.length && channels[0].length) {
          let squaredSamples = 0;
          for (const channel of channels) for (const sample of channel) squaredSamples += sample * sample;
          this.samples += channels[0].length;
          this.energy += squaredSamples / (sampleRate * channels.length);
          if (this.samples - this.lastReport >= 2048) {
            this.port.postMessage({ samples: this.samples, energy: this.energy });
            this.lastReport = this.samples;
          }
        }
        // Outputs remain zero. Only actual input PCM contributes observations;
        // disconnected/missing input never advances the input sample count.
        return true;
      }
    }
    registerProcessor('chilly-received-audio-meter', ReceivedAudioMeter);
  `], { type: "text/javascript" }));
  receiver.ready = (async () => {
    try { await context.audioWorklet.addModule(moduleUrl); }
    finally { URL.revokeObjectURL(moduleUrl); }
    const meter = new AudioWorkletNode(context, "chilly-received-audio-meter", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    receiver.meter = meter;
    meter.port.onmessage = ({ data }) => {
      if (!Number.isSafeInteger(data.samples) || data.samples < 0 || !Number.isFinite(data.energy) || data.energy < 0) {
        receiver.error = "Invalid received PCM observation"; return;
      }
      receiver.samples = data.samples; receiver.energy = data.energy;
    };
    meter.onprocessorerror = () => { receiver.error = "Received PCM processor failed"; };
    source.connect(meter); meter.connect(context.destination);
    await Promise.all([context.resume(), playback.play()]);
  })();
  receiver.dispose = async () => {
    playback.pause(); playback.srcObject = null; playback.remove();
    source.disconnect(); receiver.meter?.disconnect();
    if (context.state !== "closed") await context.close();
  };
  return receiver;
}

export async function createLegacyBrowserAudioControl({ audioSourceFactory, audioReceiverFactory }) {
  const sender = new RTCPeerConnection({ iceServers: [] });
  const receiver = new RTCPeerConnection({ iceServers: [] });
  const source = await audioSourceFactory(550);
  const errors = [], toSender = [], toReceiver = [];
  let received = null, receivedTrack = null;
  const recordError = (error) => errors.push(String(error.stack ?? error));
  const forward = (target, queued, candidate) => {
    if (!candidate) return;
    if (!target.remoteDescription) queued.push(candidate);
    else void target.addIceCandidate(candidate).catch(recordError);
  };
  sender.addEventListener("icecandidate", ({ candidate }) => forward(receiver, toReceiver, candidate));
  receiver.addEventListener("icecandidate", ({ candidate }) => forward(sender, toSender, candidate));
  receiver.addEventListener("track", ({ track }) => {
    if (track.kind !== "audio") return;
    receivedTrack = track; received = audioReceiverFactory(track);
    void received.ready.catch(recordError);
  });
  sender.addTrack(source.track, source.stream);
  const reports = async (peer) => [...(await peer.getStats()).values()]
    .filter((report) => ["media-source", "outbound-rtp", "inbound-rtp"].includes(report.type) && report.kind === "audio")
    .map((report) => ({ type: report.type, packetsSent: report.packetsSent ?? null, bytesSent: report.bytesSent ?? null, packetsReceived: report.packetsReceived ?? null, bytesReceived: report.bytesReceived ?? null, energy: Number.isFinite(report.totalAudioEnergy) ? report.totalAudioEnergy : null, samples: Number.isFinite(report.totalSamplesReceived) ? report.totalSamplesReceived : null, samplesDuration: Number.isFinite(report.totalSamplesDuration) ? report.totalSamplesDuration : null }));
  const control = {
    setEnabled(enabled) { source.track.enabled = enabled; },
    async read() {
      return {
        errors: [...errors], senderConnection: sender.connectionState, receiverConnection: receiver.connectionState,
        senderTrack: { enabled: source.track.enabled, state: source.track.readyState, contextState: source.context.state },
        received: received && { trackState: receivedTrack.readyState, trackEnabled: receivedTrack.enabled, contextState: received.context.state, playbackPaused: received.playback.paused, playbackReadyState: received.playback.readyState, pcmSampleRate: received.context.sampleRate, pcmSamples: received.samples, pcmEnergy: received.energy, error: received.error },
        senderStats: await reports(sender), receiverStats: await reports(receiver),
      };
    },
    async dispose() {
      sender.close(); receiver.close(); source.track.stop(); source.oscillator.stop();
      await received?.dispose(); await source.context.close();
    },
  };
  try {
    await sender.setLocalDescription(await sender.createOffer());
    await receiver.setRemoteDescription(sender.localDescription);
    for (const candidate of toReceiver.splice(0)) await receiver.addIceCandidate(candidate);
    await receiver.setLocalDescription(await receiver.createAnswer());
    await sender.setRemoteDescription(receiver.localDescription);
    for (const candidate of toSender.splice(0)) await sender.addIceCandidate(candidate);
    return control;
  } catch (error) { await control.dispose(); throw error; }
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

export function buildLegacyPairedBrowserBundle({ sourceRoot = process.cwd(), authenticatedBackend = false } = {}) {
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
  for (const name of ["communicationCallMediaPolicy", "nativeCallTransitionProvenance", "communicationRoomIdentifier", "accountBoundSupabaseRpc", "nativeCallErrorDiagnostics"]) {
    modules[`./${name}.mjs`] = compile(read(`_lib/${name}.mjs`), `${name}.ts`);
  }
  const hook = compile(read("hooks/use-communication-room-session.ts"), "use-communication-room-session.ts");
  const captureRetirementSource = compile(read("_lib/communicationCaptureRetirement.ts"), "communicationCaptureRetirement.ts");
  const backendSources = authenticatedBackend ? Object.fromEntries([
    "communication", "accountSessionAuthority", "accountBoundSupabaseMutation", "entitlementAuthority", "roomRules", "performancePolicy",
  ].map((name) => [`./${name}`, compile(read(`_lib/${name}.ts`), `${name}.ts`)])) : null;
  return `${authenticatedBackend ? read("node_modules/@supabase/supabase-js/dist/umd/supabase.js") : ""}\n(() => {
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
    const nativeCallErrorDiagnostics = require('./nativeCallErrorDiagnostics.mjs');
    const membershipAdmission = require('membership-admission');
    const accountBoundRpc = require('./accountBoundSupabaseRpc.mjs');
    const hookSource = ${JSON.stringify(hook)};
    (${installLegacyPairedBrowser.toString()})({React, createRoot, Presence, PresenceAdapter, mediaPolicy, nativeCallErrorDiagnostics, membershipAdmission, accountBoundRpc, hookSource, captureRetirementSource: ${JSON.stringify(captureRetirementSource)}, backendSources: ${JSON.stringify(backendSources)}, authenticatedRuntimeFactory: (${createAuthenticatedBrowserRuntime.toString()}), membershipStoreFactory: (${createLegacyBrowserMembershipStore.toString()}), audioSourceFactory: (${createLegacyBrowserAudioSource.toString()}), audioReceiverFactory: (${createLegacyBrowserAudioReceiver.toString()}), audioControlFactory: (${createLegacyBrowserAudioControl.toString()})});
  })();`;
}

async function createAuthenticatedBrowserRuntime({ sources, connection, endpoint, boundRpc, checkSourceOnly = false }) {
  const url = new URL(connection.apiUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Authenticated browser fixture requires disposable loopback Supabase");
  if (!sources || typeof window.supabase?.createClient !== "function") throw new Error("Authenticated browser bundle is required");
  const client = window.supabase.createClient(connection.apiUrl, connection.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, storageKey: `browser-fixture-${endpoint.userId}` },
  });
  const bootstrap = { supabase: client, SUPABASE_URL: connection.apiUrl, SUPABASE_ANON_KEY: connection.anonKey };
  const unavailable = (label) => new Proxy({}, { get(_target, name) { throw new Error(`Unexpected ${label} dependency: ${String(name)}`); } });
  const imports = {
    "./supabase": bootstrap,
    "./accountBoundSupabaseRpc.mjs": boundRpc,
    "react-native": { Platform: { OS: "web" } },
    "expo-constants": { __esModule: true, default: { expoConfig: { extra: {} } } },
    "./appConfig": unavailable("room creation"),
    "./monetization": unavailable("monetization"),
    "./watchParty": unavailable("fallback identity"),
    // Only display metadata is controlled. readCommunicationIdentity still
    // executes production source and actual SDK auth.getUser; membership and
    // mutation authority bind the supplied UUID to the real signed-in session.
    "./userData": {
      readUserProfile: async () => ({ username: endpoint.displayName, avatarIndex: 0 }),
      buildUserChannelProfile: ({ profile, avatarUrl }) => ({ displayName: profile.username, avatarUrl, tagline: "" }),
    },
  };
  const cache = {};
  const load = (name) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (cache[name]) return cache[name].exports;
    if (!sources[name]) throw new Error(`Unmapped authenticated browser application module: ${name}`);
    const module = { exports: {} }; cache[name] = module;
    new Function("module", "exports", "require", "process", sources[name])(module, module.exports, load, { env: {} });
    return module.exports;
  };
  const authority = load("./accountSessionAuthority");
  const api = load("./communication");
  if (checkSourceOnly) return { api };
  const signedIn = await client.auth.setSession(endpoint.session);
  if (signedIn.error || signedIn.data.user?.id !== endpoint.userId) throw new Error("Authenticated browser endpoint session was not confirmed");
  const binding = await authority.readCurrentAccountSessionAuthority();
  if (!binding || binding.userId !== endpoint.userId) throw new Error("Actual server current-session authority was not confirmed");
  authority.publishAccountSessionAuthoritySnapshot(binding);
  return { client, api, accessToken: signedIn.data.session.access_token, authority };
}

function installLegacyPairedBrowser({ React, createRoot, Presence, PresenceAdapter, mediaPolicy, nativeCallErrorDiagnostics, membershipAdmission, accountBoundRpc, hookSource, captureRetirementSource, backendSources, authenticatedRuntimeFactory, membershipStoreFactory, audioSourceFactory, audioReceiverFactory, audioControlFactory }) {
  const clone = (value) => structuredClone(value);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const granted = { granted: true, canAskAgain: true, status: "granted" };
  const permissions = { state: "granted", shouldOpenSettings: false, canAskAgain: true };
  const NativePeer = RTCPeerConnection;
  const membershipStore = membershipStoreFactory({ onCommit: (membership, operation) => {
    hub.events.push({ kind: "commit", operation, userId: membership.userId, mic: membership.micEnabled, camera: membership.cameraEnabled, state: membership.membershipState, generation: membership.membershipGeneration, admissionAttempt: membership.membershipAdmissionAttempt });
    hub.invalidate(membership.roomId);
  } });
  const hub = {
    channels: [], roomId: "BROWSER-CALL-1", serial: 0, callSerial: 1, endpointSerial: 0, peerSerial: 0,
    roomStatus: "active", callType: "video", hostUserId: "alice", dropAnswers: false, events: [], operationResults: [], errors: [], endpoints: [], retiredEndpoints: [], heldSignals: [], holdNext: null,
    backend: false, backendRuntimes: new Map(), captureRetirementModules: new Map(),
    invalidate(roomId) {
      // The database trigger invalidates only the authorized room topic; it
      // exposes no membership row contents, including on DELETE.
      for (const channel of this.channels.filter((candidate) => candidate.active
        && candidate.topic === `comm-room-${roomId}`)) {
        setTimeout(() => { if (channel.active) channel.emit("broadcast", "state:update", { payload: {} }); }, 0);
      }
    },
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
    snapshot() { return { room: { roomId: this.roomId, roomCode: this.roomId, status: this.roomStatus, hostUserId: this.hostUserId, callType: this.callType, createdAt: "2026-09-28T00:00:00Z" }, memberships: membershipStore.snapshot(this.roomId) }; },
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
  function createEndpoint(userId, { seed = true, backendRuntime = null } = {}) {
    let captureRetirement = hub.captureRetirementModules.get(userId);
    if (!captureRetirement) {
      const module = { exports: {} };
      new Function("module", "exports", captureRetirementSource)(module, module.exports);
      captureRetirement = module.exports;
      // Each endpoint models a separate device/process; its remounted hook
      // retains the actual process coordinator, without sharing it with peers.
      hub.captureRetirementModules.set(userId, captureRetirement);
    }
    const endpoint = { userId, instanceId: ++hub.endpointSerial, appState: "active", appStateListeners: new Set(), peers: [], streams: [], acquiredTracks: [], audioContexts: [], drawTimers: [], receivedVideos: [], receivedAudio: [], output: null, root: null, current: true, mounted: true, pendingControl: null };
    let operationSerial = 0;
    const observeOperation = (operation, method) => function (...args) {
      const started = performance.now();
      const action = endpoint.controlLabel ?? "startup";
      const operationId = ++operationSerial;
      const record = (phase, status, value) => {
        try {
          const matchesRequested = {};
          if (operation === "touchCommunicationRoomSession" && phase === "settled") {
            for (const field of ["cameraEnabled", "micEnabled", "membershipState"]) {
              if (args[0]?.[field] !== undefined) matchesRequested[field] = value?.[field] === args[0][field];
            }
          }
          hub.operationResults.push({ endpoint: userId === hub.hostUserId ? "host" : "participant", action, operation, operationId,
            phase, status, elapsedMs: Math.round(performance.now() - started),
            ...(Object.keys(matchesRequested).length ? { matchesRequested } : {}) });
          if (hub.operationResults.length > 40) hub.operationResults.shift();
        } catch { /* Diagnostics never alter SDK settlement. */ }
      };
      const status = (value) => ["ok", "error", "timed out"].includes(value) ? value
        : value === true ? "confirmed" : value === false ? "unconfirmed" : value == null ? "empty" : "returned";
      record("started", "pending");
      if (operation === "sdk.subscribe" && typeof args[0] === "function") {
        const callback = args[0];
        args[0] = function (...callbackArgs) {
          const nextStatus = ["SUBSCRIBED", "TIMED_OUT", "CHANNEL_ERROR", "CLOSED"].includes(callbackArgs[0]) ? callbackArgs[0] : "unknown";
          record("subscription", nextStatus);
          return Reflect.apply(callback, this, callbackArgs);
        };
      }
      try {
        const result = Reflect.apply(method, this, args);
        if (result && typeof result.then === "function") void result.then((value) => record("settled", status(value), value), () => record("settled", "rejected"));
        else record("settled", status(result), result);
        return result;
      } catch (error) { record("settled", "threw"); throw error; }
    };
    if (backendRuntime) {
      const originalChannel = backendRuntime.client.channel;
      const observed = new WeakSet();
      backendRuntime.client.channel = function (...args) {
        const channel = Reflect.apply(originalChannel, this, args);
        if (!observed.has(channel)) {
          observed.add(channel);
          for (const operation of ["track", "send", "subscribe"]) channel[operation] = observeOperation(`sdk.${operation}`, channel[operation]);
        }
        return channel;
      };
    }
    hub.endpoints.push(endpoint);
    if (seed) membershipStore.seed({ roomId: hub.roomId, userId, displayName: userId, role: userId === hub.hostUserId ? "host" : "participant", membershipGeneration: crypto.randomUUID(), membershipAdmissionAttempt: null, membershipState: "active", cameraEnabled: hub.callType === "video", micEnabled: true, joinedAt: "2026-09-28T00:00:00Z", leftAt: null, lastSeenAt: "2026-09-28T00:00:00Z" });
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
              endpoint.receivedAudio.push({ peer: this, track: event.track, receiver });
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
        canvas.captureStream(25).getVideoTracks().forEach((track) => { stream.addTrack(track); endpoint.acquiredTracks.push(track); });
      }
      if (audio) {
        const source = await audioSourceFactory(userId === "alice" ? 440 : 660);
        stream.addTrack(source.track); endpoint.acquiredTracks.push(source.track); endpoint.audioContexts.push(source.context);
      }
      endpoint.streams.push(stream);
      return stream;
    };
    const track = (stream, kind) => stream?.getTracks().find((item) => item.kind === kind) ?? null;
    let communication = {
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
      endCommunicationRoom: async () => { hub.roomStatus = "ended"; hub.invalidate(hub.roomId); return hub.snapshot().room; },
      stopCommunicationStream: (stream) => stream?.getTracks().forEach((item) => item.stop()),
      setCommunicationTrackEnabled: (stream, kind, enabled) => { const found = track(stream, kind); if (!found) return false; found.enabled = enabled; return true; },
    };
    if (backendRuntime) {
      const platformMedia = Object.fromEntries([
        "createCommunicationMediaStream", "getCommunicationRTCModule", "getCommunicationStreamURL",
        "getCommunicationTrack", "stopCommunicationStream", "setCommunicationTrackEnabled",
      ].map((name) => [name, communication[name]]));
      for (const name of Object.keys(communication)) {
        if (!Object.hasOwn(platformMedia, name) && name !== "COMMUNICATION_DEFAULT_ICE_SERVERS"
          && !Object.hasOwn(backendRuntime.api, name)) throw new Error(`Missing production communication export: ${name}`);
      }
      // Construct from actual exports, rather than retaining any simulated
      // membership/signaling method when a production API changes its name.
      communication = { ...backendRuntime.api, ...platformMedia, COMMUNICATION_DEFAULT_ICE_SERVERS: [] };
      for (const operation of ["touchCommunicationRoomSession", "heartbeatCommunicationRoomSession", "broadcastCommunicationRoomSignal"]) {
        communication[operation] = observeOperation(operation, communication[operation]);
      }
      const broadcast = communication.broadcastCommunicationRoomSignal;
      communication.broadcastCommunicationRoomSignal = async (input) => {
        const result = await broadcast(input);
        hub.events.push({ kind: "authenticated-broadcast", event: input.event, sender: userId });
        return result;
      };
    }
    const getPermission = async () => granted;
    const mocks = {
      react: React,
      "react-native": { AppState: {
        get currentState() { return endpoint.appState; },
        addEventListener(event, callback) {
          if (event !== "change") throw new Error(`Unsupported browser AppState event: ${event}`);
          endpoint.appStateListeners.add(callback);
          return { remove: () => endpoint.appStateListeners.delete(callback) };
        },
      }, Linking: { openSettings: async () => {} } },
      "expo-av": { Audio: { getPermissionsAsync: async () => granted, requestPermissionsAsync: async () => granted } },
      "expo-camera": { useCameraPermissions: () => [granted, getPermission, getPermission] },
      "../_lib/accessEntitlements": { resolveRoomAccess: async () => {
        if (backendRuntime) throw new Error("Authenticated browser admission failed; client access fallback is outside this baseline");
        return { isAllowed: true };
      } },
      "../_lib/analytics": { trackEvent() {} },
      "../_lib/communication": communication,
      "../_lib/communicationMembershipAdmission": membershipAdmission,
      "../_lib/communicationCaptureRetirement": captureRetirement,
      "../_lib/accountBoundSupabaseRpc.mjs": accountBoundRpc,
      "../_lib/communicationCallMediaPolicy.mjs": mediaPolicy,
      "../_lib/logger": { reportRuntimeError: (scope, error) => hub.events.push({ kind: "reported-error", userId, scope, error: String(error?.message ?? error) }) },
      "../_lib/nativeCallErrorDiagnostics.mjs": nativeCallErrorDiagnostics,
      "../_lib/mediaPermissions": { UNDETERMINED_MEDIA_PERMISSION: permissions, resolveMediaPermission: () => permissions, getMediaPermissionRecoveryMessage: () => null },
      "../_lib/mediaSessionLifecycle": { registerActiveMediaSessionStopper: () => () => {} },
      "../_lib/performancePolicy": { ROOM_HEARTBEAT_MS: 15_000 },
      "../_lib/roomRules": { normalizeRoomMembershipState: (value) => value },
      "../_lib/supabase": { supabase: backendRuntime?.client ?? {
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
      endpoint.output = endpoint.useHook({ roomId: hub.roomId, authenticatedUserId: userId, authenticatedAccessToken: backendRuntime?.accessToken ?? `synthetic-${userId}`, initialMediaPreferences: { cameraEnabled: hub.callType === "video", micEnabled: true }, analyticsContext: { surface: "chat-thread" }, restartDisconnectedSession: false, enabled: endpoint.current });
      return null;
    };
    const container = document.createElement("div"); document.body.appendChild(container);
    endpoint.root = createRoot(container); endpoint.render = () => endpoint.root.render(React.createElement(App));
    endpoint.render();
    return endpoint;
  }
  const stats = async (endpoint) => {
    const reports = [], outgoingAudio = [];
    for (const peer of endpoint.peers.filter((candidate) => candidate.connectionState === "connected")) {
      for (const report of (await peer.getStats()).values()) {
        if (report.type === "inbound-rtp" && !report.isRemote) reports.push({ peerId: peer.fixturePeerId, kind: report.kind, bytes: report.bytesReceived ?? 0, packets: report.packetsReceived ?? 0, frames: report.framesDecoded ?? 0, energy: Number.isFinite(report.totalAudioEnergy) ? report.totalAudioEnergy : null, samples: Number.isFinite(report.totalSamplesReceived) ? report.totalSamplesReceived : null, samplesDuration: Number.isFinite(report.totalSamplesDuration) ? report.totalSamplesDuration : null });
        if (["media-source", "outbound-rtp"].includes(report.type) && report.kind === "audio") outgoingAudio.push({ peerId: peer.fixturePeerId, type: report.type, packets: report.packetsSent ?? null, bytes: report.bytesSent ?? null, energy: Number.isFinite(report.totalAudioEnergy) ? report.totalAudioEnergy : null, samplesDuration: Number.isFinite(report.totalSamplesDuration) ? report.totalSamplesDuration : null });
      }
    }
    return { stats: reports, outgoingAudio };
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
    peers: endpoint.peers.map((peer) => ({ id: peer.fixturePeerId, connection: peer.connectionState, ice: peer.iceConnectionState, signaling: peer.signalingState, gathering: peer.iceGatheringState, localType: peer.localDescription?.type, remoteType: peer.remoteDescription?.type, remoteDescriptionApplications: peer.remoteDescriptionApplications, senders: peer.getSenders().map((sender) => sender.track?.kind ?? "none") })),
    // Acquisition identities survive stream.removeTrack during hook rollback.
    tracks: endpoint.acquiredTracks.map((item) => ({ id: item.id, kind: item.kind, state: item.readyState, enabled: item.enabled })),
    audioReceivers: endpoint.receivedAudio.map(({ peer, track, receiver }) => ({ peerId: peer.fixturePeerId, connection: peer.connectionState, contextState: receiver.context.state, trackState: track.readyState, trackEnabled: track.enabled, playbackPaused: receiver.playback.paused, playbackReadyState: receiver.playback.readyState, pcmSampleRate: receiver.context.sampleRate, pcmSamples: receiver.samples, pcmEnergy: receiver.energy, error: receiver.error })),
  });
  window.__pairedCall = {
    async replaceLegacyPresenceMetadata(userId) {
      if (hub.backend) throw new Error("Legacy metadata injection belongs only to the in-memory compatibility fixture");
      const channels = hub.channels.filter((channel) => channel.active && channel.endpoint.userId === userId
        && channel.topic === `comm-room-${hub.roomId}` && channel.meta);
      if (channels.length !== 1) throw new Error(`Expected one online legacy sender for ${userId}`);
      const member = membershipStore.snapshot(hub.roomId).find((membership) => membership.userId === userId);
      if (!member) throw new Error(`Missing legacy sender membership for ${userId}`);
      const { phx_ref: _oldRef, phx_ref_prev: _previousRef, ...identity } = channels[0].meta;
      // Old clients still retrack media metadata. Exercise their wire diff
      // through actual Phoenix reconciliation while the new hook keeps its
      // own one-registration policy and existing connected RTCPeerConnection.
      return channels[0].track({ ...identity, cameraOn: member.cameraEnabled, micOn: member.micEnabled });
    },
    async checkAuthenticatedSource() {
      const { api } = await authenticatedRuntimeFactory({ sources: backendSources, boundRpc: accountBoundRpc, checkSourceOnly: true,
        connection: { apiUrl: "http://127.0.0.1:54321", anonKey: "source-check-not-a-key" },
        endpoint: { userId: "00000000-0000-4000-8000-000000000001", displayName: "Source check" } });
      return ["prepareCommunicationRoomAdmission", "joinCommunicationRoomSession", "touchCommunicationRoomSession", "getCommunicationRoomSnapshot", "broadcastCommunicationRoomSignal", "leaveCommunicationRoomSession"].every((name) => typeof api[name] === "function");
    },
    async startAudioControl() { window.__pairedAudioControl = await audioControlFactory({ audioSourceFactory, audioReceiverFactory }); },
    async start({ dropAnswers = false, callType = "video", hostUserId = "alice", backend } = {}) {
      if (backend) {
        if (hub.endpoints.length || dropAnswers || callType !== "video" || backend.endpoints?.length !== 2) throw new Error("Invalid authenticated browser baseline configuration");
        hub.backend = true; hub.roomId = backend.roomId; hub.hostUserId = backend.hostUserId; hub.callType = callType;
        for (const configuration of backend.endpoints) {
          const runtime = await authenticatedRuntimeFactory({ sources: backendSources, connection: backend, endpoint: configuration, boundRpc: accountBoundRpc });
          hub.backendRuntimes.set(configuration.userId, runtime);
        }
        for (const configuration of backend.endpoints) createEndpoint(configuration.userId, { seed: false, backendRuntime: hub.backendRuntimes.get(configuration.userId) });
        await delay(0);
        return;
      }
      if (!["audio", "video"].includes(callType) || !["alice", "bob"].includes(hostUserId)) throw new Error("Invalid paired-call scenario");
      hub.dropAnswers = dropAnswers; hub.callType = callType; hub.hostUserId = hostUserId;
      createEndpoint("alice"); createEndpoint("bob"); await delay(0);
    },
    async setAppState(userId, nextState) {
      if (!["active", "background"].includes(nextState)) throw new Error("Invalid browser AppState transition");
      const endpoint = hub.endpoints.find((item) => item.userId === userId);
      if (!endpoint) throw new Error(`Missing endpoint ${userId}`);
      endpoint.appState = nextState;
      hub.events.push({ kind: "injected-app-state", userId, state: nextState });
      for (const callback of [...endpoint.appStateListeners]) callback(nextState);
      await delay(0);
    },
    holdNextSignal(userId, event) {
      if (hub.backend) throw new Error("Synthetic signal holds are unavailable with the authenticated backend");
      if (hub.holdNext) throw new Error("A signal hold is already armed");
      hub.holdNext = { userId, event };
    },
    stopLocalCapture(userId, kind) {
      const endpoint = hub.endpoints.find((item) => item.userId === userId);
      const tracks = [...new Set(endpoint?.acquiredTracks ?? [])]
        .filter((track) => track.kind === kind && track.readyState === "live");
      if (tracks.length !== 1) throw new Error(`Expected one live ${kind} capture for ${userId}, found ${tracks.length}`);
      tracks[0].stop();
      if (tracks[0].readyState !== "ended") throw new Error(`Actual ${kind} capture did not end for ${userId}`);
      hub.events.push({ kind: "capture-ended", userId, trackKind: kind });
      return { count: tracks.length, kind, state: tracks[0].readyState };
    },
    beginControl(userId, name, value) {
      const endpoint = hub.endpoints.find((item) => item.userId === userId);
      if (!endpoint?.output || typeof endpoint.output[name] !== "function") throw new Error(`Missing control ${name}`);
      const pending = { name, settled: false, result: null }; endpoint.pendingControl = pending;
      void Promise.resolve(endpoint.output[name](value)).then((result) => {
        pending.settled = true; pending.result = result;
      }, (error) => { pending.settled = true; hub.errors.push(String(error.stack ?? error)); });
    },
    async departEndpoint(userId) {
      if (hub.backend) throw new Error("Endpoint departure injection is outside the authenticated baseline");
      const previous = hub.endpoints.find((endpoint) => endpoint.userId === userId);
      if (!previous) throw new Error(`Missing endpoint ${userId}`);
      const previousMembershipGeneration = membershipStore.read({ roomId: hub.roomId, userId })?.membershipGeneration;
      previous.current = false; previous.root.unmount(); previous.mounted = false;
      hub.endpoints = hub.endpoints.filter((endpoint) => endpoint !== previous);
      hub.retiredEndpoints.push(previous);
      // Keep the durable row. Actual hook cleanup stops capture, closes native
      // peers and removes signaling presence; RTC determines remote liveness.
      await delay(0);
      return { roomId: hub.roomId, retiredInstanceId: previous.instanceId, previousMembershipGeneration };
    },
    async restartEndpoint(userId) {
      if (hub.backend) throw new Error("Endpoint restart injection is outside the authenticated baseline");
      const previous = hub.endpoints.find((endpoint) => endpoint.userId === userId);
      if (!previous) throw new Error(`Missing endpoint ${userId}`);
      const previousMembershipGeneration = membershipStore.read({ roomId: hub.roomId, userId })?.membershipGeneration;
      previous.current = false; previous.root.unmount(); previous.mounted = false;
      hub.endpoints = hub.endpoints.filter((endpoint) => endpoint !== previous);
      hub.retiredEndpoints.push(previous);
      // Preserve the original immediate replacement timing: mount the new
      // owner in this task, without awaiting remote RTC absence detection.
      const replacement = createEndpoint(userId, { seed: false });
      await delay(0);
      return { roomId: hub.roomId, retiredInstanceId: previous.instanceId, replacementInstanceId: replacement.instanceId, previousMembershipGeneration };
    },
    async returnEndpoint(userId) {
      if (hub.backend) throw new Error("Endpoint return injection is outside the authenticated baseline");
      if (hub.endpoints.some((endpoint) => endpoint.userId === userId)) throw new Error(`Endpoint ${userId} is still mounted`);
      const previous = hub.retiredEndpoints.findLast((endpoint) => endpoint.userId === userId);
      if (!previous) throw new Error(`No departed endpoint ${userId}`);
      // Only the new production hook's owned join can replace its generation.
      const replacement = createEndpoint(userId, { seed: false });
      await delay(0);
      return { roomId: hub.roomId, retiredInstanceId: previous.instanceId, replacementInstanceId: replacement.instanceId };
    },
    async releaseHeldSignals() {
      if (hub.backend) throw new Error("Synthetic signal release is unavailable with the authenticated backend");
      const queued = hub.heldSignals.splice(0);
      for (const { message, sender } of queued) {
        hub.events.push({ kind: "released-signal", event: message.event, sender: sender.userId, generation: message.payload.membershipGeneration });
        hub.dispatch(message, sender);
      }
      await delay(0);
      return queued.length;
    },
    async freshCall(options = {}) {
      if ([...hub.endpoints, ...hub.retiredEndpoints].some((endpoint) => endpoint.peers.some((peer) => peer.connectionState !== "closed") || endpoint.acquiredTracks.some((track) => track.readyState !== "ended"))) throw new Error("Previous native resources must be closed before a fresh call");
      if (hub.backend) {
        if (typeof options.roomId !== "string" || !options.roomId || options.roomId === hub.roomId) throw new Error("A separately accepted fresh backend room is required");
        hub.roomId = options.roomId;
        for (const endpoint of hub.endpoints) endpoint.render();
        await delay(0);
        return;
      }
      const previousRoomId = hub.roomId;
      hub.roomId = `BROWSER-CALL-${++hub.callSerial}`; hub.roomStatus = "active";
      for (const endpoint of hub.endpoints) {
        const previous = membershipStore.read({ roomId: previousRoomId, userId: endpoint.userId });
        membershipStore.seed({ ...previous, roomId: hub.roomId, membershipGeneration: crypto.randomUUID(), membershipAdmissionAttempt: null, membershipState: "active", leftAt: null, cameraEnabled: false, micEnabled: false });
      }
      for (const endpoint of hub.endpoints) endpoint.render();
      await delay(0);
    },
    async read() {
      const memberships = hub.backend
        ? await hub.backendRuntimes.values().next().value.api.listCommunicationRoomMemberships(hub.roomId)
        : membershipStore.snapshot(hub.roomId);
      return { authenticatedBackend: hub.backend, roomId: hub.roomId, callType: hub.callType, hostUserId: hub.hostUserId, memberships, errors: [...hub.errors], events: clone(hub.events), operationResults: clone(hub.operationResults), heldSignals: hub.heldSignals.map(({ message, sender }) => ({ event: message.event, sender: sender.userId, generation: message.payload.membershipGeneration })), retiredEndpoints: hub.retiredEndpoints.map((endpoint) => ({ userId: endpoint.userId, instanceId: endpoint.instanceId, pendingControl: clone(endpoint.pendingControl), ...resources(endpoint) })), endpoints: await Promise.all(hub.endpoints.map(async (endpoint) => ({
      userId: endpoint.userId, instanceId: endpoint.instanceId, appState: endpoint.appState, roomHostUserId: endpoint.output?.room?.hostUserId, membership: memberships.find((membership) => membership.userId === endpoint.userId), channelState: endpoint.output?.channelState, error: endpoint.output?.error, mediaControlError: endpoint.output?.mediaControlError, micEnabled: endpoint.output?.micEnabled, cameraEnabled: endpoint.output?.cameraEnabled,
      participants: endpoint.output?.participants?.map(({ streamURL: _url, ...rest }) => rest), ...await stats(endpoint), pixels: receivedPixels(endpoint),
      ...resources(endpoint),
    }))) }; },
    async control(userId, name, value) { const endpoint = hub.endpoints.find((item) => item.userId === userId); if (!endpoint?.output || typeof endpoint.output[name] !== "function") throw new Error(`Missing control ${name}`); endpoint.controlLabel = `${name}:${typeof value === "boolean" ? value : "toggle"}`; return endpoint.output[name](value); },
    async end() { await Promise.all(hub.endpoints.map((endpoint) => endpoint.output.leaveRoom())); },
    async dispose() { for (const endpoint of [...hub.endpoints, ...hub.retiredEndpoints]) { if (endpoint.mounted) endpoint.root.unmount(); endpoint.mounted = false; endpoint.drawTimers.forEach(clearInterval); endpoint.acquiredTracks.forEach((track) => track.stop()); endpoint.peers.forEach((peer) => peer.close()); for (const { receiver } of endpoint.receivedAudio) await receiver.dispose(); for (const context of endpoint.audioContexts) if (context.state !== "closed") await context.close(); } for (const runtime of hub.backendRuntimes.values()) await runtime.client.removeAllChannels(); },
  };
}
