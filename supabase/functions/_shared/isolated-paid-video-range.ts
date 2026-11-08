import { deliverBoundedRange, validateObjectBinding } from "../../../ops/isolated-paid-video-worker/private-object.mjs";
import { checkPaidVideoDeadline, exact, freeze, PaidVideoBoundaryError, paidVideoHeaders, paidVideoJson, paidVideoPath,
  paidVideoSessionHeader, paidVideoWithin, requirePaidVideoSession, versionedId, type PaidVideoSession, type PaidVideoRow } from "./isolated-paid-video-boundary.ts";
import type { PaidVideoRpc } from "./isolated-paid-video-rpc.ts";

export function createPaidVideoRangeHandler(dependencies: {
  authenticate: (request: Request) => Promise<PaidVideoSession | null>; rpc: PaidVideoRpc;
  transport: { readRange: (...args: unknown[]) => Promise<Uint8Array> }; now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  return async (request: Request): Promise<Response> => {
    const deadline = now() + 5000;
    try {
      const [resourceId, grantId] = paidVideoPath(request, "isolated-paid-video-range-v1", ["scv1_resource_", "scv1_grant_"]);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: paidVideoHeaders("GET") });
      if (request.method !== "GET" || request.body) throw new PaidVideoBoundaryError("paid_video_method_invalid", 405);
      const expected = paidVideoSessionHeader(request);
      return await paidVideoWithin(deadline, async () => {
        const session = requirePaidVideoSession(await dependencies.authenticate(request), expected, now);
        const limit = Math.min(deadline, session.actor.expiresAtMs);
        const actor = freeze({ userId: session.actor.userId, sessionGeneration: session.actor.sessionId });
        let media: PaidVideoRow | null = null, authorizedUntil = limit;
        const authorize = async () => {
          checkPaidVideoDeadline(limit, now);
          const value = await dependencies.rpc("isolated_paid_video_gateway_access_v2", {
            p_user_id: actor.userId, p_session_id: actor.sessionGeneration,
            p_resource_id: resourceId.slice("scv1_resource_".length), p_grant_id: grantId.slice("scv1_grant_".length),
          }, null, limit);
          if (!exact(value, ["protocol", "actor", "resourceId", "grantId", "receiptId", "originalTransactionId", "customerId", "projectId", "validUntilMs", "object", "media"])
            || value.protocol !== "scpv-current-access-gateway-v2"
            || !exact(value.actor, ["userId", "sessionGeneration"])
            || !exact(value.object, ["provider", "bucket", "routeId", "objectKey", "incarnation", "expectedSha256", "expectedByteLength", "objectVersion"])
            || !exact(value.media, ["assetId", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"])
            || !versionedId(value.media.assetId, "scv1_asset_") || !Number.isSafeInteger(value.media.resourceRevision)
            || Number(value.media.resourceRevision) < 1 || value.media.profile !== "scpv-mp4-h264-aac-v1"
            || typeof value.validUntilMs !== "number" || !Number.isSafeInteger(value.validUntilMs)
            || value.validUntilMs <= now() || value.validUntilMs > now() + 5000) throw Error("paid_video_access_invalid");
          validateObjectBinding(value.object);
          if (value.media.assetId !== String(value.object.objectKey).split("/")[3]
            || value.media.incarnation !== value.object.incarnation || value.media.sha256 !== value.object.expectedSha256
            || value.media.byteLength !== value.object.expectedByteLength) throw Error("paid_video_media_binding_invalid");
          const currentMedia = value.media;
          if (media && Object.keys(media).some(key => media![key] !== currentMedia[key])) throw Error("paid_video_media_binding_changed");
          media = freeze({ ...currentMedia }); authorizedUntil = Math.min(authorizedUntil, value.validUntilMs);
          checkPaidVideoDeadline(limit, now);
          // Explicit typed compatibility projection into the unchanged private
          // S3 adapter. Extra public metadata never supplies transport authority.
          const transportAuthority = { ...value }; delete transportAuthority.media;
          return freeze({ ...transportAuthority, protocol: "scpv-current-access-v3", validUntilMs: authorizedUntil });
        };
        const result = await deliverBoundedRange({ actor, resourceId, grantId, rangeHeader: request.headers.get("range"),
          authorize, transport: dependencies.transport, now });
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
