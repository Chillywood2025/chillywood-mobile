import { createR2GatewayClient } from "../../../ops/isolated-paid-video-worker/r2-http.mjs";
import { readR2Bytes } from "../../../ops/isolated-paid-video-worker/r2-protocol.mjs";
import { checkPaidVideoDeadline, exact, PaidVideoBoundaryError, paidVideoHeaders, paidVideoJson, paidVideoPath,
  paidVideoSessionHeader, paidVideoWithin, requirePaidVideoSession, row, uuid, type PaidVideoSession } from "./isolated-paid-video-boundary.ts";
import type { PaidVideoRpc } from "./isolated-paid-video-rpc.ts";

export type PaidVideoR2GatewayConfiguration = Readonly<{ origin: string; bucket: string; routeId: string; profileId: string; keyId: string; qualificationSha256: string }>;
export const paidVideoR2NativeConfiguration = "8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0";
export function createPaidVideoR2UploadRouter(dependencies: {
  authenticate: (request: Request) => Promise<PaidVideoSession | null>; rpc: PaidVideoRpc;
  s3: (request: Request) => Promise<Response>; r2: (request: Request) => Promise<Response>; now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  return async (request: Request) => {
    const deadline = now() + 5000;
    try {
      const [uploadId] = paidVideoPath(request, "isolated-paid-video-upload-v2", ["scpv_upload_"]);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: paidVideoHeaders("PUT, GET, POST") });
      if (!["PUT", "GET", "POST"].includes(request.method)) throw new PaidVideoBoundaryError("paid_video_method_invalid", 405);
      return await paidVideoWithin(deadline, async () => {
        const session = requirePaidVideoSession(await dependencies.authenticate(request), paidVideoSessionHeader(request), now);
        const configuration = request.headers.get("x-chillywood-native-configuration");
        if (typeof configuration !== "string" || !/^[a-f0-9]{64}$/u.test(configuration)) throw Error("paid_video_configuration_invalid");
        const route = await dependencies.rpc("native_paid_video_r2_route_v1", { p_user_id: session.actor.userId,
          p_session_id: session.actor.sessionId, p_upload_id: uploadId.slice(12), p_configuration_digest: configuration }, null, Math.min(deadline, session.actor.expiresAtMs));
        checkPaidVideoDeadline(deadline, now);
        if (!exact(route, ["protocol", "mode"]) || route.protocol !== "scpv-storage-route-v1" || !["s3", "r2-native-v1"].includes(String(route.mode))) throw Error("paid_video_storage_route_invalid");
        // This exact current database route is the only selector. Failure in a
        // selected provider never triggers an alternate upload or read.
        return route.mode === "s3" ? dependencies.s3(request) : dependencies.r2(request);
      }, now);
    } catch (error) {
      return paidVideoJson(error instanceof PaidVideoBoundaryError ? error.status : 503, { protocol: "scpv-upload-v2-error", state: "unknown", uploadId: null, requestId: null }, "PUT, GET, POST");
    }
  };
}
export function validR2Receipt(value: unknown, userId: string, uploadId: string, requestId: string, config: PaidVideoR2GatewayConfiguration) {
  return exact(value, ["protocol", "state", "uploadId", "userId", "originalSessionId", "originalConfigurationDigest", "requestId", "transferId", "incarnation", "sha256", "byteLength", "identity", "profileId", "qualificationSha256"])
    && value.protocol === "scpv-object-receipt-r2-v1" && value.state === "recorded" && value.userId === userId && value.uploadId === uploadId && value.requestId === requestId
    && value.originalConfigurationDigest === paidVideoR2NativeConfiguration && uuid(value.originalSessionId) && uuid(value.transferId) && uuid(value.incarnation)
    && value.profileId === config.profileId && value.qualificationSha256 === config.qualificationSha256
    && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/u.test(value.sha256)
    && Number.isSafeInteger(value.byteLength) && Number(value.byteLength) > 0 && Number(value.byteLength) <= 16777216
    && exact(value.identity, ["kind", "nativeVersion", "etag"]) && value.identity.kind === "r2-native-upload-v1"
    && typeof value.identity.nativeVersion === "string" && /^[\x21-\x7e]{1,1024}$/u.test(value.identity.nativeVersion)
    && typeof value.identity.etag === "string" && /^[a-f0-9]{32}(?:-[1-9][0-9]*)?$/u.test(value.identity.etag);
}

export function createPaidVideoR2UploadHandler(dependencies: {
  authenticate: (request: Request) => Promise<PaidVideoSession | null>; rpc: PaidVideoRpc;
  gateway: PaidVideoR2GatewayConfiguration; request?: typeof fetch; now?: () => number;
}) {
  const now = dependencies.now ?? Date.now, client = createR2GatewayClient(dependencies.gateway, { request: dependencies.request ?? fetch, now });
  return async (request: Request): Promise<Response> => {
    const deadline = now() + 5000; let sent = false, uploadId: string | null = null, requestId: string | null = null;
    try {
      [uploadId] = paidVideoPath(request, "isolated-paid-video-upload-v2", ["scpv_upload_"]);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: paidVideoHeaders("PUT, GET") });
      if (!["PUT", "GET"].includes(request.method)) throw new PaidVideoBoundaryError("paid_video_method_invalid", 405);
      const expected = paidVideoSessionHeader(request); requestId = request.headers.get("x-chillywood-request-id");
      if (!uuid(requestId) || request.headers.get("x-chillywood-native-configuration") !== paidVideoR2NativeConfiguration) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
      const id = uploadId, originalRequest = requestId;
      return await paidVideoWithin(deadline, async () => {
        const session = requirePaidVideoSession(await dependencies.authenticate(request), expected, now);
        const limit = Math.min(deadline, session.actor.expiresAtMs), userId = session.actor.userId, sessionId = session.actor.sessionId;
        const parameters = { p_action: request.method === "PUT" ? "upload" : "probe", p_user_id: userId, p_session_id: sessionId,
          p_upload_id: id.slice(12), p_request_id: originalRequest, p_configuration_digest: paidVideoR2NativeConfiguration, p_range: null, p_grant_id: null };
        // Admission can persist a request binding. Any lost response remains
        // unknown, and a later attempt must recover rather than resend a PUT.
        sent = true;
        const admission = await dependencies.rpc("native_paid_video_r2_admit_v1", parameters, null, limit);
        checkPaidVideoDeadline(limit, now);
        if (request.method === "GET" && validR2Receipt(admission, userId, id, originalRequest, dependencies.gateway)) return paidVideoJson(200, admission, "PUT, GET");
        const token = client.parseAdmission(admission);
        if (token.operation !== parameters.p_action || token.uploadId !== id || token.requestId !== originalRequest
          || token.configurationDigest !== paidVideoR2NativeConfiguration || token.subject.kind !== "session"
          || token.subject.userId !== userId || token.subject.sessionGeneration !== sessionId) throw Error("paid_video_r2_admission_invalid");
        if (request.method === "PUT") {
          if (request.headers.get("content-type") !== "video/mp4" || request.headers.get("content-length") !== String(token.object.expectedByteLength)
            || request.headers.has("content-encoding")) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
          const bytes = await readR2Bytes(request.body, token.object.expectedByteLength, Math.min(limit, token.expiresAtMs), now);
          const result = await client.execute(admission, bytes, limit);
          if (!exact(result, ["protocol", "state", "verificationRequired"]) || result.protocol !== "scpv-r2-transfer-v1"
            || !["acknowledged", "unknown", "exists_unverified"].includes(String(result.state)) || result.verificationRequired !== true) throw Error("paid_video_r2_transfer_invalid");
          checkPaidVideoDeadline(limit, now);
          return paidVideoJson(200, { protocol: "scpv-transfer-v2", state: result.state, uploadId: id, requestId: originalRequest, verificationRequired: true }, "PUT, GET");
        }
        if (request.body) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
        const observation = await client.execute(admission, null, limit);
        if (!exact(observation, ["protocol", "state", "observationRaw", "signature"]) || observation.protocol !== "scpv-upload-probe-r2-v1" || observation.state !== "observed"
          || typeof observation.observationRaw !== "string" || observation.observationRaw.length > 16384
          || typeof observation.signature !== "string" || !/^[a-f0-9]{64}$/u.test(observation.signature)) throw Error("paid_video_r2_observation_invalid");
        // The private gateway token and bucket/key never leave this server.
        const result = await dependencies.rpc("native_paid_video_r2_reconcile_v1", { p_raw_body: observation.observationRaw,
          p_signature: observation.signature, p_user_id: userId, p_session_id: sessionId }, null, limit);
        checkPaidVideoDeadline(limit, now);
        if (!row(result) || !validR2Receipt(result, userId, id, originalRequest, dependencies.gateway)) throw Error("paid_video_r2_receipt_invalid");
        return paidVideoJson(200, result, "PUT, GET");
      }, now);
    } catch (error) {
      return paidVideoJson(error instanceof PaidVideoBoundaryError ? error.status : 503,
        { protocol: "scpv-upload-v2-error", state: sent ? "unknown" : "unavailable", uploadId, requestId }, "PUT, GET");
    }
  };
}
