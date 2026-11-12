// Source-only composition. No database executor, credentials or activation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const marker='-- Explicit draft stop:';
const stop="do $$begin raise exception 'native_apple_ownership_candidate_incomplete';end $$;";
export function appleSandboxOwnershipSQL(){
 const ownership=fs.readFileSync(new URL('./ownership.sql',import.meta.url),'utf8');
 const recorder=fs.readFileSync(new URL('./recorder.sql',import.meta.url),'utf8');
 assert.equal(ownership.split(marker).length,2);
 assert.equal(ownership.split(stop).length,2);
 assert.match(recorder,/create function public\.native_apple_sandbox_handover_v1\(/u);
 // Keep the standalone ownership fragment fail-closed. Only this complete
 // composition joins the recorder and fences in the same transaction.
 return ownership.replace(marker,()=>recorder+'\n'+marker).replace(stop,'');
}
