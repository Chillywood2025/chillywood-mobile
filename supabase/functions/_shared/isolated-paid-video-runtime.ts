import { createPrivateS3Transport } from "../../../ops/isolated-paid-video-worker/private-object.mjs";
import { authenticatePaidVideoRequest } from "./isolated-paid-video-auth.ts";
import { createPaidVideoRpc } from "./isolated-paid-video-rpc.ts";
import { createPaidVideoAuthoringHandler } from "./isolated-paid-video-authoring.ts";
import { createPaidVideoUploadHandler } from "./isolated-paid-video-upload.ts";
import { createPaidVideoRangeHandler } from "./isolated-paid-video-range.ts";
import { createPaidVideoR2UploadHandler, createPaidVideoR2UploadRouter } from "./isolated-paid-video-r2-upload.ts";
import { paidVideoJson } from "./isolated-paid-video-boundary.ts";

// A distinct source-only profile. No env values, objects, keys or enabled
// settings are installed by these files. Environment is captured once.
export function paidVideoRuntime(kind: "authoring" | "upload" | "range", environment: (key: string) => string | undefined = key => Deno.env.get(key)) {
  const unavailable = async () => paidVideoJson(503, { protocol: "scpv-gateway-v2", status: "unavailable" }, kind === "range" ? "GET" : kind === "upload" ? "PUT, GET, POST" : "POST");
  if (environment("PAID_VIDEO_GATEWAY_V2_ENABLED") !== "true") return unavailable;
  try {
    const required = (name: string) => { const value = environment(name); if (!value) throw Error("paid_video_runtime_unavailable"); return value; };
    const rpc = createPaidVideoRpc({ url: required("SUPABASE_URL"), anonKey: required("SUPABASE_ANON_KEY"), serviceKey: required("SUPABASE_SERVICE_ROLE_KEY") });
    const authenticate = authenticatePaidVideoRequest;
    const storage = environment("PAID_VIDEO_STORAGE_MODE") ?? "s3";
    if (!["s3", "r2-native-v1"].includes(storage)) return unavailable;
    if (kind === "authoring") return createPaidVideoAuthoringHandler({ authenticate, rpc });
    if (storage === "r2-native-v1" && kind === "upload") {
      // R2 is native paid-video only. Test Store range remains S3-only.
      if (environment("PAID_VIDEO_R2_GATEWAY_V1_ENABLED") !== "true") return unavailable;
      const r2 = createPaidVideoR2UploadHandler({ authenticate, rpc, gateway: {
        origin: required("PAID_VIDEO_R2_GATEWAY_ORIGIN"), bucket: required("PAID_VIDEO_R2_BUCKET"), routeId: required("PAID_VIDEO_R2_ROUTE_ID"),
        profileId: required("PAID_VIDEO_R2_PROFILE_ID"), keyId: required("PAID_VIDEO_R2_GATEWAY_KEY_ID"), qualificationSha256: required("PAID_VIDEO_R2_QUALIFICATION_SHA256"),
      } });
      let s3: (request: Request) => Promise<Response> = unavailable;
      try {
        const transport = createPrivateS3Transport({ routeId: required("PAID_VIDEO_S3_ROUTE_ID"), bucket: required("PAID_VIDEO_S3_BUCKET"),
          region: required("PAID_VIDEO_S3_REGION"), accessKeyId: required("PAID_VIDEO_S3_ACCESS_KEY_ID"), secretAccessKey: required("PAID_VIDEO_S3_SECRET_ACCESS_KEY") });
        const secret = required("PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX");
        if (!/^[a-f0-9]{64}$/u.test(secret)) throw Error("paid_video_verifier_unavailable");
        s3 = createPaidVideoUploadHandler({ authenticate, rpc, transport,
          verifier: { id: required("PAID_VIDEO_UPLOAD_VERIFIER_ID"), key: Uint8Array.from(secret.match(/../gu)!, pair => parseInt(pair, 16)) } });
      } catch { /* Unconfigured S3 fails closed; R2 cannot substitute for it. */ }
      return createPaidVideoR2UploadRouter({ authenticate, rpc, s3, r2 });
    }
    const transport = createPrivateS3Transport({ routeId: required("PAID_VIDEO_S3_ROUTE_ID"), bucket: required("PAID_VIDEO_S3_BUCKET"),
      region: required("PAID_VIDEO_S3_REGION"), accessKeyId: required("PAID_VIDEO_S3_ACCESS_KEY_ID"), secretAccessKey: required("PAID_VIDEO_S3_SECRET_ACCESS_KEY") });
    if (kind === "range") return createPaidVideoRangeHandler({ authenticate, rpc, transport });
    const secret = required("PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX");
    if (!/^[a-f0-9]{64}$/u.test(secret)) throw Error("paid_video_verifier_unavailable");
    const key = Uint8Array.from(secret.match(/../gu)!, pair => parseInt(pair, 16));
    return createPaidVideoUploadHandler({ authenticate, rpc, transport, verifier: { id: required("PAID_VIDEO_UPLOAD_VERIFIER_ID"), key } });
  } catch { return unavailable; }
}
