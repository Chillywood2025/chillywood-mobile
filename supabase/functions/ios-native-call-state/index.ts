// Incoming-wake status endpoint; capability authentication precedes upgrade.
// completed by the actual handler before any WebSocket upgrade occurs.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.110.6';
import { createNativeCallStateHandler } from '../_shared/ios-native-call-state-observer.mjs';
declare const EdgeRuntime: {waitUntil(completion: Promise<unknown>): void};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: {persistSession: false, autoRefreshToken: false},
});
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
Deno.serve(createNativeCallStateHandler({
  rpc: async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
    const {data, error} = await admin.rpc(name, args).abortSignal(signal);
    if (error) throw new Error('observer_read_unavailable');
    return data;
  },
  sha256,
  upgradeWebSocket: (req: Request, options: {idleTimeout: number}) => Deno.upgradeWebSocket(req, options),
  keepAlive: (completion: Promise<void>) => EdgeRuntime.waitUntil(completion),
}));
