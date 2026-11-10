import { createPrivateS3Transport } from "../../../ops/isolated-paid-video-worker/private-object.mjs";
import { authenticatePaidVideoRequest } from "./isolated-paid-video-auth.ts";
import { createNativeStorePaidVideoRpcV1 } from "./native-store-paid-video-rpc-v1.ts";
import { createNativeStorePaidVideoRangeHandlerV1 } from "./native-store-paid-video-range-v1.ts";
import { createNativeStorePaidVideoR2RangeHandlerV1 } from "./native-store-paid-video-r2-range-v1.ts";
import { paidVideoJson } from "./isolated-paid-video-boundary.ts";

// A distinct source-only profile. No env values, objects, keys or enabled
// settings are installed by these files. Environment is captured once.
export function nativeStorePaidVideoRuntimeV1(environment: (key: string) => string | undefined = key => Deno.env.get(key)) {
 const unavailable = async () => paidVideoJson(503, { protocol: "nssv1-range-v1", status: "unavailable" }, "GET");
 if (environment("NATIVE_STORE_PAID_VIDEO_RANGE_V1_ENABLED") !== "true" || environment("PAID_VIDEO_GATEWAY_V2_ENABLED") !== "true") return unavailable;
 try {
  const required = (name: string) => { const value=environment(name); if (!value) throw Error("native_video_runtime_unavailable"); return value; };
  const rpc=createNativeStorePaidVideoRpcV1({url:required("SUPABASE_URL"),anonKey:required("SUPABASE_ANON_KEY"),serviceKey:required("SUPABASE_SERVICE_ROLE_KEY")});
  const storage=environment("PAID_VIDEO_STORAGE_MODE")??"s3";
  if(!["s3","r2-native-v1"].includes(storage))return unavailable;
  if(storage==="r2-native-v1"){
   if(environment("PAID_VIDEO_R2_GATEWAY_V1_ENABLED")!=="true")return unavailable;
   let s3Handler: (request: Request) => Promise<Response>=unavailable;
   try{const transport=createPrivateS3Transport({routeId:required("PAID_VIDEO_S3_ROUTE_ID"),bucket:required("PAID_VIDEO_S3_BUCKET"),region:required("PAID_VIDEO_S3_REGION"),accessKeyId:required("PAID_VIDEO_S3_ACCESS_KEY_ID"),secretAccessKey:required("PAID_VIDEO_S3_SECRET_ACCESS_KEY")});
    s3Handler=createNativeStorePaidVideoRangeHandlerV1({authenticate:authenticatePaidVideoRequest,rpc,transport});}catch{/* No S3 route configured; never guess one. */}
   return createNativeStorePaidVideoR2RangeHandlerV1({authenticate:authenticatePaidVideoRequest,rpc,s3Handler,gateway:{
    origin:required("PAID_VIDEO_R2_GATEWAY_ORIGIN"),bucket:required("PAID_VIDEO_R2_BUCKET"),routeId:required("PAID_VIDEO_R2_ROUTE_ID"),
    profileId:required("PAID_VIDEO_R2_PROFILE_ID"),keyId:required("PAID_VIDEO_R2_GATEWAY_KEY_ID"),qualificationSha256:required("PAID_VIDEO_R2_QUALIFICATION_SHA256"),
   }});
  }
  const transport=createPrivateS3Transport({routeId:required("PAID_VIDEO_S3_ROUTE_ID"),bucket:required("PAID_VIDEO_S3_BUCKET"),region:required("PAID_VIDEO_S3_REGION"),accessKeyId:required("PAID_VIDEO_S3_ACCESS_KEY_ID"),secretAccessKey:required("PAID_VIDEO_S3_SECRET_ACCESS_KEY")});
  return createNativeStorePaidVideoRangeHandlerV1({authenticate:authenticatePaidVideoRequest,rpc,transport});
 } catch { return unavailable; }
}
