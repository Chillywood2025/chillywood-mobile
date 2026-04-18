import {
  requestLiveKitParticipantToken,
  type LiveKitTokenContractResult,
  type LiveKitTokenReady,
  type LiveKitTokenRequest,
} from "./token-contract";

type PreparedBoundaryEntry = {
  joinContract: LiveKitTokenReady;
  preparedAt: number;
};

type LiveKitJoinBoundaryLookup = Pick<LiveKitTokenRequest, "participantIdentity" | "roomName" | "surface">;

const PREPARED_BOUNDARY_TTL_MILLIS = 2 * 60 * 1000;
const preparedLiveKitBoundaries = new Map<string, PreparedBoundaryEntry>();

const buildBoundaryKey = (lookup: LiveKitJoinBoundaryLookup) => [
  String(lookup.surface ?? "").trim(),
  String(lookup.roomName ?? "").trim(),
  String(lookup.participantIdentity ?? "").trim(),
].join("::");

const pruneExpiredBoundaries = () => {
  const now = Date.now();
  preparedLiveKitBoundaries.forEach((entry, key) => {
    if (now - entry.preparedAt > PREPARED_BOUNDARY_TTL_MILLIS) {
      preparedLiveKitBoundaries.delete(key);
    }
  });
};

export async function prepareLiveKitJoinBoundary(
  request: LiveKitTokenRequest,
): Promise<LiveKitTokenContractResult> {
  pruneExpiredBoundaries();
  const result = await requestLiveKitParticipantToken(request);
  if (result.status === "ready") {
    preparedLiveKitBoundaries.set(buildBoundaryKey(request), {
      joinContract: result,
      preparedAt: Date.now(),
    });
  }
  return result;
}

export function consumePreparedLiveKitJoinBoundary(
  lookup: LiveKitJoinBoundaryLookup,
): LiveKitTokenReady | null {
  pruneExpiredBoundaries();
  const key = buildBoundaryKey(lookup);
  const entry = preparedLiveKitBoundaries.get(key);
  if (!entry) return null;
  preparedLiveKitBoundaries.delete(key);
  return entry.joinContract;
}
