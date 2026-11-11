import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign,X509Certificate} from 'node:crypto';
import ts from 'typescript';

// Opt-in, real pinned libraries, no provider network or service credentials.
// Install the three exact production pins in a disposable directory with
// --ignore-scripts; point this variable at that directory's node_modules.
const root=process.env.NATIVE_PRODUCTION_CRYPTO_MODULE_ROOT;
test('real pinned Apple crypto adapters with disposable synthetic material',{skip:!root},async t=>{
 const require=createRequire(join(root,'fixture.cjs'));
 for(const [name,version] of [['node-app-attest','1.0.1'],['cbor','10.0.11'],['@apple/app-store-server-library','3.1.0']])
  assert.equal(JSON.parse(readFileSync(join(root,name,'package.json'))).version,version);
 const attest=await import(pathToFileURL(require.resolve('node-app-attest')).href);
 const cbor=require('cbor'),apple=require('@apple/app-store-server-library');
 const load=(path,imports={})=>{
  const module={exports:{}};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','module','exports',code)(name=>imports[name]??require(name),module,module.exports);
  return module.exports;
 };
 const facts=load('supabase/functions/_shared/native-production-store-verification.ts');
 const adapter=load('supabase/functions/_shared/native-production-apple-verification.ts',{
  'npm:cbor@10.0.11':cbor,'npm:node-app-attest@1.0.1':attest,
  'npm:@apple/app-store-server-library@3.1.0':apple,'./native-production-store-verification.ts':facts});
 await t.test('actual assertion signature, exact payload/app/key and replay counter',()=>{
  const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
  const applicationId='synthetic.app',teamId='SYNTHETIC',witness=JSON.stringify({dispatchId:'fixture-dispatch',challenge:'a'.repeat(64)});
  const hash=value=>createHash('sha256').update(value).digest();
  const assertion=count=>{
   const auth=Buffer.alloc(37);hash(`${teamId}.${applicationId}`).copy(auth);auth.writeUInt32BE(count,33);
   const nonce=hash(Buffer.concat([auth,hash(witness)]));
   return cbor.encode({signature:sign('sha256',nonce,keys.privateKey),authenticatorData:auth}).toString('base64');
  };
  const input={assertionBase64:assertion(1),witness,publicKey,previousCounter:0,applicationId,teamId};
  assert.equal(adapter.verifyProductionAppleAssertion(input),1);
  assert.equal(adapter.verifyProductionAppleAssertion({...input,assertionBase64:assertion(2),previousCounter:1}),2);
  for(const patch of [{witness:witness+' '},{applicationId:'other.app'},{teamId:'OTHER'},{previousCounter:1},
   {previousCounter:-1},{previousCounter:4294967295},{assertionBase64:assertion(0)},
   {publicKey:generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'})}])
   assert.throws(()=>adapter.verifyProductionAppleAssertion({...input,...patch}));
  // The pinned library reads a signed int32. High unsigned counters fail closed;
  // this fixture does not claim the entire uint32 range interoperates.
  assert.throws(()=>adapter.verifyProductionAppleAssertion({...input,assertionBase64:assertion(2147483648)}));
 });
 await t.test('real Store JWS chain/signature and transaction normalization, offline synthetic root only',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'native-apple-synthetic-'));
  const openssl=(...args)=>execFileSync('openssl',args,{cwd:dir,stdio:'pipe',timeout:10000});
  try{
   for(const name of ['root','intermediate','leaf'])openssl('ecparam','-name','prime256v1','-genkey','-noout','-out',`${name}.key`);
   openssl('req','-new','-x509','-key','root.key','-subj','/CN=Synthetic Test Root','-days','2','-addext','basicConstraints=critical,CA:TRUE','-out','root.pem');
   for(const [name,issuer,oid,ca] of [['intermediate','root','1.2.840.113635.100.6.2.1',true],['leaf','intermediate','1.2.840.113635.100.6.11.1',false]]){
    writeFileSync(join(dir,`${name}.ext`),`basicConstraints=critical,CA:${ca?'TRUE':'FALSE'}\n${oid}=DER:05:00\n`);
    openssl('req','-new','-key',`${name}.key`,'-subj',`/CN=Synthetic ${name}`,'-out',`${name}.csr`);
    openssl('x509','-req','-in',`${name}.csr`,'-CA',`${issuer}.pem`,'-CAkey',`${issuer}.key`,'-CAcreateserial','-days','2','-extfile',`${name}.ext`,'-out',`${name}.pem`);
   }
   const cert=name=>new X509Certificate(readFileSync(join(dir,`${name}.pem`)));
   const roots=[cert('root').raw];
   const context={provider:'app_store',applicationId:'synthetic.app',appleAppId:123,buyerId:'synthetic-buyer',productId:'video',transactionId:'123456'};
   const payload={environment:'Production',bundleId:context.applicationId,appAppleId:123,transactionId:context.transactionId,
    originalTransactionId:'123450',productId:'video',quantity:1,currency:'USD',inAppOwnershipType:'PURCHASED',
    appAccountToken:context.buyerId,type:'Consumable',price:1990,purchaseDate:Date.now(),signedDate:Date.now()};
   const jwt=(data=payload)=>{
    const header=Buffer.from(JSON.stringify({alg:'ES256',x5c:['leaf','intermediate','root'].map(n=>cert(n).raw.toString('base64'))})).toString('base64url');
    const body=Buffer.from(JSON.stringify(data)).toString('base64url'),message=`${header}.${body}`;
    return `${message}.${sign('sha256',Buffer.from(message),{key:readFileSync(join(dir,'leaf.key')),dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
   };
   const verifier=new apple.SignedDataVerifier(roots,false,apple.Environment.PRODUCTION,context.applicationId,123);
   assert.equal(facts.appleTransactionFacts(await verifier.verifyAndDecodeTransaction(jwt()),context).grossMinor,199);
   for(const change of [{environment:'Sandbox'},{bundleId:'other.app'}])await assert.rejects(()=>verifier.verifyAndDecodeTransaction(jwt({...payload,...change})));
   const token=jwt(),parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({...payload,price:1})).toString('base64url');
   await assert.rejects(()=>verifier.verifyAndDecodeTransaction(parts.join('.')));
   await assert.rejects(()=>new apple.SignedDataVerifier([],false,apple.Environment.PRODUCTION,context.applicationId,123).verifyAndDecodeTransaction(token));
   const badOwner=await verifier.verifyAndDecodeTransaction(jwt({...payload,appAccountToken:'other-buyer'}));
   assert.throws(()=>facts.appleTransactionFacts(badOwner,context));
   // Production enables online checks. This synthetic chain has no OCSP URI:
   // rejection occurs before any network request, not a mocked online success.
   await assert.rejects(()=>new apple.SignedDataVerifier(roots,true,apple.Environment.PRODUCTION,context.applicationId,123).verifyAndDecodeTransaction(token));
   const fakeEnrollment=cbor.encode({fmt:'apple-appattest',attStmt:{x5c:[cert('leaf').raw,cert('intermediate').raw],receipt:Buffer.from('synthetic')},authData:Buffer.alloc(128)});
   assert.throws(()=>adapter.verifyProductionAppleEnrollment({attestationBase64:fakeEnrollment.toString('base64'),challenge:'a'.repeat(64),keyId:'synthetic',applicationId:context.applicationId,teamId:'SYNTHETIC',nowMs:Date.now()}));
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
