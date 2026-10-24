import { createQualificationOrigin } from "./r2-disposable-qualification-origin.ts";
import { createQualificationRunStore } from "./r2-disposable-qualification-store.ts";

const projectUrl = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const rpcNames = ["read_r2_qualification_test_run", "cas_r2_qualification_test_run"];
type ClientFactory = (url: string, key: string, options: {
  auth: { persistSession: false; autoRefreshToken: false; detectSessionInUrl: false };
  global: { fetch: typeof fetch };
}) => { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: unknown }> };

// Inert dependency wiring only. The handler must authenticate the exact canonical
// bearer, validate the action and pass applicable source gates before calling store.
// No env reads, client construction, network or registration happens here.
export function createQualificationRuntime(deps: {
  env: (name: string) => string | undefined;
  createClient: ClientFactory;
  request?: typeof fetch;
  now?: () => number;
}) {
  return {
    env: deps.env,
    now: deps.now,
    store: (verifiedKey: string) => createQualificationRunStore(async (name, args) => {
      if (!rpcNames.includes(name)) throw Error("qualification_rpc_not_allowed");
      const address = `${projectUrl}/rest/v1/rpc/${name}`;
      // One client and dispatch allowance per logical RPC, not per invocation.
      // An SDK retry, late retry or concurrent call cannot borrow another RPC's
      // allowance. Unknown outcomes remain unknown; never replay a POST here.
      let dispatched = false;
      const client = deps.createClient(projectUrl, verifiedKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input, init) => {
          const url = input instanceof Request ? input.url : String(input);
          const method = init?.method ?? (input instanceof Request ? input.method : "GET");
          // Exact serialization also refuses query strings, fragments, userinfo,
          // encoded/alternate paths and alternate ports. No URL is env-selected.
          if (dispatched || url !== address || method !== "POST") throw Error("qualification_rpc_transport_denied");
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (headers.get("Authorization") !== `Bearer ${verifiedKey}` || headers.get("apikey") !== verifiedKey) {
            throw Error("qualification_rpc_transport_denied");
          }
          dispatched = true;
          // Rebuild the request instead of forwarding SDK headers, body, Request
          // credentials or redirect defaults. Only the store's fixed RPC args
          // and the handler-verified key can leave this boundary.
          const response = await (deps.request ?? fetch)(address, {
            method: "POST", headers: {
              Authorization: `Bearer ${verifiedKey}`, apikey: verifiedKey,
              "Content-Type": "application/json", "Content-Profile": "public",
            },
            body: JSON.stringify(args), redirect: "error", cache: "no-store",
            credentials: "omit", signal: AbortSignal.timeout(15_000),
          });
          if (response.redirected || response.status !== 200) {
            await response.body?.cancel().catch(() => {});
            throw Error("qualification_rpc_unconfirmed");
          }
          return response;
        } },
      });
      return await client.rpc(name, args);
    }),
    // The handler memoizes this within one request, and only calls it for an
    // actual allowlisted origin operation, never for status or missing state.
    origin: () => createQualificationOrigin(deps.env, deps.request ?? fetch, deps.now ?? Date.now),
  };
}
