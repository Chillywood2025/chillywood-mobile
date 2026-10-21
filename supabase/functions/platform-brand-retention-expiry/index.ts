import {createClient} from "npm:@supabase/supabase-js@2";
import {createBrandExpiryHandler} from "../_shared/brand-retention-expiry-handler.ts";

Deno.serve(createBrandExpiryHandler({
  env: name => Deno.env.get(name),
  client: (url, key) => createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}}),
}));
