import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9.15.1';
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { readCashoutBody } from '../_shared/creator-cashout-execution.ts';
import { object, decodeGoogleIntegrity, readGooglePurchase, type StoreContext } from '../_shared/native-production-store-verification.ts';
import { verifyProductionAppleEnrollment, verifyProductionAppleAssertion, readProductionAppleTransaction } from '../_shared/native-production-apple-verification.ts';
import { nativeProductionLaunchWindow } from '../_shared/native-production-launch-window.ts';
import { authenticateNativeProduction } from '../_shared/native-production-auth.ts';

const hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const uuid = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw Error('invalid_identifier');
  return value;
};
const text = (value: unknown, limit = 512): string => {
  if (typeof value !== 'string' || !value.length || value.length > limit) throw Error('invalid_text');
  return value;
};
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
// Runtime is unqualified without BOTH an explicit enable and all private
// provider credentials. Presence is not device/release evidence; DB gates also
// require the separately reviewed empty-by-default app/build qualification.
function required(name: string): string { return text(Deno.env.get(name), 32768); }
function googleAuth(scope: string) {
  return new GoogleAuth({ credentials: JSON.parse(required('NATIVE_PRODUCTION_GOOGLE_SERVICE_ACCOUNT')),
    scopes: [scope] });
}
async function googleToken(scope: string) {
  const token = await googleAuth(scope).getAccessToken(); if (!token) throw Error('google_unavailable'); return token;
}
function requireProviderReady(provider: unknown) {
  required('NATIVE_PRODUCTION_RECEIPT_KEY_ID'); required('NATIVE_PRODUCTION_RECEIPT_SIGNING_KEY_HEX');
  if (provider === 'revenuecat_app_store') {
    for (const name of ['NATIVE_PRODUCTION_APPLE_SIGNING_KEY','NATIVE_PRODUCTION_APPLE_KEY_ID',
      'NATIVE_PRODUCTION_APPLE_ISSUER_ID','NATIVE_PRODUCTION_APPLE_ROOTS_BASE64_JSON']) required(name);
  } else if (provider === 'revenuecat_google_play') required('NATIVE_PRODUCTION_GOOGLE_SERVICE_ACCOUNT');
  else throw Error('provider_unqualified');
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (Deno.env.get('NATIVE_PRODUCTION_STORE_WITNESS_ENABLED') !== 'true')
    return json(200, { status: 'disabled', financialAuthority: false, payable: false });
  const deadline = AbortSignal.timeout(15000);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'authentication_required' });
    const actor = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization }, fetch: (url, init) => fetch(url, { ...init, signal: deadline }) } });
    const authenticated = await authenticateNativeProduction(request, actor);
    if (!authenticated) return json(401, { error: 'authentication_required' });
    const { buyerId, sessionId } = authenticated;
    const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, init) => fetch(url, { ...init, signal: deadline }) } });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await admin.rpc(name, args); if (result.error) throw Error('authority_unavailable'); return result.data;
    };
    const body = object(JSON.parse(await readCashoutBody(request.body, 65536, 5000)));
    const action = text(body.action, 32), dispatchId = uuid(body.dispatchId);
    const common = { p_dispatch_id: dispatchId, p_buyer_id: buyerId, p_session_id: sessionId };
    const context = object(await rpc('resolve_native_production_witness_context', { ...common, p_recovery: action === 'complete' || action === 'reconcile' }));
    if (action === 'reconcile') {
      if (Object.keys(body).length !== 2) throw Error('invalid_request');
      return json(200, await rpc('reconcile_native_production_dispatch', common));
    }
    requireProviderReady(context.provider);
    if (action === 'authorize_invoke') {
      if (Object.keys(body).length !== 3) throw Error('invalid_request');
      return json(200, await rpc('authorize_native_production_sdk_entry', { ...common, p_preparation_id: uuid(body.preparationId) }));
    }
    if (action === 'prepare') {
      if (Object.keys(body).length !== 2) throw Error('invalid_request');
      return json(200, { status: 'READY', nativeContext: context.nativeContext, financialAuthority: false });
    }
    if (action === 'enroll_start') {
      if (Object.keys(body).length !== 2) throw Error('invalid_request');
      const result = object(await rpc('start_native_production_witness_enrollment', common));
      return json(200, { status: 'READY', enrollmentId: result.enrollmentId, challenge: result.challenge });
    }
    if (action === 'enroll_finish') {
      if (Object.keys(body).length !== 5) throw Error('invalid_request');
      const enrollmentId = uuid(body.enrollmentId), keyId = text(body.keyId, 128), attestation = text(body.attestationBase64, 24000);
      const enrollment = object(await rpc('resolve_native_production_witness_enrollment', {
        p_enrollment_id: enrollmentId, p_buyer_id: buyerId, p_session_id: sessionId }));
      const result = verifyProductionAppleEnrollment({ attestationBase64: attestation,
        challenge: text(enrollment.challenge), keyId, applicationId: text(enrollment.applicationId),
        teamId: text(enrollment.teamId), nowMs: Date.now() });
      await rpc('accept_native_production_witness_enrollment', { p_enrollment_id: enrollmentId,
        p_buyer_id: buyerId, p_session_id: sessionId, p_key_id: result.keyId,
        p_public_key: result.publicKey, p_evidence_sha256: hex(attestation) });
      return json(200, { status: 'ENROLLED', keyId: result.keyId });
    }
    const preparing = action === 'authorize_launch';
    if (action !== 'complete' && !preparing) throw Error('invalid_request');
    const witnessRaw = text(body.witness, 20000), witness = object(JSON.parse(witnessRaw));
    const native = object(context.nativeContext), apple = context.provider === 'revenuecat_app_store';
    const expected = [...Object.keys(native), 'state', 'preparationId',
      ...(preparing ? (apple ? ['keyId'] : []) : ['launchedAtMs','completedAtMs','transactionId','elapsedToLaunchMs',apple ? 'keyId' : 'purchaseToken'])];
    if (Object.keys(witness).length !== expected.length || !expected.every(key => typeof witness[key] === 'string')
      || !Object.keys(native).every(key => witness[key] === native[key]) || witness.state !== (preparing ? 'prepared' : 'completed')) throw Error('witness_binding_mismatch');
    if (Object.keys(body).length !== (apple ? 5 : 4)) throw Error('invalid_request');
    const preparationId = uuid(witness.preparationId);
    // Device wall time is descriptive only. Launch authority comes from the
    // server acknowledgment plus the native-owned same-preparation monotonic
    // interval, which is checked again atomically in PostgreSQL.
    let launchLowerMs = 0, elapsed = 0;
    if (!preparing) {
      const launch = object(context.launchReady);
      const window = nativeProductionLaunchWindow({ preparationId, storedPreparationId: text(launch.preparationId),
        serverReceivedAt: text(launch.serverReceivedAt), elapsedToLaunchMs: text(witness.elapsedToLaunchMs),
        elapsedLimitMs: Number(launch.elapsedLimitMs), admissionExpiresMs: text(native.launchBeforeMs),
        checkoutStartedAt: text(context.checkoutStartedAt) });
      launchLowerMs = window.lowerMs; elapsed = window.elapsedMs;
    }
    const digest = hex(witnessRaw); let counter: number | null = null, previousCounter: number | null = null;
    const keyId = apple ? text(body.keyId, 128) : null;
    if (apple && witness.keyId !== keyId) throw Error('witness_key_mismatch');
    if (preparing || context.verifiedWitnessSha256 !== digest) {
      if (apple) {
        const key = object(await rpc('resolve_native_production_witness_key', { ...common, p_key_id: keyId, p_recovery: !preparing }));
        previousCounter = Number(key.counter);
        counter = verifyProductionAppleAssertion({ assertionBase64: text(body.assertionBase64, 8192), witness: witnessRaw,
          publicKey: text(key.publicKey, 2048), previousCounter, applicationId: text(native.applicationId), teamId: text(context.appleTeamId) });
      } else {
        await decodeGoogleIntegrity(text(body.integrityToken, 32768), { applicationId: text(native.applicationId),
          nativeBuild: text(native.nativeBuild), certificateSha256: text(context.googleCertificateSha256),
          requestHash: createHash('sha256').update(witnessRaw, 'utf8').digest('base64url'),
          earliestMs: Date.now() - 120000, latestMs: Date.now() + 5000 },
          await googleToken('https://www.googleapis.com/auth/playintegrity'), deadline);
      }
    }
    if (preparing) {
      return json(200, await rpc('accept_native_production_launch_ready', { ...common, p_prepared_sha256: digest,
        p_preparation_id: preparationId, p_key_id: keyId, p_previous_counter: previousCounter, p_counter: counter }));
    }
    const storeContext: StoreContext = { provider: apple ? 'app_store' : 'google_play', applicationId: text(native.applicationId),
      appleAppId: apple ? Number(context.appleAppId) : undefined, buyerId, productId: text(native.productId),
      transactionId: text(witness.transactionId), purchaseToken: apple ? undefined : text(witness.purchaseToken, 8192),
      expectedGoogleAccountId: apple ? undefined : hex(buyerId) };
    const facts = apple ? await readProductionAppleTransaction(storeContext, {
      signingKey: required('NATIVE_PRODUCTION_APPLE_SIGNING_KEY'), keyId: required('NATIVE_PRODUCTION_APPLE_KEY_ID'),
      issuerId: required('NATIVE_PRODUCTION_APPLE_ISSUER_ID'),
      rootCertificates: JSON.parse(required('NATIVE_PRODUCTION_APPLE_ROOTS_BASE64_JSON')).map((value: string) => Buffer.from(value, 'base64')),
    }) : await readGooglePurchase(storeContext, await googleToken('https://www.googleapis.com/auth/androidpublisher'), deadline);
    if ((apple ? facts.grossMinor : facts.pricing?.listingMinor) !== Number(native.grossMinor) || facts.currency !== native.currency
      || Date.parse(facts.purchasedAt) < launchLowerMs || Date.parse(facts.purchasedAt) > Date.now()) throw Error('store_witness_mismatch');
    await rpc('accept_native_production_verified_witness', { ...common, p_witness_sha256: digest,
      p_transaction_id: facts.transactionId, p_key_id: keyId, p_previous_counter: previousCounter, p_counter: counter,
      p_preparation_id: preparationId, p_elapsed_to_launch_ms: elapsed });
    // Canonical webhook ordering cannot discard independently verified facts.
    // Persist a signed token-free envelope before either side tries binding.
    const assertion = JSON.stringify({ dispatchId, canonicalReceiptId: null,
      provider: context.provider, environment: 'production', projectId: context.projectId, appId: context.appId,
      storeAccountId: context.storeAccountId, productId: facts.productId, buyerId, transactionId: facts.transactionId,
      originalTransactionId: facts.originalTransactionId, grossMinor: facts.grossMinor, currency: facts.currency.toLowerCase(),
      quantity: 1, purchasedAt: facts.purchasedAt, adapterVersion: 'native-attested-store-v1', evidenceSha256: digest,
      verifiedAt: new Date().toISOString(), pricing: facts.pricing ?? null });
    const signingKey = required('NATIVE_PRODUCTION_RECEIPT_SIGNING_KEY_HEX');
    if (!/^[0-9a-f]{64,}$/.test(signingKey) || signingKey.length % 2) throw Error('issuer_unqualified');
    const result = object(await rpc('accept_native_production_verified_store_facts', {
      p_key_id: uuid(required('NATIVE_PRODUCTION_RECEIPT_KEY_ID')), p_assertion: assertion,
      p_signature_sha256: createHmac('sha256', Buffer.from(signingKey, 'hex')).update(assertion, 'utf8').digest('hex') }));
    if (!['HELD','ACCESS_VERIFIED'].includes(String(result.status)) || result.financialAuthority !== false || result.payable !== false)
      throw Error('issuer_unavailable');
    return json(200, result);
  } catch {
    // Raw Store tokens, assertions, credentials, provider bodies and identifiers
    // never enter logs, analytics, crash reports or public error responses.
    return json(409, { status: 'HELD', accessGranted: false, financialAuthority: false, payable: false });
  }
});
