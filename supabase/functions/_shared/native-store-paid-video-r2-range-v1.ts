import { validateR2Object } from "../../../ops/isolated-paid-video-worker/r2-native.mjs";
import { createR2GatewayClient } from "../../../ops/isolated-paid-video-worker/r2-http.mjs";
import { r2ObjectTuple } from "../../../ops/isolated-paid-video-worker/r2-protocol.mjs";
import { paidVideoR2NativeConfiguration, type PaidVideoR2GatewayConfiguration } from "./isolated-paid-video-r2-upload.ts";
import { deliverNativeR2Range } from "../../../ops/isolated-paid-video-worker/r2-native-range.mjs";
import { checkPaidVideoDeadline, exact, freeze, PaidVideoBoundaryError, paidVideoHeaders, paidVideoJson, paidVideoPath,
  paidVideoSessionHeader, paidVideoWithin, requirePaidVideoSession, versionedId, type PaidVideoSession, type PaidVideoRow } from "./isolated-paid-video-boundary.ts";
import type { PaidVideoRpc } from "./isolated-paid-video-rpc.ts";

export function createNativeStorePaidVideoR2RangeHandlerV1(dependencies: {
  authenticate: (request: Request) => Promise<PaidVideoSession | null>; rpc: PaidVideoRpc;
  gateway: PaidVideoR2GatewayConfiguration; s3Handler?: (request: Request) => Promise<Response>; request?: typeof fetch; now?: () => number;
}) {
  const now = dependencies.now ?? Date.now, client = createR2GatewayClient(dependencies.gateway, { request: dependencies.request ?? fetch, now });
  return async (request: Request): Promise<Response> => {
    const deadline = now() + 5000;
    try {
      const [resourceId, grantId] = paidVideoPath(request, "native-store-paid-video-range-v1", ["scv1_resource_", "scv1_grant_"]);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: paidVideoHeaders("GET") });
      if (request.method !== "GET" || request.body) throw new PaidVideoBoundaryError("paid_video_method_invalid", 405);
      const expected = paidVideoSessionHeader(request);
      return await paidVideoWithin(deadline, async () => {
        const session = requirePaidVideoSession(await dependencies.authenticate(request), expected, now);
        const limit = Math.min(deadline, session.actor.expiresAtMs);
        const actor = freeze({ userId: session.actor.userId, sessionGeneration: session.actor.sessionId });
        let media: PaidVideoRow | null = null, authorizedUntil = limit;
        const currentAccess = () => dependencies.rpc("native_store_paid_video_access_v1", {
          p_user_id: actor.userId, p_session_id: actor.sessionGeneration, p_resource_id: resourceId.slice(14), p_grant_id: grantId.slice(11),
        }, null, limit);
        let initial: unknown = await currentAccess();
        // Exact current SQL protocol selects the configured S3 branch. Never
        // fall back to S3 after any R2 transport or authorization failure.
        if (exact(initial, ["protocol", "actor", "resourceId", "grantId", "receiptId", "originalTransactionId", "allocationId", "projectId", "validUntilMs", "object", "media"])
          && initial.protocol === "nssv1-current-access-gateway-v1" && dependencies.s3Handler) return dependencies.s3Handler(request);
        const authorize = async () => {
          checkPaidVideoDeadline(limit, now);
          const value = initial ?? await currentAccess(); initial = null;
          if (!exact(value, ["protocol", "actor", "resourceId", "grantId", "receiptId", "originalTransactionId", "allocationId", "projectId", "validUntilMs", "object", "media"])
            || value.protocol !== "nssv1-current-access-gateway-r2-v1"
            || !exact(value.actor, ["userId", "sessionGeneration"])
            || !exact(value.object, ["provider", "bucket", "routeId", "objectKey", "incarnation", "expectedSha256", "expectedByteLength", "identity"])
            || !exact(value.media, ["assetId", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"])
            || !versionedId(value.media.assetId, "scv1_asset_") || !Number.isSafeInteger(value.media.resourceRevision)
            || Number(value.media.resourceRevision) < 1 || value.media.profile !== "scpv-mp4-h264-aac-v1"
            || typeof value.validUntilMs !== "number" || !Number.isSafeInteger(value.validUntilMs)
            || value.validUntilMs <= now() || value.validUntilMs > now() + 5000) throw Error("paid_video_access_invalid");
          validateR2Object(value.object, true);
          if (value.media.assetId !== String(value.object.objectKey).split("/")[3]
            || value.media.incarnation !== value.object.incarnation || value.media.sha256 !== value.object.expectedSha256
            || value.media.byteLength !== value.object.expectedByteLength) throw Error("paid_video_media_binding_invalid");
          const currentMedia = value.media;
          if (media && Object.keys(media).some(key => media![key] !== currentMedia[key])) throw Error("paid_video_media_binding_changed");
          media = freeze({ ...currentMedia }); authorizedUntil = Math.min(authorizedUntil, value.validUntilMs);
          checkPaidVideoDeadline(limit, now);
          // Explicit typed R2 projection. Public metadata supplies no transport authority.
          const transportAuthority = { ...value }; delete transportAuthority.media;
          return freeze({ ...transportAuthority, protocol: "nssv1-current-access-r2-v1", validUntilMs: authorizedUntil });
        };
        const transport = { readRange: async (object: Record<string, unknown>, range: { start: number; end: number }, until: number) => {
          const admission = await dependencies.rpc("native_paid_video_r2_admit_v1", { p_action: "range", p_user_id: actor.userId,
            p_session_id: actor.sessionGeneration, p_upload_id: null, p_request_id: crypto.randomUUID(),
            p_configuration_digest: paidVideoR2NativeConfiguration, p_range: range, p_grant_id: grantId.slice(11) }, null, until);
          const token = client.parseAdmission(admission);
          if (token.operation !== "range" || token.resourceId !== resourceId || token.subject.kind !== "session"
            || token.subject.userId !== actor.userId || token.subject.sessionGeneration !== actor.sessionGeneration
            || token.grantId !== grantId.slice(11) || token.range.start !== range.start || token.range.end !== range.end
            || r2ObjectTuple(token.object) !== r2ObjectTuple(object)) throw Error("paid_video_r2_range_binding_invalid");
          const result = await client.execute(admission, null, until);
          if (!exact(result, ["bytes", "identity"]) || !(result.bytes instanceof Uint8Array)) throw Error("paid_video_r2_range_invalid");
          return result.bytes;
        } };
        const result = await deliverNativeR2Range({ actor, resourceId, grantId, rangeHeader: request.headers.get("range"), authorize, transport, now });
        checkPaidVideoDeadline(authorizedUntil, now);
        if (!media) throw Error("paid_video_media_binding_required");
        const headers = paidVideoHeaders("GET"); result.headers.forEach((value: string, key: string) => headers.set(key, value));
        headers.set("vary", "Authorization, X-Chillywood-Auth-Session, Range");
        headers.set("x-chillywood-media-protocol", "scpv-range-metadata-v2");
        headers.set("x-chillywood-resource-id", resourceId); headers.set("x-chillywood-grant-id", grantId);
        const publicMedia = media as PaidVideoRow;
        for (const [header, key] of [["asset-id", "assetId"], ["incarnation", "incarnation"], ["sha256", "sha256"],
          ["byte-length", "byteLength"], ["resource-revision", "resourceRevision"], ["profile", "profile"]]) headers.set("x-chillywood-" + header, String(publicMedia[key]));
        headers.set("x-chillywood-authorized-until-ms", String(authorizedUntil));
        headers.set("access-control-expose-headers", "Content-Range, Content-Length, Accept-Ranges, X-Chillywood-Media-Protocol, X-Chillywood-Resource-Id, X-Chillywood-Grant-Id, X-Chillywood-Asset-Id, X-Chillywood-Incarnation, X-Chillywood-Sha256, X-Chillywood-Byte-Length, X-Chillywood-Resource-Revision, X-Chillywood-Profile, X-Chillywood-Authorized-Until-Ms");
        checkPaidVideoDeadline(authorizedUntil, now);
        return new Response(result.body, { status: 206, headers });
      }, now);
    } catch (error) {
      const status = error instanceof PaidVideoBoundaryError ? error.status : 403;
      return paidVideoJson(status, { protocol: "scpv-range-v1", status: "unavailable" }, "GET");
    }
  };
}
