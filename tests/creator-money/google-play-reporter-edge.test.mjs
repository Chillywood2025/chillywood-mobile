import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
const {googlePlayReporterAccessToken}=loadPureTypeScriptModule('supabase/functions/_shared/google-play-reporter-oauth.ts');
const source=readFileSync('supabase/functions/google-play-external-reporter/index.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({enabled=true,result={status:'unknown',reason:'synthetic_lost_response'},commit=true,tax=false,taxFails=false}={}){
  const secret='synthetic-worker-secret-'+'.'.repeat(40),calls=[];let handler;
  const env={GOOGLE_PLAY_EXTERNAL_REPORTER_WORKER_SECRET:secret,GOOGLE_PLAY_EXTERNAL_REPORTING_ENABLED:String(enabled),
    GOOGLE_PLAY_EXTERNAL_LICENSE_TEST_MODE:'true',GOOGLE_PLAY_EXTERNAL_REPORTER_SERVICE_ACCOUNT_JSON:'synthetic-not-a-real-key'};
  if(tax){env.STRIPE_SECRET_KEY='sk_test_synthetic';env.STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID='acct_platform';}
  const require=name=>{
    if(name.startsWith('jsr:'))return {};
    if(name.endsWith('google-refund-tax-reconciliation.ts'))return {observeGoogleRefundTax:async()=>{
      calls.push({name:'observe-tax'});if(taxFails)throw Error('synthetic-provider-unavailable');return {synthetic:'provider-bound-facts'};
    }};
    if(name.endsWith('merch-observation-budget.ts'))return loadPureTypeScriptModule('supabase/functions/_shared/merch-observation-budget.ts');
    if(name.endsWith('stripe-connect.ts'))return {
      readOptionalEnv:key=>env[key],jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),
      createAdminClient:()=>({configured:true,client:{rpc:async(name,args)=>{
        calls.push({name,args});if(name==='claim_google_refund_tax_context')return{data:{transaction_id:'synthetic-id',feature:'creator_tip'}};
        return name==='claim_google_play_external_report'
          ?{data:{outboxId:'synthetic-outbox',report:{externalTransactionToken:'private-synthetic'}},error:null}
          :{data:commit,error:null};
      }}}),
    };
    if(name.endsWith('google-play-reporter-oauth.ts'))return {googlePlayReporterAccessToken:async()=>{calls.push({name:'oauth'});return 'synthetic-oauth';}};
    if(name.endsWith('google-play-external-reporting.ts'))return {submitExternalReport:async()=>{calls.push({name:'report'});return result;}};
    throw Error('unexpected import');
  };
  const module={exports:{}};
  new Function('require','module','exports','Deno',code)(require,module,module.exports,{serve:fn=>handler=fn});
  return {calls,env,send:authorization=>handler(new Request('https://fixture.invalid',{method:'POST',
    headers:authorization===null?{}:{authorization:authorization??`Bearer ${secret}`}}))};
}
test('worker rejects arbitrary/public requests and disabled setup before OAuth or claiming private data',async()=>{
  const h=harness();assert.equal((await h.send(null)).status,401);assert.equal(h.calls.length,0);
  assert.equal((await h.send('Bearer guessed')).status,401);assert.equal(h.calls.length,0);
  const disabled=harness({enabled:false});assert.equal((await disabled.send()).status,503);assert.equal(disabled.calls.length,0);
});
test('worker persists unknown outcome using lease, returns no token/private quote/receipt',async()=>{
  const h=harness();const response=await h.send();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{processed:true,status:'unknown'});
  const claim=h.calls.find(c=>c.name==='claim_google_play_external_report');
  const finish=h.calls.find(c=>c.name==='finish_google_play_external_report');
  assert.equal(claim.args.p_lease_id,finish.args.p_lease_id);assert.equal(finish.args.p_result.status,'unknown');
});
test('worker does not acknowledge a failed durable result commit',async()=>{
  const h=harness({commit:false});const response=await h.send();assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'google_report_commit_pending'});
});
test('configured worker reconciles tax before report claim; unresolved tax does not block unrelated reports',async()=>{
 for(const taxFails of [false,true]){
  const h=harness({tax:true,taxFails});assert.equal((await h.send()).status,200);
  const names=h.calls.map(c=>c.name);assert.ok(names.indexOf('claim_google_refund_tax_context')<names.indexOf('claim_google_play_external_report'));
  assert.equal(names.includes('record_google_refund_tax_evidence'),!taxFails);
  assert.ok(names.includes('finish_google_play_external_report'));
 }
});

test('OAuth helper signs only the fixed Android Publisher scope and never follows a credential-supplied endpoint',async()=>{
  // Ephemeral synthetic fixture key only: never stored, logged or sent anywhere.
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const exported=new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey));
  const key=`-----BEGIN PRIVATE KEY-----\n${Buffer.from(exported).toString('base64')}\n-----END PRIVATE KEY-----`;
  const credentials=JSON.stringify({type:'service_account',client_email:'fixture@fixture.iam.gserviceaccount.com',
    private_key:key,token_uri:'https://untrusted.invalid/token'});
  let calls=0;
  const result=await googlePlayReporterAccessToken(credentials,async(url,init)=>{
    calls++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(init.redirect,'error');
    assert.equal(init.method,'POST');assert.equal(init.body.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const jwt=init.body.get('assertion'),[header,claims,signature]=jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header,'base64url')),{alg:'RS256',typ:'JWT'});
    const body=JSON.parse(Buffer.from(claims,'base64url'));
    assert.equal(body.scope,'https://www.googleapis.com/auth/androidpublisher');
    assert.equal(body.aud,'https://oauth2.googleapis.com/token');assert.equal(body.exp-body.iat,3600);
    assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,Buffer.from(signature,'base64url'),
      new TextEncoder().encode(`${header}.${claims}`)),true);
    return new Response(JSON.stringify({access_token:'synthetic-oauth-response',token_type:'Bearer'}));
  });
  assert.equal(result,'synthetic-oauth-response');assert.equal(calls,1);
  await assert.rejects(()=>googlePlayReporterAccessToken(JSON.stringify({type:'service_account',client_email:'wrong@example.com',private_key:key}),
    async()=>{throw Error('invalid credentials must not dispatch');}),/credentials_invalid/);
});
