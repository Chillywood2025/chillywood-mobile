import {createBrandExpiryOrigin, expirePlatformBrandAsset} from "./brand-retention-expiry.ts";

type Client = {rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error?: unknown}>};
// Separate from inspection and upload paths. No schedule, batch, prefix, or
// automatic retry. Deployment and each live destructive qualification remain
// separately authorized operations; database flags default off.
export function createBrandExpiryHandler(deps: {
  env: (name: string) => string | undefined;
  client: (url: string, key: string) => Client;
  fetcher?: typeof fetch;
}) {
  return async (req: Request) => {
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), {
      status, headers: {"Content-Type": "application/json", "Cache-Control": "no-store"},
    });
    if (req.method !== "POST") return reply(405, {error: "method_not_allowed"});
    const key = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "", url = deps.env("SUPABASE_URL") ?? "";
    if (!key || !url || req.headers.get("Authorization") !== `Bearer ${key}`) return reply(403, {error: "not_allowed"});
    try {
      const raw = await req.text();
      if (raw.length > 256) return reply(400, {error: "exact_asset_required"});
      const input = JSON.parse(raw);
      if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.assetId !== "string") {
        return reply(400, {error: "exact_asset_required"});
      }
      const origin = createBrandExpiryOrigin(url, key, deps.fetcher);
      const client = deps.client(url, key);
      return reply(200, await expirePlatformBrandAsset(input.assetId, {
        rpc: (name, args) => client.rpc(name, args), origin,
      }));
    } catch {
      return reply(503, {error: "brand_expiry_unconfirmed", permanentlyAbsent: false});
    }
  };
}
