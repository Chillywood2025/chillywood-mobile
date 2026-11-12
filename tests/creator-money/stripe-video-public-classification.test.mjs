import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// Execute the handler's classification function without importing Deno server.
const source=readFileSync('supabase/functions/public-creator-video-cards/index.ts','utf8');
const segment=source.slice(source.indexOf('const readOrdinaryPaidVideoIds ='),source.indexOf('const readPublishedOfficialRachiOriginalVideoIds ='));
const output=ts.transpileModule(segment+'\nexports.classify=readOrdinaryPaidVideoIds;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('exports','toText',output)(exports,value=>typeof value==='string'?value:'');
function client({nativeError=null,stripeError=null,stripe=[{videoId:'video',creatorId:'creator'}]}={}){
 const chain={select:()=>chain,eq:()=>chain,in:async()=>({data:[],error:nativeError})};
 return {from:()=>chain,rpc:async()=>({data:stripe,error:stripeError})};
}
test('public cards classify Stripe-only offers without native catalog rows',async()=>{
 assert.deepEqual([...await exports.classify(client(),[{id:'video',owner_id:'creator'}])],['video']);
 assert.equal((await exports.classify(client(),[{id:'video',owner_id:'other'}])).size,0);
});
test('public card classification failure cannot silently relabel protected source as free',async()=>{
 const rows=[{id:'video',owner_id:'creator'}];
 await assert.rejects(()=>exports.classify(client({nativeError:{message:'unavailable'}}),rows),/classification_unavailable/);
 await assert.rejects(()=>exports.classify(client({stripeError:{message:'unavailable'}}),rows),/classification_unavailable/);
 await assert.rejects(()=>exports.classify(client({stripe:null}),rows),/classification_unavailable/);
});
