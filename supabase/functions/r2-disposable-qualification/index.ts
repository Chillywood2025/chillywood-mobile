import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { createQualificationHandler } from "../_shared/r2-disposable-qualification-handler.ts";
import { createQualificationRuntime } from "../_shared/r2-disposable-qualification-runtime.ts";

// Bounded fixed-object qualification. No scheduler or alternative authority.
// Cleanup additionally requires the exact owner-recorded SQL approval.
Deno.serve(createQualificationHandler(createQualificationRuntime({
  env: (name) => Deno.env.get(name),
  createClient,
})));
