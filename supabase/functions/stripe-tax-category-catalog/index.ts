import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createAdminClient, jsonResponse, optionsResponse, readOptionalEnv } from '../_shared/stripe-connect.ts';
import { readStripeTaxCodeCatalog, readTaxCatalogText } from '../_shared/stripe-tax-code-catalog.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });
  const url = readOptionalEnv('SUPABASE_URL'), anon = readOptionalEnv('SUPABASE_ANON_KEY');
  const token = req.headers.get('Authorization');
  if (!token?.startsWith('Bearer ')) return jsonResponse(401, { error: 'owner_current_session_required' });
  if (!url || !anon) return jsonResponse(503, { error: 'server_not_configured' });
  try {
    // Database checks exact current session AND current owner membership. No
    // provider request or privileged evidence write precedes this check.
    const authorize = () => fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/get_owner_merch_tax_review_queue`, {
      method: 'POST', redirect: 'error', headers: { apikey: anon, Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_limit: 1 }), signal: AbortSignal.timeout(15000),
    });
    if (!(await authorize()).ok) return jsonResponse(403, { error: 'owner_current_session_required' });
    const text = await readTaxCatalogText(req.body, 1024);
    const body = JSON.parse(text || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'startingAfter')
      || (body.startingAfter !== undefined && (typeof body.startingAfter !== 'string' || !/^txcd_[0-9]+$/.test(body.startingAfter))))
      return jsonResponse(400, { error: 'tax_catalog_request_invalid' });
    const key = readOptionalEnv('STRIPE_MERCH_LIVE_OBSERVATION_KEY'), account = readOptionalEnv('STRIPE_MERCH_LIVE_OBSERVATION_ACCOUNT_ID');
    if (!key || !account) return jsonResponse(503, { error: 'tax_catalog_not_configured', providerReady: false });
    const catalog = await readStripeTaxCodeCatalog(key, account, body.startingAfter);
    // A switched/revoked session cannot commit or receive the completed read.
    if (!(await authorize()).ok) return jsonResponse(403, { error: 'owner_current_session_required' });
    const admin = createAdminClient();
    if (!admin.configured) throw Error('server_not_configured');
    const recorded = await admin.client.rpc('record_merch_tax_code_catalog', { p_codes: catalog.codes });
    if (recorded.error || recorded.data !== true) throw Error('tax_catalog_record_failed');
    return jsonResponse(200, catalog);
  } catch { return jsonResponse(409, { error: 'tax_catalog_unavailable', providerReady: false }); }
});
