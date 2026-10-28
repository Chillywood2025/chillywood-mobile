import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.110.6';
import { createDiscoveryInvalidationHandler } from '../_shared/discovery-invalidation-worker.mjs';

// Gateway JWT verification keeps its default; dedicated worker authorization
// is additionally checked in SQL before any batch can be claimed. Deployment,
// credential provisioning and scheduling are separate authorized operations.
const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createDiscoveryInvalidationHandler({ adminClient }));
