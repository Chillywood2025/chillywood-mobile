import { paidVideoRuntime } from "../_shared/isolated-paid-video-runtime.ts";
export const handler = paidVideoRuntime("authoring");
if (import.meta.main) Deno.serve(handler);
