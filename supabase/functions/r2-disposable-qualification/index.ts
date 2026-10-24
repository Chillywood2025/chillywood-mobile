import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { createQualificationHandler } from "../_shared/r2-disposable-qualification-handler.ts";
import { createQualificationRuntime } from "../_shared/r2-disposable-qualification-runtime.ts";

// Bounded non-delete qualification only. No scheduler, alternative authority or
// cleanup approval. Deployment and verified live setup remain separate checks.
Deno.serve(createQualificationHandler(createQualificationRuntime({
  env: (name) => Deno.env.get(name),
  createClient,
})));
