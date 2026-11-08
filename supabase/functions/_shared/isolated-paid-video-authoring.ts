import { checkPaidVideoDeadline, exact, freeze, PaidVideoBoundaryError, paidVideoHeaders, paidVideoJson, paidVideoPath,
  paidVideoWithin, readPaidVideoJson, requirePaidVideoSession, row, uuid, type PaidVideoSession } from "./isolated-paid-video-boundary.ts";
import { validPaidVideoPrivateRequest, validPaidVideoV2Result } from "./isolated-paid-video-contract.ts";
import type { PaidVideoRpc } from "./isolated-paid-video-rpc.ts";

export function createPaidVideoAuthoringHandler(dependencies: {
  authenticate: (request: Request) => Promise<PaidVideoSession | null>; rpc: PaidVideoRpc; now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  return async (request: Request): Promise<Response> => {
    const deadline = now() + 5000; let mutation = false, dispatched = false, requestId: unknown = null;
    try {
      paidVideoPath(request, "isolated-paid-video-authoring-v2", []);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: paidVideoHeaders("POST") });
      if (request.method !== "POST" || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? ""))
        throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
      return await paidVideoWithin(deadline, async () => {
        const input = await readPaidVideoJson(request, 12288, deadline, now);
        if (!exact(input, ["protocol", "command", "requestId", "expectedSessionId", "configurationDigest", "payload"])
          || input.protocol !== "isolated-paid-video-v2" || !uuid(input.requestId) || !uuid(input.expectedSessionId)
          || typeof input.command !== "string" || typeof input.configurationDigest !== "string" || !/^[a-f0-9]{64}$/u.test(input.configurationDigest)
          || !row(input.payload) || Object.hasOwn(input.payload, "protocol") || Object.hasOwn(input.payload, "requestId")) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
        requestId = input.requestId; mutation = ["upload.reserve", "upload.finalize", "offer.publish", "offer.retire"].includes(input.command);
        const session = requirePaidVideoSession(await dependencies.authenticate(request), input.expectedSessionId, now);
        const limit = Math.min(deadline, session.actor.expiresAtMs);
        const parameters = freeze({ p_command: input.command,
          p_payload: { protocol: "isolated-paid-video-v1", requestId: input.requestId, ...input.payload },
          p_expected_account_id: session.actor.userId, p_expected_session_generation: session.actor.sessionId });
        if (!validPaidVideoPrivateRequest(parameters)) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
        checkPaidVideoDeadline(limit, now); dispatched = true;
        const result = await dependencies.rpc("isolated_paid_video_v2", { ...parameters, p_configuration_digest: input.configurationDigest }, session.authorization, limit);
        checkPaidVideoDeadline(limit, now);
        if (!validPaidVideoV2Result(result) || result.command !== input.command || result.requestId !== input.requestId
          || result.configurationDigest !== input.configurationDigest || !row(result.actor)
          || result.actor.userId !== session.actor.userId || result.actor.accountId !== session.actor.userId || result.actor.sessionGeneration !== session.actor.sessionId
          || typeof result.capabilityExpiresAtMs !== "number" || result.capabilityExpiresAtMs <= now() || result.capabilityExpiresAtMs > now() + 5000)
          throw Error("paid_video_invalid_result");
        return paidVideoJson(200, { ...result, capabilityExpiresAtMs: Math.min(result.capabilityExpiresAtMs, session.actor.expiresAtMs) }, "POST");
      }, now);
    } catch (error) {
      return paidVideoJson(error instanceof PaidVideoBoundaryError ? error.status : 503,
        { protocol: "isolated-paid-video-v2-error", status: mutation && dispatched ? "unknown" : "unavailable", requestId }, "POST");
    }
  };
}
