import { createPaidVideoR2UploadHandler, createPaidVideoR2UploadRouter, paidVideoR2NativeConfiguration } from "./isolated-paid-video-r2-upload.ts";
import { createNativeStorePaidVideoR2RangeHandlerV1 } from "./native-store-paid-video-r2-range-v1.ts";
import type { PaidVideoRpc } from "./isolated-paid-video-rpc.ts";
const check = (ok: unknown, message = "assertion failed") => { if (!ok) throw Error(message); };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = id(1), sessionId = id(2), uploadId = "scpv_upload_" + id(3), requestId = id(4), resourceId = "scv1_resource_" + id(5), grantId = id(6);
const config = { origin: "https://private-gateway.invalid", bucket: "private-r2", routeId: id(7), profileId: id(8), keyId: id(9), qualificationSha256: "a".repeat(64) };
const identity = { kind: "r2-native-upload-v1", nativeVersion: "accepted-upload", etag: "b".repeat(32) };
const bytes = new Uint8Array([1, 2, 3, 4]), sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
const object = { provider: "cloudflare_r2", bucket: config.bucket, routeId: config.routeId,
  objectKey: `sandbox-commerce-v1/${userId}/${resourceId}/scv1_asset_${id(10)}/${id(11)}.mp4`, incarnation: id(11), expectedSha256: sha, expectedByteLength: 4 };
const receipt = { protocol: "scpv-object-receipt-r2-v1", state: "recorded", uploadId, userId, originalSessionId: sessionId,
  originalConfigurationDigest: paidVideoR2NativeConfiguration, requestId, transferId: id(12), incarnation: object.incarnation, sha256: sha, byteLength: 4,
  identity, profileId: config.profileId, qualificationSha256: config.qualificationSha256 };
const token = (operation: string, range: unknown = null) => ({ protocol: "scpv-r2-gateway-token-v1", operation, keyId: config.keyId,
  profileId: config.profileId, qualificationSha256: config.qualificationSha256, bindingId: id(12), uploadId, resourceId, requestId,
  configurationDigest: paidVideoR2NativeConfiguration, subject: { kind: "session", userId, sessionGeneration: sessionId },
  object: operation === "upload" ? object : { ...object, identity }, range, grantId: operation === "range" ? grantId : null, issuedAtMs: 100000, expiresAtMs: 104000 });
const auth = async () => ({ actor: { userId, sessionId, expiresAtMs: 200000 }, authorization: "Bearer user-token" });
const req = (method = "GET", extra: Record<string, string> = {}) => new Request(`https://edge.invalid/isolated-paid-video-upload-v2/${uploadId}`, {
  method, headers: { "x-chillywood-auth-session": sessionId, "x-chillywood-request-id": requestId, "x-chillywood-native-configuration": paidVideoR2NativeConfiguration,
    ...(method === "PUT" ? { "content-type": "video/mp4", "content-length": "4" } : {}), ...extra }, ...(method === "PUT" ? { body: bytes } : {}),
});

Deno.test("R2 Edge uploads and reconciles privately; never returns gateway capabilities to the app", async () => {
  const calls: string[] = [], rpc: PaidVideoRpc = async (name, parameters) => {
    calls.push(name);
    if (name === "native_paid_video_r2_admit_v1") return { raw: JSON.stringify(token(String(parameters.p_action))), signature: "c".repeat(64) };
    check(name === "native_paid_video_r2_reconcile_v1"); check(parameters.p_user_id === userId && parameters.p_session_id === sessionId); return receipt;
  };
  const request: typeof fetch = async (input, init) => {
    check(String(input).startsWith(config.origin + "/scpv-r2-gateway-v1/")); check(init?.redirect === "error");
    const headers = new Headers(init?.headers); check(headers.get("authorization") === "R2-HMAC " + "c".repeat(64));
    check(!headers.has("apikey"));
    return Response.json(init?.method === "PUT" ? { protocol: "scpv-r2-transfer-v1", state: "acknowledged", verificationRequired: true }
      : { protocol: "scpv-upload-probe-r2-v1", state: "observed", observationRaw: "{}", signature: "d".repeat(64) });
  };
  const handler = createPaidVideoR2UploadHandler({ authenticate: auth, rpc, gateway: config, request, now: () => 100000 });
  const put = await handler(req("PUT")); check(put.status === 200); check((await put.json()).protocol === "scpv-transfer-v2");
  const get = await handler(req()); check(get.status === 200); const text = await get.text();
  check(JSON.parse(text).protocol === "scpv-object-receipt-r2-v1");
  check(!text.includes("objectKey") && !text.includes("observationRaw") && !text.includes("signature") && !text.includes(config.bucket));
  check(calls.join(",") === "native_paid_video_r2_admit_v1,native_paid_video_r2_admit_v1,native_paid_video_r2_reconcile_v1");
  check((await handler(req("POST"))).status === 405);
});

Deno.test("R2 Edge rejects wrong actor, mixed provider, unqualified route and malformed receipts without fallback", async () => {
  for (const mode of ["actor", "provider", "route", "receipt", "configuration", "auth"]) {
    let sends = 0;
    const rpc: PaidVideoRpc = async () => {
      if (mode === "receipt") return { ...receipt, identity: { ...identity, objectVersion: "forbidden" } };
      const value = token("probe");
      if (mode === "actor") value.subject.userId = id(90);
      if (mode === "provider") Object.assign(value.object, { objectVersion: "forbidden" });
      if (mode === "route") value.object.routeId = id(91);
      return { raw: JSON.stringify(value), signature: "c".repeat(64) };
    };
    const handler = createPaidVideoR2UploadHandler({ authenticate: mode === "auth" ? async () => null : auth, rpc, gateway: config,
      request: async () => { sends++; throw Error("must not send"); }, now: () => 100000 });
    check((await handler(req("GET", mode === "configuration" ? { "x-chillywood-native-configuration": "e".repeat(64) } : {}))).status >= 400, mode);
    check(sends === 0, mode);
  }
});

Deno.test("mixed storage router chooses exact current route, never active-first or retry fallback", async () => {
  for (const mode of ["s3", "r2-native-v1", "unknown"]) {
    const calls: string[] = [];
    const handler = createPaidVideoR2UploadRouter({ authenticate: auth, rpc: async () => ({ protocol: "scpv-storage-route-v1", mode }),
      s3: async () => { calls.push("s3"); return new Response(null, { status: 503 }); },
      r2: async () => { calls.push("r2"); return new Response(null, { status: 503 }); }, now: () => 100000 });
    check((await handler(req())).status === 503); check(calls.join("") === (mode === "s3" ? "s3" : mode === "r2-native-v1" ? "r2" : ""));
  }
});

Deno.test("native R2 range binds allocation and media, rejects revocation and serves unchanged private player metadata", async () => {
  for (const changed of [false, true]) {
    let access = 0;
    const rpc: PaidVideoRpc = async (name, params) => {
      if (name === "native_paid_video_r2_admit_v1") return { raw: JSON.stringify(token("range", params.p_range)), signature: "c".repeat(64) };
      access++;
      return { protocol: "nssv1-current-access-gateway-r2-v1", actor: { userId, sessionGeneration: sessionId }, resourceId, grantId: "scv1_grant_" + grantId,
        receiptId: "scv1_receipt_" + id(13), originalTransactionId: "original", allocationId: changed && access > 1 ? "revoked" : "allocation", projectId: "project", validUntilMs: 104000,
        object: { ...object, identity }, media: { assetId: "scv1_asset_" + id(10), incarnation: object.incarnation, sha256: sha, byteLength: 4, resourceRevision: 1, profile: "scpv-mp4-h264-aac-v1" } };
    };
    const handler = createNativeStorePaidVideoR2RangeHandlerV1({ authenticate: auth, rpc, gateway: config, now: () => 100000,
      request: async () => new Response(bytes, { status: 206, headers: { "content-type": "video/mp4", "content-length": "4", "content-range": "bytes 0-3/4", "x-chillywood-r2-identity": JSON.stringify(identity) } }) });
    const response = await handler(new Request(`https://edge.invalid/native-store-paid-video-range-v1/${resourceId}/scv1_grant_${grantId}`, { headers: { "x-chillywood-auth-session": sessionId } }));
    check(response.status === (changed ? 403 : 206), "range status"); check(access === 2);
    if (!changed) { check(response.headers.get("x-chillywood-media-protocol") === "scpv-range-metadata-v2"); check(response.headers.get("x-chillywood-r2-identity") === null); check((await response.arrayBuffer()).byteLength === 4); }
  }
});
