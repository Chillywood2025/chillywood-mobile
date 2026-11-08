import { transferReservedUpload } from "../../../ops/isolated-paid-video-worker/upload-broker.mjs";
import { isS3ObjectVersion, validateObjectBinding } from "../../../ops/isolated-paid-video-worker/private-object.mjs";
import { checkPaidVideoDeadline, exact, freeze, PaidVideoBoundaryError, paidVideoHeaders, paidVideoJson, paidVideoPath,
  paidVideoSessionHeader, paidVideoWithin, readPaidVideoJson, requirePaidVideoSession, row, strictPaidVideoJson, uuid, type PaidVideoSession } from "./isolated-paid-video-boundary.ts";
import type { PaidVideoRpc } from "./isolated-paid-video-rpc.ts";

const receiptKeys = ["protocol", "state", "uploadId", "userId", "originalSessionId", "originalConfigurationDigest", "requestId", "transferId", "incarnation", "sha256", "byteLength", "objectVersion"];
function receipt(value: unknown, uploadId: string, requestId: string, userId: string): boolean {
  return exact(value, receiptKeys) && value.protocol === "scpv-object-receipt-v2" && value.state === "recorded"
    && value.uploadId === uploadId && value.requestId === requestId && value.userId === userId && uuid(value.originalSessionId) && uuid(value.transferId) && uuid(value.incarnation)
    && typeof value.originalConfigurationDigest === "string" && /^[a-f0-9]{64}$/u.test(value.originalConfigurationDigest)
    && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/u.test(value.sha256)
    && Number.isSafeInteger(value.byteLength) && Number(value.byteLength) > 0 && Number(value.byteLength) <= 16777216
    && isS3ObjectVersion(value.objectVersion);
}
export function createPaidVideoUploadHandler(dependencies: {
  authenticate: (request: Request) => Promise<PaidVideoSession | null>; rpc: PaidVideoRpc;
  transport: { writeOnce: (...args: unknown[]) => Promise<unknown>; readForScan: (...args: unknown[]) => Promise<{ bytes: Uint8Array; objectVersion: string }> };
  verifier: Readonly<{ id: string; key: Uint8Array }>; now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  if (!uuid(dependencies.verifier.id) || dependencies.verifier.key.byteLength !== 32) throw Error("paid_video_verifier_unavailable");
  const verifierId = dependencies.verifier.id, verifierKey = new Uint8Array(dependencies.verifier.key);
  return async (request: Request): Promise<Response> => {
    const deadline = now() + 5000; let dispatched = false, uploadId: string | null = null, requestId: string | null = null;
    try {
      [uploadId] = paidVideoPath(request, "isolated-paid-video-upload-v2", ["scpv_upload_"]);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: paidVideoHeaders("PUT, GET, POST") });
      if (!["PUT", "GET", "POST"].includes(request.method)) throw new PaidVideoBoundaryError("paid_video_method_invalid", 405);
      const expected = paidVideoSessionHeader(request); requestId = request.headers.get("x-chillywood-request-id");
      const configuration = request.headers.get("x-chillywood-native-configuration");
      if (!uuid(requestId) || !configuration || !/^[a-f0-9]{64}$/u.test(configuration)) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
      const id = uploadId, originalRequest = requestId;
      return await paidVideoWithin(deadline, async () => {
        const session = requirePaidVideoSession(await dependencies.authenticate(request), expected, now);
        const limit = Math.min(deadline, session.actor.expiresAtMs);
        const actor = freeze({ userId: session.actor.userId, sessionGeneration: session.actor.sessionId });
        const parameters = { p_upload_id: id.slice("scpv_upload_".length), p_user_id: actor.userId,
          p_session_id: actor.sessionGeneration, p_request_id: originalRequest, p_configuration_digest: configuration };
        if (request.method === "PUT") {
          if (request.headers.get("content-type") !== "video/mp4") throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
          const authorize = async (input: { action: string; transferId: string | null }) => {
            checkPaidVideoDeadline(limit, now); dispatched = true;
            const result = await dependencies.rpc("isolated_paid_video_upload_v2", { ...parameters, p_action: input.action, p_transfer_id: input.transferId }, null, limit);
            checkPaidVideoDeadline(limit, now);
            if (!row(result)) throw Error("paid_video_admission_invalid");
            if (result.state === "unknown") {
              if (!exact(result, ["protocol", "state", "dispatchAllowed", "transferId"]) || result.protocol !== "scpv-upload-admission-v1"
                || result.dispatchAllowed !== false || !uuid(result.transferId)) throw Error("paid_video_admission_invalid");
              return result;
            }
            if (!exact(result, ["protocol", "state", "dispatchAllowed", "transferId", "actor", "uploadId", "requestId", "validUntilMs", "object"])
              || !exact(result.actor, ["userId", "sessionGeneration"])
              || !exact(result.object, ["provider", "bucket", "routeId", "objectKey", "incarnation", "expectedSha256", "expectedByteLength"])
              || typeof result.validUntilMs !== "number") throw Error("paid_video_admission_invalid");
            return freeze({ ...result, validUntilMs: Math.min(limit, result.validUntilMs) });
          };
          const result = await transferReservedUpload({ request, actor, uploadId: id, requestId: originalRequest, authorize, transport: dependencies.transport, now });
          checkPaidVideoDeadline(limit, now);
          if (!exact(result, ["state", "uploadId", "requestId"]) || !["unknown", "acknowledged", "exists_unverified"].includes(String(result.state))
            || result.uploadId !== id || result.requestId !== originalRequest) throw Error("paid_video_transfer_result_invalid");
          return paidVideoJson(200, { protocol: "scpv-transfer-v2", ...result, verificationRequired: true }, "PUT, GET, POST");
        }
        if (request.method === "POST") {
          if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
          const body = await readPaidVideoJson(request, 8192, limit, now);
          if (!exact(body, ["protocol", "observationRaw", "signature"]) || body.protocol !== "scpv-reconcile-v2"
            || typeof body.observationRaw !== "string" || new TextEncoder().encode(body.observationRaw).length > 4096
            || typeof body.signature !== "string" || !/^[a-f0-9]{64}$/u.test(body.signature)) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
          const observation = strictPaidVideoJson(body.observationRaw);
          if (!row(observation) || observation.uploadId !== id || observation.requestId !== originalRequest
            || observation.userId !== actor.userId || observation.sessionId !== actor.sessionGeneration || observation.configurationDigest !== configuration)
            throw new PaidVideoBoundaryError("paid_video_probe_binding_invalid", 400);
          checkPaidVideoDeadline(limit, now); dispatched = true;
          const result = await dependencies.rpc("isolated_paid_video_reconcile_v2", { p_raw_body: body.observationRaw,
            p_signature: body.signature, p_user_id: actor.userId, p_session_id: actor.sessionGeneration }, null, limit);
          checkPaidVideoDeadline(limit, now);
          if (!receipt(result, id, originalRequest, actor.userId)) throw Error("paid_video_receipt_invalid");
          return paidVideoJson(200, result, "PUT, GET, POST");
        }
        if (request.body) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
        const readAdmission = async () => {
          checkPaidVideoDeadline(limit, now);
          const result = await dependencies.rpc("isolated_paid_video_probe_v2", parameters, null, limit);
          checkPaidVideoDeadline(limit, now); return result;
        };
        const before = await readAdmission();
        if (receipt(before, id, originalRequest, actor.userId)) return paidVideoJson(200, before, "PUT, GET, POST");
        const validate = (value: unknown) => {
          if (!exact(value, ["protocol", "actor", "uploadId", "requestId", "transferId", "originalSessionId", "configurationDigest", "originalConfigurationDigest", "verifierId", "validUntilMs", "object"])
            || value.protocol !== "scpv-probe-admission-v2" || !exact(value.actor, ["userId", "sessionGeneration"])
            || value.actor.userId !== actor.userId || value.actor.sessionGeneration !== actor.sessionGeneration || value.uploadId !== id || value.requestId !== originalRequest
            || value.configurationDigest !== configuration || value.verifierId !== verifierId || !uuid(value.transferId) || !uuid(value.originalSessionId)
            || typeof value.originalConfigurationDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.originalConfigurationDigest)
            || typeof value.validUntilMs !== "number" || value.validUntilMs <= now() || value.validUntilMs > now() + 5000
            || !exact(value.object, ["provider", "bucket", "routeId", "objectKey", "incarnation", "expectedSha256", "expectedByteLength"])) throw Error("paid_video_probe_invalid");
          validateObjectBinding(value.object); return value;
        };
        const initial = validate(before), object = initial.object as Record<string, unknown>;
        const until = Math.min(limit, Number(initial.validUntilMs));
        const stored = await dependencies.transport.readForScan(object, until);
        const actualHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(stored.bytes)))].map(value => value.toString(16).padStart(2, "0")).join("");
        if (stored.bytes.byteLength !== object.expectedByteLength || actualHash !== object.expectedSha256) throw Error("paid_video_probe_bytes_invalid");
        const after = validate(await readAdmission()); checkPaidVideoDeadline(until, now);
        for (const field of ["transferId", "originalSessionId", "originalConfigurationDigest", "verifierId"]) if (initial[field] !== after[field]) throw Error("paid_video_probe_changed");
        for (const key of Object.keys(object)) if ((after.object as Record<string, unknown>)[key] !== object[key]) throw Error("paid_video_probe_changed");
        if (!isS3ObjectVersion(stored.objectVersion)) throw Error("paid_video_probe_version_invalid");
        const checkedAt = now();
        const raw = JSON.stringify({ protocol: "scpv-object-observation-v2", userId: actor.userId, sessionId: actor.sessionGeneration,
          uploadId: id, requestId: originalRequest, transferId: initial.transferId, originalSessionId: initial.originalSessionId,
          configurationDigest: configuration, originalConfigurationDigest: initial.originalConfigurationDigest, verifierId, incarnation: object.incarnation, sha256: object.expectedSha256,
          byteLength: object.expectedByteLength, objectVersion: stored.objectVersion, checkedAtMs: checkedAt,
          expiresAtMs: Math.min(checkedAt + 30000, session.actor.expiresAtMs) });
        const key = await crypto.subtle.importKey("raw", verifierKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
        const signature = [...signed].map(value => value.toString(16).padStart(2, "0")).join("");
        checkPaidVideoDeadline(until, now);
        return paidVideoJson(200, { protocol: "scpv-upload-probe-v2", state: "observed", observationRaw: raw, signature }, "PUT, GET, POST");
      }, now);
    } catch (error) {
      return paidVideoJson(error instanceof PaidVideoBoundaryError ? error.status : 503,
        { protocol: "scpv-upload-v2-error", state: dispatched ? "unknown" : "unavailable", uploadId, requestId }, "PUT, GET, POST");
    }
  };
}
