import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

export const BRAND_NATIVE_QUIET_DEADLINE_MS=15000;
// Readiness only, outside measured statements. Observe every other backend,
// including idle clients/background workers; never exclude or terminate one.
export async function waitForBrandNativeQuiet({readOtherSessions,onObservation=()=>{},now=()=>performance.now(),sleep=delay}){
 const started=now();let consecutiveZero=0;const observations=[];
 while(true){
  const remainingMs=Math.floor(BRAND_NATIVE_QUIET_DEADLINE_MS-(now()-started));
  assert.ok(remainingMs>0,'fixture did not become quiet within the fixed 15-second readiness deadline');
  const sessions=await readOtherSessions(remainingMs);
  assert.ok(Array.isArray(sessions),'readiness must return all other fixture sessions');
  const observation={elapsedMs:now()-started,sessions};observations.push(observation);onObservation(observation);
  assert.ok(now()-started<BRAND_NATIVE_QUIET_DEADLINE_MS,'readiness query or diagnostics exceeded the fixed overall deadline');
  consecutiveZero=sessions.length===0?consecutiveZero+1:0;
  if(consecutiveZero===2)return {elapsedMs:now()-started,observations};
  await sleep(Math.min(100,BRAND_NATIVE_QUIET_DEADLINE_MS-(now()-started)));
 }
}
