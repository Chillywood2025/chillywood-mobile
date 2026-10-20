// Match the existing Edge runtime dependency convention without changing imports globally.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";
import { createContentInspectionHandler } from "../_shared/content-inspection-handler.ts";
import { readExactCurrentSessionAuthority } from "../_shared/exact-subject-authority.ts";
import {
  createInspectionOriginReader,
  inspectionOriginConfig,
} from "../_shared/content-inspection-private-origin.ts";

// Source-only capability. The SQL inspection switch defaults to false; this
// endpoint cannot activate it, grant authority, or change consumer media paths.
Deno.serve((request: Request) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const handler = createContentInspectionHandler({
    authenticate: async (req) => {
      const authorization = req.headers.get("Authorization") ?? "";
      if (!/^Bearer\s+\S+$/i.test(authorization) || !url || !anon) return null;
      const actor = createClient(url, anon, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await actor.auth.getUser();
      if (error || !data.user?.id) return null;
      const session = await readExactCurrentSessionAuthority(
        actor,
        data.user.id,
      );
      if (!session) return null;
      return {
        userId: data.user.id,
        sessionGeneration: session.sessionGeneration,
        rpc: (name, args) => actor.rpc(name, args),
      };
    },
    resolve: (name, args) =>
      createClient(url, service, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).rpc(name, args),
    origin: (binding, method, headers, signal) =>
      createInspectionOriginReader(
        inspectionOriginConfig((name) => Deno.env.get(name)),
      )(binding, method, headers, signal),
  });
  return handler(request);
});
