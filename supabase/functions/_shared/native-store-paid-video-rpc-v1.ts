import { checkPaidVideoDeadline, PaidVideoBoundaryError, readPaidVideoJson } from "./isolated-paid-video-boundary.ts";

export type PaidVideoRpc = (name: string, parameters: Record<string, unknown>, authorization: string | null, deadline: number) => Promise<unknown>;
const names = new Set(["native_store_paid_video_access_v1", "native_paid_video_r2_admit_v1"]);
// The URL, API keys and RPC names are server configuration. No client URL,
// redirect, retry, table query or schema enumeration is supported.
export function createNativeStorePaidVideoRpcV1(configuration: { url: string; anonKey: string; serviceKey: string }, request: typeof fetch = fetch, now = Date.now): PaidVideoRpc {
  const base = new URL(configuration.url);
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/"
    || (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(base.hostname)))
    || !configuration.anonKey || !configuration.serviceKey) throw Error("paid_video_runtime_unavailable");
  return async (name, parameters, authorization, deadline) => {
    if (!names.has(name)) throw Error("paid_video_rpc_unavailable");
    checkPaidVideoDeadline(deadline, now);
    const response = await request(new URL("/rest/v1/rpc/" + name, base), { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(deadline - now()))), headers: { "content-type": "application/json",
        apikey: authorization ? configuration.anonKey : configuration.serviceKey,
        authorization: authorization ?? "Bearer " + configuration.serviceKey }, body: JSON.stringify(parameters) });
    if (!response.ok) { void response.body?.cancel(); throw new PaidVideoBoundaryError("paid_video_backend_unavailable", 503); }
    const value = await readPaidVideoJson(response, 131072, deadline, now); checkPaidVideoDeadline(deadline, now); return value;
  };
}
