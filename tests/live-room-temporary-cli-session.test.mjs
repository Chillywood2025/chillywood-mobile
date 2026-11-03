import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createTemporarySession,runTemporarySession,cleanupTemporarySession,trustedProxyEnvironment,requireNodeProxySupport,verifyPlatformCA,PLATFORM_CA,helperFailureCode} from '../scripts/live-room-temporary-cli-session.mjs';
import {PROJECT,VERSIONS} from '../scripts/live-room-exact-deploy.mjs';

// All tokens here are synthetic strings. No CLI login, keyring, HTTP, or real
// credential access occurs. Every file is created in this test's fresh HOME.
const binding={source:'1'.repeat(40),tree:'2'.repeat(40)};
const syntheticToken='sbp_'+'0'.repeat(40);
const context={currentPostgres:true,currentReadOnly:false,sessionPostgres:true,sessionReadOnly:false,sessionAdmin:false,transactionReadOnly:true};
function fixture(t,{token=true}={}){
  const session=createTemporarySession(binding);t.after(()=>fs.rmSync(session.home,{recursive:true,force:true}));
  const tokenPath=path.join(session.home,'.supabase/access-token');
  if(token)fs.writeFileSync(tokenPath,syntheticToken+'\n',{mode:0o600,flag:'wx'});
  return {...session,tokenPath,receipt:()=>JSON.parse(fs.readFileSync(path.join(session.home,'room-session.json'),'utf8'))};
}
const helperResult=(status='plan_ready')=>({project:PROJECT,...binding,status,wrote:['applied_verified','apply_unconfirmed'].includes(status),versions:VERSIONS,historySha256:'3'.repeat(64),context});
const proxyFixture=()=>Object.fromEntries([...['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'].map(k=>[k,'http://127.0.0.1:12345']),...['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','REQUESTS_CA_BUNDLE'].map(k=>[k,PLATFORM_CA])]);
const options=s=>({session:s.session,source:s.source,checkSource:()=>binding,launchEnvironment:proxyFixture(),nodeProxySupported:true,verifyTrust:()=>{}});

test('fresh private preparation records only one nonsecret identity before any token exists',t=>{
  const s=fixture(t,{token:false});assert.equal(fs.existsSync(s.tokenPath),false);
  assert.equal(fs.statSync(s.home).mode&0o777,0o700);assert.equal(fs.statSync(path.dirname(s.tokenPath)).mode&0o777,0o700);
  assert.equal(fs.statSync(path.join(s.home,'room-session.json')).mode&0o777,0o600);
  assert.equal(s.receipt().tokenAbsentAtPrepare,true);assert.equal(s.receipt().cliVersion,'2.109.1');
  assert.match(s.tokenName,/^chillywood-room-access-\d{8}-once-[A-Za-z0-9]{6}$/u);
  assert.equal(JSON.stringify(s.receipt()).includes(syntheticToken),false);
});

test('only the fresh token enters minimal child environment, never argv or receipt/output',async t=>{
  const s=fixture(t);let called=0;
  const result=await runTemporarySession({...options(s),runChild:async(file,args,config)=>{
    called++;assert.equal(file,process.execPath);assert.equal(config.env.SUPABASE_ACCESS_TOKEN,syntheticToken);
    assert.deepEqual(Object.keys(config.env).sort(),['HOME','HTTPS_PROXY','HTTP_PROXY','LANG','LC_ALL','NODE_EXTRA_CA_CERTS','PATH','SSL_CERT_FILE','SUPABASE_ACCESS_TOKEN']);
    assert.equal(args[0],'--use-env-proxy');assert.equal(config.env.NO_PROXY,undefined);assert.equal(config.env.ALL_PROXY,undefined);
    assert.equal(config.env.HOME,s.home);assert.equal(JSON.stringify(args).includes(syntheticToken),false);assert.equal(args.includes('--apply'),false);
    assert.equal(config.env.SUPABASE_API_URL,undefined);assert.equal(config.env.NODE_OPTIONS,undefined);
    return {exitCode:0,stdout:JSON.stringify(helperResult())};
  }});
  assert.equal(called,1);assert.equal(result.status,'plan_ready');assert.equal(result.cleanupRequired,true);
  assert.equal(JSON.stringify(result).includes(syntheticToken),false);assert.equal(JSON.stringify(s.receipt()).includes(syntheticToken),false);
});

test('source mismatch blocks before reading or launching; arbitrary paths and receipt identities are refused',async t=>{
  const s=fixture(t);let calls=0;const runChild=async()=>{calls++;return {};};
  await assert.rejects(runTemporarySession({...options(s),checkSource:()=>{throw Error('SOURCE_HEAD_MISMATCH');},runChild}),/SOURCE_HEAD_MISMATCH/);
  for(const session of ['/tmp/unrelated','../unrelated','chillywood-room-deploy-abcdef/../other'])await assert.rejects(runTemporarySession({...options(s),session,runChild}),/SESSION_ID_INVALID/);
  await assert.rejects(runTemporarySession({...options(s),source:'4'.repeat(40),runChild}),/SESSION_BINDING_INVALID/);
  const receipt=s.receipt();receipt.tokenAbsentAtPrepare=false;fs.writeFileSync(path.join(s.home,'room-session.json'),JSON.stringify(receipt));
  await assert.rejects(runTemporarySession({...options(s),runChild}),/SESSION_BINDING_INVALID/);assert.equal(calls,0);
});

test('unsafe token modes, symlinks, hardlinks, oversized and malformed files are refused',async t=>{
  for(const mode of [0o644,0o400,0o660]){
    const s=fixture(t);fs.chmodSync(s.tokenPath,mode);
    await assert.rejects(runTemporarySession({...options(s),runChild:async()=>assert.fail('must not spawn')}),/SESSION_OBJECT_PERMISSIONS_INVALID/);
  }
  const linked=fixture(t);fs.linkSync(linked.tokenPath,path.join(linked.home,'another-link'));
  await assert.rejects(runTemporarySession({...options(linked),runChild:async()=>assert.fail('must not spawn')}),/SESSION_HARDLINK_FORBIDDEN/);
  const symbolic=fixture(t,{token:false});const target=path.join(symbolic.home,'synthetic-file');fs.writeFileSync(target,syntheticToken,{mode:0o600});fs.symlinkSync(target,symbolic.tokenPath);
  await assert.rejects(runTemporarySession({...options(symbolic),runChild:async()=>assert.fail('must not spawn')}));
  for(const contents of ['x'.repeat(129),'not-a-token']){
    const s=fixture(t);fs.writeFileSync(s.tokenPath,contents);
    await assert.rejects(runTemporarySession({...options(s),runChild:async()=>assert.fail('must not spawn')}),/SESSION_FILE_SIZE_INVALID|FRESH_CLI_TOKEN_FORMAT_INVALID/);
  }
});

test('replaced or permissive HOME/config directories cannot redirect the adapter',async t=>{
  const s=fixture(t);fs.chmodSync(s.home,0o755);
  await assert.rejects(runTemporarySession({...options(s),runChild:async()=>assert.fail('must not spawn')}),/SESSION_OBJECT_PERMISSIONS_INVALID/);
  const r=fixture(t);fs.renameSync(path.join(r.home,'.supabase'),path.join(r.home,'old-config'));fs.mkdirSync(path.join(r.home,'.supabase'),{mode:0o700});
  await assert.rejects(runTemporarySession({...options(r),runChild:async()=>assert.fail('must not spawn')}),/SESSION_DIRECTORY_REPLACED/);
  const y=fixture(t);fs.renameSync(path.join(y.home,'.supabase'),path.join(y.home,'old-config'));fs.symlinkSync(path.join(y.home,'old-config'),path.join(y.home,'.supabase'));
  await assert.rejects(runTemporarySession({...options(y),runChild:async()=>assert.fail('must not spawn')}));
});

test('apply receipt precedes spawn; interrupted/uncertain output cannot trigger an automatic retry',async t=>{
  const s=fixture(t);let calls=0;
  const result=await runTemporarySession({...options(s),apply:true,runChild:async()=>{
    calls++;assert.equal(s.receipt().applyAttempted,true);assert.equal(s.receipt().lastRun.status,'started');
    throw Error(syntheticToken);
  }});
  assert.equal(result.status,'apply_unconfirmed');assert.equal(JSON.stringify(result).includes(syntheticToken),false);
  await assert.rejects(runTemporarySession({...options(s),apply:true,runChild:async()=>{calls++;return {};}}),/PREVIOUS_APPLY_REQUIRES_RECONCILIATION/);assert.equal(calls,1);
  const plan=await runTemporarySession({...options(s),runChild:async()=>({exitCode:0,stdout:JSON.stringify(helperResult('already_applied_verified'))})});
  assert.equal(plan.status,'already_applied_verified');assert.equal(s.receipt().applyAttempted,true);
});

test('unknown child fields, token-bearing output, wrong source, and failed exit cannot report success',async t=>{
  const cases=[syntheticToken,JSON.stringify({...helperResult(),token:syntheticToken}),JSON.stringify({...helperResult(),source:'4'.repeat(40)})];
  for(const stdout of cases){const s=fixture(t);const result=await runTemporarySession({...options(s),runChild:async()=>({exitCode:0,stdout})});assert.equal(result.status,'plan_failed');assert.equal(JSON.stringify(result).includes(syntheticToken),false);}
  const s=fixture(t);assert.equal((await runTemporarySession({...options(s),runChild:async()=>({exitCode:1,stdout:JSON.stringify(helperResult())})})).status,'plan_failed');
});

test('a second concurrent apply loses the exclusive attempt marker',async t=>{
  const s=fixture(t);let release,started;const entered=new Promise(resolve=>{started=resolve;});
  const first=runTemporarySession({...options(s),apply:true,runChild:async()=>{started();await new Promise(resolve=>{release=resolve;});return {exitCode:0,stdout:JSON.stringify(helperResult('applied_verified'))};}});
  await entered;
  await assert.rejects(runTemporarySession({...options(s),apply:true,runChild:async()=>assert.fail('duplicate apply')}),/PREVIOUS_APPLY_REQUIRES_RECONCILIATION/);
  release();assert.equal((await first).status,'applied_verified');
});

test('a replaced token file is neither read for reuse nor removed by cleanup',async t=>{
  const s=fixture(t);await runTemporarySession({...options(s),runChild:async()=>({exitCode:0,stdout:JSON.stringify(helperResult())})});
  fs.renameSync(s.tokenPath,path.join(s.home,'original-synthetic-file'));fs.writeFileSync(s.tokenPath,'sbp_'+'f'.repeat(40),{mode:0o600,flag:'wx'});
  await assert.rejects(runTemporarySession({...options(s),runChild:async()=>assert.fail('must not spawn')}),/SESSION_TOKEN_FILE_REPLACED/);
  assert.throws(()=>cleanupTemporarySession({session:s.session,source:s.source}),/SESSION_TOKEN_FILE_REPLACED/);assert.equal(fs.existsSync(s.tokenPath),true);
});

test('cleanup removes only the validated new local file and preserves revocation identity',async t=>{
  const s=fixture(t),unrelated=path.join(s.home,'unrelated-test-file');fs.writeFileSync(unrelated,'preserve',{mode:0o600});
  const result=cleanupTemporarySession({session:s.session,source:s.source});
  assert.equal(result.status,'local_token_removed');assert.equal(result.tokenName,s.tokenName);assert.equal(result.providerRevocation,'not_performed');assert.equal(result.providerRevocationRequired,true);
  assert.equal(fs.existsSync(s.tokenPath),false);assert.equal(fs.readFileSync(unrelated,'utf8'),'preserve');assert.equal(s.receipt().cleaned,true);
  assert.equal(cleanupTemporarySession({session:s.session,source:s.source}).status,'local_token_absent');
  await assert.rejects(runTemporarySession({...options(s),runChild:async()=>assert.fail('must not spawn')}),/SESSION_SOURCE_OR_STATE_INVALID/);
});

test('CLI rejects token/path/host overrides without printing their values',()=>{
  try{execFileSync(process.execPath,['scripts/live-room-temporary-cli-session.mjs','run','--token',syntheticToken],{encoding:'utf8',stdio:'pipe'});assert.fail('must reject');}
  catch(error){assert.equal(String(error.stderr).includes(syntheticToken),false);assert.match(String(error.stderr),/ARGUMENT_INVALID/);assert.equal(String(error.stdout),'');}
});

test('transport accepts only current matching platform proxy aliases and pinned CA aliases',()=>{
  const input={...proxyFixture(),ALL_PROXY:'socks5h://attacker.invalid:1',NO_PROXY:'*',SUPABASE_ACCESS_TOKEN:syntheticToken};
  let verified=0;const result=trustedProxyEnvironment(input,()=>verified++);
  assert.equal(verified,1);assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(Object.keys(result).sort(),['HTTPS_PROXY','HTTP_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']);
  input.HTTPS_PROXY='http://127.0.0.1:54321';assert.equal(result.HTTPS_PROXY,'http://127.0.0.1:12345');
  assert.throws(()=>trustedProxyEnvironment(input,()=>{}),/ALIASES_INVALID/);
  for(const value of ['http://attacker.invalid:12345','https://127.0.0.1:12345','http://user:secret@127.0.0.1:12345','http://127.0.0.1:12345/path','http://127.0.0.1:12345?x','http://127.0.0.1:12345#x','http://127.0.0.1:65536','http://127.0.0.1:0','http://127.0.0.1:0123','http://127.1:12345']){
    const env=proxyFixture();for(const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'])env[key]=value;
    assert.throws(()=>trustedProxyEnvironment(env,()=>{}),/ROUTE_INVALID/);
  }
  for(const key of ['NODE_OPTIONS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_DIR','CURL_CA_BUNDLE','SUPABASE_API_URL','SUPABASE_API_HOST','SUPABASE_CLI_BINARY_OVERRIDE'])assert.throws(()=>trustedProxyEnvironment({...proxyFixture(),[key]:'attacker'},()=>{}),/OVERRIDE_FORBIDDEN/);
  for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','REQUESTS_CA_BUNDLE'])assert.throws(()=>trustedProxyEnvironment({...proxyFixture(),[key]:'/tmp/attacker.crt'},()=>{}),/CA_ALIASES_INVALID/);
  assert.throws(()=>trustedProxyEnvironment(proxyFixture(),()=>{throw Error('PLATFORM_CA_HASH_INVALID');}),/HASH_INVALID/);
});

test('unsupported Node or altered transport fails before source, token access, or child launch',async()=>{
  const checkSource=()=>assert.fail('must not inspect source or credentials');
  await assert.rejects(runTemporarySession({session:'invalid',source:binding.source,checkSource,nodeProxySupported:false}),/NODE_ENV_PROXY_UNSUPPORTED/);
  await assert.rejects(runTemporarySession({session:'invalid',source:binding.source,checkSource,nodeProxySupported:true,launchEnvironment:{}}),/ALIASES_INVALID/);
  assert.throws(()=>requireNodeProxySupport(false),/NODE_ENV_PROXY_UNSUPPORTED/);requireNodeProxySupport(true);
});

test('platform CA validation rejects writable mounts, replacement ancestry and changed artifact',()=>{
  const goodStat={uid:65534,mode:0o755,isDirectory:()=>true,isSymbolicLink:()=>false};
  const mock=()=>({lstatSync:()=>goodStat,readFileSync:(p)=>p==='/proc/self/mountinfo'?'1 0 0:1 / /usr ro - overlay overlay ro':'bad',openSync:()=>1,fstatSync:()=>({uid:65534,mode:0o644,size:1310,isFile:()=>true}),closeSync:()=>{}});
  assert.throws(()=>verifyPlatformCA(mock()),/HASH_INVALID/);
  assert.throws(()=>verifyPlatformCA({...mock(),lstatSync:()=>({...goodStat,uid:1000})}),/ANCESTRY_INVALID/);
  assert.throws(()=>verifyPlatformCA({...mock(),lstatSync:()=>({...goodStat,isSymbolicLink:()=>true})}),/ANCESTRY_INVALID/);
  assert.throws(()=>verifyPlatformCA({...mock(),readFileSync:()=> '1 0 0:1 / /usr rw - overlay overlay rw'}),/MOUNT_INVALID/);
  assert.throws(()=>verifyPlatformCA({...mock(),readFileSync:()=> '1 0 0:1 / /usr ro - overlay overlay ro\n2 1 0:2 / /usr/local ro - overlay overlay ro'}),/MOUNT_INVALID/);
  assert.throws(()=>verifyPlatformCA({...mock(),fstatSync:()=>({uid:1000,mode:0o644,size:1310,isFile:()=>true})}),/FILE_INVALID/);
});

test('only exact finite helper failure JSON survives; arbitrary uppercase or secret-bearing stderr never escapes',async t=>{
  const safe=JSON.stringify({status:'blocked',code:'MANAGEMENT_HTTP_AUTH_REJECTED'})+'\n';
  assert.equal(helperFailureCode(safe),'MANAGEMENT_HTTP_AUTH_REJECTED');
  for(const stderr of [undefined,'',syntheticToken,'X'.repeat(513),JSON.stringify({status:'blocked',code:'UNRECOGNIZED_UPPERCASE_SECRET'})+'\n',JSON.stringify({status:'blocked',code:syntheticToken})+'\n',JSON.stringify({status:'blocked',code:'MANAGEMENT_HTTP_AUTH_REJECTED',token:syntheticToken})+'\n',safe+syntheticToken,'{"status":"blocked","code":"'+syntheticToken+'","code":"MANAGEMENT_HTTP_AUTH_REJECTED"}\n']){
    assert.equal(helperFailureCode(stderr),'HELPER_DIAGNOSTIC_UNAVAILABLE');
    const s=fixture(t);const result=await runTemporarySession({...options(s),runChild:async()=>({exitCode:1,stdout:'',stderr})});
    assert.equal(result.status,'plan_failed');assert.equal(result.failureCode,'HELPER_DIAGNOSTIC_UNAVAILABLE');assert.equal(JSON.stringify(result).includes(syntheticToken),false);
  }
  const s=fixture(t);const result=await runTemporarySession({...options(s),runChild:async()=>({exitCode:1,stdout:'',stderr:safe})});
  assert.equal(result.status,'plan_failed');assert.equal(result.failureCode,'MANAGEMENT_HTTP_AUTH_REJECTED');
  const contextual=JSON.stringify({status:'blocked',code:'PRODUCTION_HOLDS_MISMATCH',context:{...context,currentPostgres:false,currentReadOnly:true}})+'\n';
  const c=fixture(t);const actual=await runTemporarySession({...options(c),runChild:async()=>({exitCode:1,stdout:'',stderr:contextual})});
  assert.equal(actual.failureCode,'PRODUCTION_HOLDS_MISMATCH');assert.equal(actual.context.currentReadOnly,true);
  for(const changed of [{...context,token:syntheticToken},{...context,currentPostgres:'true'},{...context,currentPostgres:false},{...context,currentReadOnly:true},{...context,sessionPostgres:false}]){
    assert.equal(helperFailureCode(JSON.stringify({status:'blocked',code:'PRODUCTION_HOLDS_MISMATCH',context:changed})+'\n'),'HELPER_DIAGNOSTIC_UNAVAILABLE');
    const d=fixture(t);const invalid=await runTemporarySession({...options(d),runChild:async()=>({exitCode:0,stdout:JSON.stringify({...helperResult(),context:changed})})});assert.equal(invalid.status,'plan_failed');
  }
});
