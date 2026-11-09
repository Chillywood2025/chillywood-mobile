import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// Parser projection of a genuine allocator/current-access/range-handler result.
// Direct handler Responses have no transport URL; only that provenance field is
// explicitly modeled as the exact request URL. All headers/grant/quote are real
// outputs of this disposable SQL fixture, not manufactured response fields.
export function verifyNativePlaybackProjection({response,requestUrl,quote,grantId,root,ts,loadShared}) {
 const observedAt=Date.now();
 const compile=(file,bindings)=>{const result={};new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(result,name=>{assert.ok(Object.hasOwn(bindings,name),'unmodeled parser dependency '+name);return bindings[name];});return result;};
 const quoteContract=compile('_lib/nativeStoreSandboxQuote.ts',{'../supabase/functions/_shared/native-store-sandbox-terminal-contract-v1':loadShared('native-store-sandbox-terminal-contract-v1.ts'),'../supabase/functions/_shared/native-store-sandbox-dispatch-contract-v1':loadShared('native-store-sandbox-dispatch-contract-v1.ts'),'@react-native-async-storage/async-storage':{},'react-native-get-random-values':{},'./accountBoundSupabaseMutation':{},'./accountSessionAuthority':{},'./supabase':{}});
 const api=compile('_lib/nativeStorePaidVideoPlayback.ts',{'react-native':{Platform:{OS:'ios'}},'./accountBoundSupabaseMutation':{},'./accountSessionAuthority':{},'./supabase':{SUPABASE_URL:new URL(requestUrl).origin,SUPABASE_ANON_KEY:'synthetic-unused'},'./isolatedTestStoreContract':compile('_lib/isolatedTestStoreContract.ts',{}),'./nativeStoreSandboxQuote':quoteContract});
 const selection={resourceId:quote.resourceId,grantId,quote};
 assert.equal(quoteContract.validNativeSandboxQuote(quote),true);
 const projected=response.clone();assert.equal(projected.url,'');Object.defineProperty(projected,'url',{value:requestUrl});
 const deadline=api.parseNativeStorePaidVideoPlaybackProbe(projected,selection,requestUrl,observedAt);
 assert.equal(deadline,Number(response.headers.get('x-chillywood-authorized-until-ms')));
 assert.ok(api.nativeStorePaidVideoPlaybackSelectionKey(selection).includes(quote.quoteDigest));
 assert.throws(()=>api.parseNativeStorePaidVideoPlaybackProbe(projected,{...selection,grantId:'scv1_grant_00000000-0000-4000-8000-000000000000'},requestUrl,observedAt));
 void projected.body?.cancel();
 return 2;
}
