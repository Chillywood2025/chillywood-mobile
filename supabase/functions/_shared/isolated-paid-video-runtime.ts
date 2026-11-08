import { createPrivateS3Transport } from "../../../ops/isolated-paid-video-worker/private-object.mjs";
import { authenticatePaidVideoRequest } from "./isolated-paid-video-auth.ts";
import { createPaidVideoRpc } from "./isolated-paid-video-rpc.ts";
import { createPaidVideoAuthoringHandler } from "./isolated-paid-video-authoring.ts";
import { createPaidVideoUploadHandler } from "./isolated-paid-video-upload.ts";
import { createPaidVideoRangeHandler } from "./isolated-paid-video-range.ts";
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
    if (kind === "authoring") return createPaidVideoAuthoringHandler({ authenticate, rpc });
    const transport = createPrivateS3Transport({ routeId: required("PAID_VIDEO_S3_ROUTE_ID"), bucket: required("PAID_VIDEO_S3_BUCKET"),
      region: required("PAID_VIDEO_S3_REGION"), accessKeyId: required("PAID_VIDEO_S3_ACCESS_KEY_ID"), secretAccessKey: required("PAID_VIDEO_S3_SECRET_ACCESS_KEY") });
    if (kind === "range") return createPaidVideoRangeHandler({ authenticate, rpc, transport });
    const secret = required("PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX");
    if (!/^[a-f0-9]{64}$/u.test(secret)) throw Error("paid_video_verifier_unavailable");
    const key = Uint8Array.from(secret.match(/../gu)!, pair => parseInt(pair, 16));
    return createPaidVideoUploadHandler({ authenticate, rpc, transport, verifier: { id: required("PAID_VIDEO_UPLOAD_VERIFIER_ID"), key } });
  } catch { return unavailable; }
}
