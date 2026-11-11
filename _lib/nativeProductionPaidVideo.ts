import { AppState, Platform } from 'react-native';
import { nativeProductionPaidVideoBridge } from './nativeProductionPaidVideoBridge';
import { purchaseRevenueCatProductionPaidVideo } from './revenuecat';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { invokeCreatorMoneyPurchaseSubjectRpc, isCreatorMoneyPurchaseAuthorityCurrent,
  revalidateCreatorMoneyPurchaseSubject, validateCreatorMoneyPurchaseIntent,
  type CreatorMoneyPurchaseIntentExpectation, type CreatorMoneyPurchaseSubject } from './creatorMoneyPurchaseAuthority';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Production checkout is unavailable.');
  return value as Record<string, unknown>;
};
const text = (value: unknown) => { if (typeof value !== 'string' || !value) throw Error('Production checkout is unavailable.'); return value; };
const uuid = () => {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
async function edge(subject: CreatorMoneyPurchaseSubject, path: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, { method: 'POST',
    headers: { Authorization: `Bearer ${subject.accessToken}`, apikey: SUPABASE_ANON_KEY,
      'X-Chillywood-Auth-Session': subject.authority.sessionGeneration, 'Content-Type':'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(18000), redirect:'error', cache:'no-store' });
  if (!response.ok) throw Error('Production checkout requires reconciliation.');
  return object(await response.json());
}
let recoveryFlight: { owner: string; promise: Promise<void> } | null = null;
// Process-memory only. Never reconstruct launch permission from a journal,
// absent callback, elapsed admission or a restarted application's storage.
const retainedLaunches=new Map<string,{handle:string;buyerId:string;sessionId:string;productId:string;launchBeforeMs:number;admissionId:string;configurationSha256:string}>();
async function launchRetained(subject: CreatorMoneyPurchaseSubject,dispatchId:string) {
  const retained=retainedLaunches.get(dispatchId);
  if(!retained||retained.buyerId!==subject.userId||retained.sessionId!==subject.authority.sessionGeneration)
    throw Error('Original native launch is unavailable.');
  const preflight=await edge(subject,`native-production-paid-video-playback/preflight/${retained.admissionId}`,
    {configurationSha256:retained.configurationSha256});
  if(preflight.status!=='READY'||preflight.admissionId!==retained.admissionId)throw Error('Original video delivery is unavailable.');
  const result=await purchaseRevenueCatProductionPaidVideo(retained.productId,retained.handle,{authority:subject.authority,
    assertPurchaseLaunchAllowed:()=>{
      if(!isCreatorMoneyPurchaseAuthorityCurrent(subject.authority)||AppState.currentState!=='active'||Date.now()>=retained.launchBeforeMs)
        throw Error('Original native launch authority changed.');
    }});
  retainedLaunches.delete(dispatchId);
  return result;
}
// Purchases refresh/restore uses exact server-listed dispatches, never SKU
// inference or another purchase. Raw journals remain in native protected storage.
export function reconcileNativeProductionPaidVideoPurchases(subject: CreatorMoneyPurchaseSubject): Promise<void> {
  const owner=`${subject.userId}:${subject.authority.sessionGeneration}`;
  if(recoveryFlight?.owner===owner)return recoveryFlight.promise;
  const current=()=>isCreatorMoneyPurchaseAuthorityCurrent(subject.authority)&&AppState.currentState==='active';
  const promise=(async()=>{
    let after: string|null=null;
    do {
    if(!current())return;
    const listed=await invokeCreatorMoneyPurchaseSubjectRpc<unknown>(subject,'list_native_production_purchase_recovery',{p_after:after});
    if(listed.error||!current())return;
    const page=object(listed.data),rows=page.dispatches;
    if(!Array.isArray(rows)||rows.length>10)return;
    await Promise.all(rows.map(async value=>{
      try {
        const row=object(value),dispatchId=text(row.dispatchId),session=text(row.originalSessionId);
        if(!current())return;
        const reconciled=await edge(subject,'native-production-store-witness',{action:'reconcile',dispatchId});
        if(!current()||reconciled.status==='ACCESS_VERIFIED')return;
        const witness=await nativeProductionPaidVideoBridge().recover(dispatchId,subject.userId,session);
        if(!current()||witness.status!=='witness'||witness.dispatchId!==dispatchId)return;
        await edge(subject,'native-production-store-witness',{action:'complete',dispatchId,witness:witness.witness,
          ...(Platform.OS==='ios'?{keyId:witness.keyId,assertionBase64:witness.assertionBase64}:{integrityToken:witness.integrityToken})});
      } catch { /* Unknown outcomes stay retained; recovery never purchases. */ }
    }));
    const next=page.nextCursor;
    if(next==null)return;
    if(typeof next!=='string'||(after!==null&&next<=after))return;
    after=next;
    } while(current());
  })().catch(()=>{}).finally(()=>{if(recoveryFlight?.promise===promise)recoveryFlight=null;});
  recoveryFlight={owner,promise};return promise;
}
export async function purchaseNativeProductionPaidVideo(subject: CreatorMoneyPurchaseSubject,
  expected: Omit<CreatorMoneyPurchaseIntentExpectation,'status'>, productKey: string): Promise<{
    intentId?: string; productId: string; launched: boolean; accessGranted: boolean; alreadyPurchased?: boolean;
  }> {
  expected = Object.freeze({ ...expected });
  subject = Object.freeze({ ...subject, authority: Object.freeze({ ...subject.authority }) });
  if (expected.environment !== 'production' || expected.sourceType !== 'paid_content' || expected.userId !== subject.userId)
    throw Error('Production checkout is unavailable.');
  const current = () => {
    if (!isCreatorMoneyPurchaseAuthorityCurrent(subject.authority) || AppState.currentState !== 'active')
      throw Error('Account or application state changed before production checkout.');
  };
  const rpc = async (name: string, args: Record<string,unknown>) => {
    const result = await invokeCreatorMoneyPurchaseSubjectRpc<unknown>(subject,name,args);
    current(); if (result.error) throw Error('Production checkout is unavailable.'); return object(result.data);
  };
  current(); const bridge = nativeProductionPaidVideoBridge(); const build = await bridge.status(); current();
  for(const [id,entry] of retainedLaunches)if(entry.launchBeforeMs<=Date.now()||entry.buyerId!==subject.userId
    ||entry.sessionId!==subject.authority.sessionGeneration)retainedLaunches.delete(id);
  if (build.protocol !== 'native-production-witness-v1' || build.available !== true || !build.configurationSha256
    || !/^[0-9a-f]{64}$/.test(build.configurationSha256)) throw Error('Production checkout is not qualified.');
  const digest = build.configurationSha256;
  const preparation = await rpc('prepare_native_production_paid_video', { p_video_id: expected.sourceId,
    p_provider: expected.provider, p_product_key: productKey, p_provider_product_id: expected.providerProductId,
    p_amount_minor: expected.amountMinor });
  if (preparation.alreadyPurchased === true)
    return { productId: expected.providerProductId, launched:false, accessGranted:false, alreadyPurchased:true };
  if (preparation.nativeProductionPending === true) {
    const dispatchId=text(preparation.dispatchId),originalSession=text(preparation.originalSessionId);
    const retained=retainedLaunches.get(dispatchId);
    const resuming=!!retained&&retained.buyerId===subject.userId&&retained.sessionId===subject.authority.sessionGeneration
      &&retained.productId===expected.providerProductId;
    const witness=resuming
      ?await launchRetained(subject,dispatchId)
      :await bridge.recover(dispatchId,subject.userId,originalSession); current();
    if(witness.status!=='witness'||witness.dispatchId!==dispatchId)
      return {intentId:text(preparation.id),productId:expected.providerProductId,launched:resuming,accessGranted:false};
    const result=await edge(subject,'native-production-store-witness',{action:'complete',dispatchId,witness:witness.witness,
      ...(Platform.OS==='ios'?{keyId:witness.keyId,assertionBase64:witness.assertionBase64}:{integrityToken:witness.integrityToken})});
    return {intentId:text(preparation.id),productId:expected.providerProductId,launched:resuming,accessGranted:result.status==='ACCESS_VERIFIED'};
  }
  const capability = await rpc('get_native_production_paid_video_capability', { p_provider: expected.provider,
    p_provider_product_id: expected.providerProductId, p_configuration_sha256: digest });
  if (capability.enabled !== true || capability.protocol !== 'native-production-checkout-v1' || capability.environment !== 'production')
    throw Error('Production checkout is not qualified.');
  const admission = object(preparation.nativeProductionPreparation), admissionId = text(admission.admissionId);
  if (admission.dispatchAllowed !== false) throw Error('Production preparation is invalid.');
  const preflight = await edge(subject,`native-production-paid-video-playback/preflight/${admissionId}`,{configurationSha256:digest}); current();
  if (preflight.status !== 'READY' || preflight.admissionId !== admissionId) throw Error('Private video delivery is unavailable.');
  const intent = await rpc('create_native_production_paid_video_intent', { p_admission_id:admissionId,p_configuration_sha256:digest });
  if (intent.alreadyPurchased === true)
    return { productId:expected.providerProductId,launched:false,accessGranted:false,alreadyPurchased:true };
  const validated = validateCreatorMoneyPurchaseIntent(intent,{...expected,status:'pending'});
  if (!validated) throw Error('Production purchase intent is invalid.');
  const intentId = validated.id, dispatchId = text(intent.nativeProductionDispatchId);
  const ready = await edge(subject,'native-production-store-witness',{action:'prepare',dispatchId}); current();
  if (ready.status !== 'READY') throw Error('Production receipt verification is unavailable.');
  const native = Object.freeze({ ...object(ready.nativeContext) });
  if (native.dispatchId !== dispatchId || native.admissionId !== admissionId || native.quoteId !== admission.quoteSha256
    || native.buyerId !== subject.userId || native.sessionId !== subject.authority.sessionGeneration
    || native.productId !== expected.providerProductId || native.grossMinor !== String(expected.amountMinor)
    || native.currency !== expected.currency.toUpperCase() || native.configurationSha256 !== digest
    || native.applicationId !== build.applicationId || native.nativeBuild !== build.nativeBuild || native.sdkVersion !== build.sdkVersion
    || !Object.values(native).every(value=>typeof value==='string')) throw Error('Production native preparation changed.');
  let keyId = '';
  if (Platform.OS === 'ios') {
    const enrollment = await edge(subject,'native-production-store-witness',{action:'enroll_start',dispatchId}); current();
    const proof = await bridge.enroll(text(enrollment.challenge)); current();
    const enrolled = await edge(subject,'native-production-store-witness',{action:'enroll_finish',dispatchId,
      enrollmentId:enrollment.enrollmentId,keyId:proof.keyId,attestationBase64:proof.attestationBase64}); current();
    if (enrolled.status !== 'ENROLLED' || enrolled.keyId !== proof.keyId) throw Error('Production device enrollment is unavailable.');
    keyId = proof.keyId;
  }
  const handle = await bridge.prepare(native as Record<string,string>,keyId,`Bearer ${subject.accessToken}`); current();
  retainedLaunches.set(dispatchId,{handle,buyerId:subject.userId,sessionId:subject.authority.sessionGeneration,
    productId:expected.providerProductId,launchBeforeMs:Number(native.launchBeforeMs),admissionId,configurationSha256:digest});
  // Refresh byte-delivery proof after all native enrollment/product awaits.
  const finalPreflight = await edge(subject,`native-production-paid-video-playback/preflight/${admissionId}`,{configurationSha256:digest}); current();
  if (finalPreflight.status !== 'READY' || !await revalidateCreatorMoneyPurchaseSubject(subject)) throw Error('Production delivery authority changed.');
  current(); const attemptId=uuid();
  const claim=await rpc('claim_native_production_paid_video_checkout',{p_intent_id:intentId,p_attempt_id:attemptId,p_configuration_sha256:digest});
  if (!validateCreatorMoneyPurchaseIntent(claim,{...expected,status:'pending'}) || claim.id!==intentId
    || claim.startAuthorized!==true || claim.dispatchAllowed!==true || claim.checkoutAttemptId!==attemptId
    || claim.nativeProductionDispatchId!==dispatchId || claim.configurationSha256!==digest || claim.quoteSha256!==native.quoteId)
    throw Error('Production launch is already claimed or unavailable. Do not repeat the purchase.');
  const witness=await launchRetained(subject,dispatchId);
  if (witness.dispatchId!==dispatchId) throw Error('Production outcome requires reconciliation.');
  if (witness.status!=='witness') return {intentId,productId:expected.providerProductId,launched:true,accessGranted:false};
  const result=await edge(subject,'native-production-store-witness',{action:'complete',dispatchId,witness:witness.witness,
    ...(Platform.OS==='ios'?{keyId:witness.keyId,assertionBase64:witness.assertionBase64}:{integrityToken:witness.integrityToken})});
  return {intentId,productId:expected.providerProductId,launched:true,accessGranted:result.status==='ACCESS_VERIFIED'&&result.accessGranted===true};
}
