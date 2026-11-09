import { nativeStorePaidVideoRuntimeV1 } from "../_shared/native-store-paid-video-runtime-v1.ts";
export const handler = nativeStorePaidVideoRuntimeV1();
if (import.meta.main) Deno.serve(handler);
