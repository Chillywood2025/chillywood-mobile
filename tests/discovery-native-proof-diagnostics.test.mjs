import assert from 'node:assert/strict';
import test from 'node:test';
import {createDiscoveryProofDiagnostics,summarizeDiscoveryProofFailure} from '../scripts/lib/discovery-native-proof-diagnostics.mjs';

test('discovery diagnostics preserve primary failure independently of multiple cleanup failures',()=>{
  const output=[];const proof=createDiscoveryProofDiagnostics(value=>output.push(JSON.parse(value)));
  proof.phase('subscribe allowed home');
  proof.primary(Object.assign(new Error('sensitive primary body'),{code:'42501'}));
  proof.phase('cleanup dispose synthetic Auth user');
  proof.cleanup('dispose synthetic Auth user',{name:'AuthApiError',code:'unexpected_failure',status:500,message:'sensitive cleanup body'});
  proof.cleanup('restore local discovery configuration',{code:'57014',message:'private SQL'});
  assert.throws(()=>proof.finish(),/proof and cleanup must both pass/);
  const result=output.at(-1);
  assert.equal(result.primary.phase,'subscribe allowed home');assert.equal(result.primary.code,'42501');
  assert.equal(result.cleanup.length,2);assert.equal(result.cleanup[0].code,'unexpected_failure');
  assert.equal(result.cleanup[0].status,500);assert.equal(result.cleanup[1].code,'57014');
  assert.doesNotMatch(JSON.stringify(output),/sensitive|private SQL/);
});

test('primary-only and cleanup-only failures cannot be converted to success',()=>{
  for(const kind of ['primary','cleanup']){
    const output=[];const proof=createDiscoveryProofDiagnostics(value=>output.push(JSON.parse(value)));
    if(kind==='primary')proof.primary(new Error('failure'));else proof.cleanup('remove synthetic channel',new Error('failure'));
    assert.throws(()=>proof.finish(),/proof and cleanup must both pass/);
    assert.equal(Boolean(output.at(-1).primary),kind==='primary');assert.equal(output.at(-1).cleanup.length,kind==='cleanup'?1:0);
  }
  assert.doesNotThrow(()=>createDiscoveryProofDiagnostics(()=>undefined).finish());
});

test('error summaries expose bounded status and source locations but never payloads or identifiers',()=>{
  const result=summarizeDiscoveryProofFailure({name:'AssertionError',code:'ERR_ASSERTION',
    message:'secret-token',actual:{code:'PGRST202',status:404,message:'private response',token:'secret-token'},expected:null,
    stack:'Error: secret-token\n at file:///private/root/scripts/test-discovery-realtime-delivery.mjs:64:5'});
  assert.equal(result.responseCode,'PGRST202');assert.equal(result.responseStatus,404);assert.equal(result.expected,null);
  assert.deepEqual(result.locations,['64:5']);assert.doesNotMatch(JSON.stringify(result),/secret-token|private response|private\/root/);
  assert.equal(summarizeDiscoveryProofFailure({actual:'active',expected:'pending'}).actual,'active');
  assert.equal(summarizeDiscoveryProofFailure({actual:'unknown-private-value'}).actual,undefined);
  assert.throws(()=>createDiscoveryProofDiagnostics(()=>undefined).phase('user ac520000-0000-4000-8000-000000000001'),assert.AssertionError);
});
