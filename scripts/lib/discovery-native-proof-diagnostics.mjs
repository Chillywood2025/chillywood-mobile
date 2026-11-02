import assert from 'node:assert/strict';

// Error messages/actual objects can contain tokens, SQL or response bodies.
// Keep stage, class, bounded status/code and source positions instead.
export function summarizeDiscoveryProofFailure(error) {
  const names=new Set(['Error','AssertionError','TypeError','AuthApiError','AuthRetryableFetchError','AbortError','TimeoutError']);
  const code=value=>typeof value==='string'&&/^(?:[0-9A-Z]{5}|PGRST\d{3}|ERR_[A-Z_]{1,48}|unexpected_failure|request_timeout|over_request_rate_limit)$/.test(value)?value:undefined;
  const status=value=>Number.isInteger(value)&&value>=100&&value<=599?value:undefined;
  const states=new Set(['pending','active','removed','blocked','declined','SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED','processed','rejected']);
  const primitive=value=>value===null||typeof value==='boolean'||typeof value==='number'||states.has(value)?value:undefined;
  return {
    name:names.has(error?.name)?error.name:'Error',code:code(error?.code),status:status(error?.status),
    responseCode:code(error?.actual?.code),responseStatus:status(error?.actual?.status),
    actual:primitive(error?.actual),expected:primitive(error?.expected),
    locations:[...String(error?.stack??'').matchAll(/test-discovery-realtime-delivery\.mjs:(\d+):(\d+)/g)]
      .slice(0,4).map(match=>`${match[1]}:${match[2]}`),
  };
}

export function createDiscoveryProofDiagnostics(log=console.log) {
  let current='initial setup';
  let primary=null;
  const cleanup=[];
  const label=value=>{
    assert.match(value,/^[A-Za-z0-9 :()_-]{1,100}$/);
    assert.doesNotMatch(value,/[0-9a-f]{8}-[0-9a-f]{4}/i,'diagnostic stages must not contain identifiers');
    return value;
  };
  return {
    phase(value){current=label(value);log(JSON.stringify({proof:'native discovery phase',phase:current}));},
    primary(error){primary={phase:current,...summarizeDiscoveryProofFailure(error)};},
    cleanup(operation,error){cleanup.push({operation:label(operation),...summarizeDiscoveryProofFailure(error)});},
    finish(){
      if(primary||cleanup.length){
        log(JSON.stringify({proof:'native discovery failure',primary,cleanup}));
        throw new Error('native discovery proof and cleanup must both pass; see sanitized failure summary');
      }
    },
  };
}
