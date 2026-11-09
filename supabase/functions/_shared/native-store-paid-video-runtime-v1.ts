import { createPrivateS3Transport } from "../../../ops/isolated-paid-video-worker/private-object.mjs";
import { authenticatePaidVideoRequest } from "./isolated-paid-video-auth.ts";
import { createNativeStorePaidVideoRpcV1 } from "./native-store-paid-video-rpc-v1.ts";
import { createNativeStorePaidVideoRangeHandlerV1 } from "./native-store-paid-video-range-v1.ts";
import { paidVideoJson } from "./isolated-paid-video-boundary.ts";

// A distinct source-only profile. No env values, objects, keys or enabled
// settings are installed by these files. Environment is captured once.
export function nativeStorePaidVideoRuntimeV1(environment: (key: string) => string | undefined = key => Deno.env.get(key)) {
 const unavailable = async () => paidVideoJson(503, { protocol: "nssv1-range-v1", status: "unavailable" }, "GET");
 if (environment("NATIVE_STORE_PAID_VIDEO_RANGE_V1_ENABLED") !== "true" || environment("PAID_VIDEO_GATEWAY_V2_ENABLED") !== "true") return unavailable;
 try {
  const required = (name: string) => { const value=environment(name); if (!value) throw Error("native_video_runtime_unavailable"); return value; };
  const rpc=createNativeStorePaidVideoRpcV1({url:required("SUPABASE_URL"),anonKey:required("SUPABASE_ANON_KEY"),serviceKey:required("SUPABASE_SERVICE_ROLE_KEY")});
  const transport=createPrivateS3Transport({routeId:required("PAID_VIDEO_S3_ROUTE_ID"),bucket:required("PAID_VIDEO_S3_BUCKET"),region:required("PAID_VIDEO_S3_REGION"),accessKeyId:required("PAID_VIDEO_S3_ACCESS_KEY_ID"),secretAccessKey:required("PAID_VIDEO_S3_SECRET_ACCESS_KEY")});
  return createNativeStorePaidVideoRangeHandlerV1({authenticate:authenticatePaidVideoRequest,rpc,transport});
 } catch { return unavailable; }
}
