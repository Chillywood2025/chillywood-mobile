// Identity isolation is separate from the caller's unchanged actual media
// predicates. Historical counters/generations must never qualify a new call.
export function hasIsolatedLegacyFreshPeerEvidence({ endpoint, previous, priorGenerations, oldPeerIds,
  connectedPeers, receivedAudio }) {
  const generation = endpoint.membership?.membershipGeneration;
  return endpoint.instanceId === previous.instanceId
    && typeof generation === "string" && generation.length > 0 && !priorGenerations.has(generation)
    && connectedPeers.every((peer) => !oldPeerIds.has(peer.id))
    && endpoint.stats.every((report) => !oldPeerIds.has(report.peerId))
    && receivedAudio.every((receiver) => !oldPeerIds.has(receiver.peerId))
    && endpoint.pixels.every((frame) => !oldPeerIds.has(frame.peerId));
}
