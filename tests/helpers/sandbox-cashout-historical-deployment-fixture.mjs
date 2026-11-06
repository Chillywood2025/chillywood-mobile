// Test-only historical closure. This commit recorded the existing reviewed
// dormant schema baseline; it does not qualify today's changed Edge source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CLOSURE,loadBundle} from '../../scripts/sandbox-cashout-exact-deploy.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=path.join(root,'tests/fixtures/sandbox-cashout-deployment-20261104');
const inventory=JSON.parse(fs.readFileSync(path.join(fixture,'closure.json'),'utf8'));
export const HISTORICAL_CASHOUT_SOURCE=inventory.source;
assert.equal(inventory.schema,1);
assert.deepEqual(inventory.files.map(file=>file.path).sort(),[...CLOSURE].sort());
// These successors require the sandbox cashout predecessor that historical
// pre-deployment replays intentionally omit. Full-chain tests still apply them.
export const POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS=Object.freeze([
 '20261106001341_automatic_premium_commerce_admission.sql',
 '20261106001353_automatic_creator_eligibility_refresh.sql',
 '20261106001355_creator_declaration_retention_accounting.sql',
 '20261106001357_creator_provider_observation_queue.sql',
 '20261106002410_automatic_commerce_lock_order.sql',
 '20261106005532_isolated_sandbox_creator_capability.sql',
 '20261106005534_automatic_sandbox_tip_auction_authority.sql',
 '20261106013158_ordinary_native_dispatch_authority.sql',
 '20261106013309_sandbox_paid_access_mode_authority.sql',
 '20261106020217_preserve_purchased_access_delivery.sql',
 '20261106035132_reviewed_merch_publication_mode.sql',
]);

export function readHistoricalCashoutSource(file){
 const entry=inventory.files.find(entry=>entry.path===file);
 assert.ok(entry,'historical fixture reads only the exact deployment closure');
 // Unchanged tracked files are reused only with their original digest. The
 // superseded engine is an immutable fixture, not a Git-history dependency.
 const bytes=fs.readFileSync(entry.snapshot?path.join(fixture,entry.snapshot):path.join(root,file),'utf8');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,`historical source digest: ${file}`);
 return bytes;
}

export function materializeHistoricalCashoutClosure(directory){
 for(const file of CLOSURE){
  fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});
  fs.writeFileSync(path.join(directory,file),readHistoricalCashoutSource(file));
 }
}

export function loadHistoricalCashoutBundle(){
 // The real production loader validates every original source digest. Never
 // replace hashes, qualification receipts or the current working-tree bytes.
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'historical-cashout-closure-'));
 try{
  materializeHistoricalCashoutClosure(directory);
  return loadBundle(directory);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
