// Checks local disposable native captures against frozen provenance. No database connection.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyInputs} from './verify-inputs.mjs';
verifyInputs();
const frozen=JSON.parse(fs.readFileSync(new URL('./inverse-catalog-delta.json',import.meta.url),'utf8'));
if(process.argv.length!==4)throw Error('EXPECTED_BEFORE_AND_AFTER_CAPTURE_PATHS');
const texts=process.argv.slice(2).map(p=>fs.readFileSync(p,'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(texts[0]),frozen.nativeProvenance.beforeSha256);
assert.equal(hash(texts[1]),frozen.nativeProvenance.afterSha256);
const captures=texts.map(s=>JSON.parse(s));
assert.equal(captures[0].label,'source586');assert.equal(captures[1].label,'source589');
for(const c of captures){assert.equal(String(c.serverVersion),'170006');assert.equal(new Set(c.rows.map(r=>r.key)).size,c.rows.length);}
const [bm,am]=captures.map(c=>new Map(c.rows.map(r=>[r.key,r.item_text])));
const delta=[...new Set([...bm.keys(),...am.keys()])].sort().filter(k=>bm.get(k)!==am.get(k)).map(key=>({key,beforeText:bm.get(key)??null,afterText:am.get(key)??null}));
assert.deepEqual(delta,frozen.delta);assert.equal(delta.length,37);
console.log('Exact native capture provenance and 37-row delta verified. No target execution.');
