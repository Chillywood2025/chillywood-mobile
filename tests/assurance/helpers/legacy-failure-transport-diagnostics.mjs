// This runs only after the assertion deadline. Failed/closed browser pages or
// stuck native getStats must not hide the original assertion or hang its report.
export async function collectLegacyFailureTransportDiagnostics(collect, timeoutMs = 1000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(collect).catch(() => ({ error: "transport diagnostics unavailable" })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ error: "transport diagnostics deadline exceeded" }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function summarizeLegacyPeerFailureTimeline(events = []) {
  const kinds = new Set(["peer-operation", "peer-state", "ice-candidate", "ice-application", "ice-gathering-error",
    "broadcast", "in-memory-receive", "relay-delivery", "held-signal", "released-signal", "commit",
    "authenticated-broadcast", "authenticated-receive"]);
  const identity = (value) => typeof value === "string" && /^[a-zA-Z0-9_:-]{1,160}$/u.test(value) ? value : undefined;
  return events.filter((event) => kinds.has(event.kind)).map((event) => {
    const result = { kind: event.kind };
    for (const key of ["userId", "sender", "receiver", "roomId", "peerRoomId", "payloadRoomId", "channelRoomId",
      "generation", "admissionAttempt", "event", "operation", "descriptionType", "signaling", "connection",
      "ice", "gathering", "candidateType", "phase", "remoteType", "state", "error"]) {
      const value = identity(event[key]);
      if (value !== undefined) result[key] = value;
    }
    for (const key of ["at", "peerId", "errorCode", "handlerCount"]) {
      if (Number.isFinite(event[key])) result[key] = event[key];
    }
    for (const key of ["present", "confirmed", "active", "mic", "camera"]) {
      if (typeof event[key] === "boolean") result[key] = event[key];
    }
    if (Array.isArray(event.senders)) result.senders = event.senders.map((sender) => sender && ({
      trackId: identity(sender.trackId), kind: ["audio", "video"].includes(sender.kind) ? sender.kind : "other",
      state: ["live", "ended"].includes(sender.state) ? sender.state : "other", enabled: sender.enabled === true,
    }));
    return result;
  });
}
