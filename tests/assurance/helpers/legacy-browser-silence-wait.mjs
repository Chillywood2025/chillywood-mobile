import assert from "node:assert/strict";
import { createLegacyBrowserSilenceObservation } from "./legacy-paired-browser-harness.mjs";

// Keep the receiver from the already-confirmed mute projection. A replacement
// endpoint/peer, stopped playout, or absent RTP cannot stand in for silence.
export async function waitForLegacyBrowserReceivedSilence({
  read, receiver, now = () => performance.now(),
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const observation = createLegacyBrowserSilenceObservation();
  const deadline = now() + 3_000;
  const identity = {
    userId: receiver?.userId, instanceId: receiver?.instanceId,
    peerId: receiver?.audioReceivers?.find((audio) => audio.connection === "connected")?.peerId,
  };
  let latest = null;
  const inspect = (endpoint) => {
    const audio = endpoint?.audioReceivers?.filter((item) => item.connection === "connected") ?? [];
    const peers = endpoint?.peers?.filter((peer) => peer.connection === "connected") ?? [];
    const reports = endpoint?.stats?.filter((report) => report.kind === "audio") ?? [];
    const input = audio[0];
    // Allowlisted booleans/counters only: never copy arbitrary fixture fields,
    // receiver error strings, credentials, SDP, or subscription payloads.
    latest = {
      sameEndpoint: endpoint?.userId === identity.userId && endpoint?.instanceId === identity.instanceId,
      samePeer: input?.peerId === identity.peerId,
      receivers: audio.length, peers: peers.length, audioReports: reports.length,
      processorHealthy: input?.error === null, contextRunning: input?.contextState === "running",
      trackLive: input?.trackState === "live", trackEnabled: input?.trackEnabled === true,
      playbackActive: input?.playbackPaused === false && input?.playbackReadyState >= 2,
    };
    assert.ok(latest.sameEndpoint, "Received silence endpoint identity changed");
    assert.ok(audio.length === 1 && peers.length === 1, "Received silence requires one connected peer and audio receiver");
    assert.ok(latest.samePeer && peers[0].id === identity.peerId && peers[0].signaling === "stable",
      "Received silence peer identity or stable connection changed");
    assert.ok(reports.length === 1 && reports[0].peerId === identity.peerId,
      "Received silence RTP must belong to the current pinned peer");
    assert.ok(latest.processorHealthy && latest.contextRunning && latest.trackLive
      && latest.trackEnabled && latest.playbackActive, "Received silence requires healthy, live receiver playout");
    return observation.inspect({
      samples: input.pcmSamples, energy: input.pcmEnergy,
      packets: reports[0].packets, sampleRate: input.pcmSampleRate,
    });
  };
  try {
    assert.ok(typeof identity.userId === "string" && identity.userId.length > 0
      && Number.isSafeInteger(identity.instanceId) && identity.instanceId > 0
      && Number.isSafeInteger(identity.peerId) && identity.peerId > 0,
    "Received silence requires a valid confirmed receiver identity");
    inspect(receiver);
    while (now() < deadline) {
      const endpoint = await read();
      // A slow asynchronous browser/backend read must not succeed after expiry.
      assert.ok(now() < deadline, "Received silence three-second settling deadline expired");
      if (inspect(endpoint)) return endpoint;
      await pause(Math.min(100, Math.max(0, deadline - now())));
    }
    throw new Error("Received silence three-second settling deadline expired");
  } catch (error) {
    throw new Error(`${error.message}\nReceived silence intervals: ${JSON.stringify({
      ...observation.read(), receiver: latest,
    })}`, { cause: error });
  }
}
