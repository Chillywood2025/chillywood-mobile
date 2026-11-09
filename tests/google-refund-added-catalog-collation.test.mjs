import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {addedCatalogHashSQL,invariantsHashSQL,dataHashSQL,loadBundle} from '../scripts/google-refund-tax-observer-exact-deploy.mjs';
import {canonicalArrayTextSQL} from '../scripts/google-refund-canonical-array.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const source=fs.readFileSync(new URL('./fixtures/google-refund-added-catalog-source.json',import.meta.url),'utf8').trimEnd();
const expected='10bffb46a67a595be1e04869b5a73b438a1b33b158d1c59ad8e5a5774e9a7054';

test('only source-derived added catalog uses explicit C; proven baseline/data SQL remain byte-identical',()=>{
 assert.equal(hash(source),expected);
 assert.equal(loadBundle().manifest.addedCatalogSha256,expected);
 assert.match(addedCatalogHashSQL,/order by item::text collate "C"/);
 assert.equal(hash(invariantsHashSQL),'e3c97668434652f8412f0b239f26aa952b2025e77f5c5264eec0079303ae3a4a');
 assert.equal(hash(dataHashSQL),'63a51270083f4b719ada780cfa137898c243fd445c6bf8f303882e4b4ee3ec57');
});

test('source19-row C serialization is stable despite Node-ICU-ordered input; ordering mutant fails',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create table source_rows(item jsonb)');
  await db.query('insert into source_rows select value from jsonb_array_elements($1::jsonb)',[source]);
  const {rows}=await db.query('select item::text as text from source_rows order by item::text collate "C"');
  assert.equal(rows.length,19);
  const strings=rows.map(r=>r.text);assert.equal(hash('['+strings.join(', ')+']'),expected);
  const collator=new Intl.Collator('en-US');const icu=[...strings].sort((a,b)=>collator.compare(a,b)||Buffer.compare(Buffer.from(a),Buffer.from(b)));
  // This exact order was independently confirmed by target SELECT of source literals,
  // not adopted from installed target objects (those rolled back and remain absent).
  assert.equal(hash('['+icu.join(', ')+']'),'ff63511b00b65336220effd3aaafc9a2f55022730840823766def31cb4481cb5');
  assert.notEqual(hash('['+icu.join(', ')+']'),expected);
  assert.equal(JSON.parse(icu[4])[3],'lease_until');assert.equal(JSON.parse(icu[5])[3],'lease');
  await db.exec('truncate source_rows');for(const s of icu)await db.query('insert into source_rows values($1::jsonb)',[s]);
  const {rows:[row]}=await db.query(`select ${canonicalArrayTextSQL('item','item::text collate "C"')} as canonical from source_rows`);
  assert.equal(hash(row.canonical),expected);
  await db.query("update source_rows set item=jsonb_set(item,'{4}','\"text\"'::jsonb) where item->>0='column' and item->>3='lease'");
  const {rows:[changed]}=await db.query(`select ${canonicalArrayTextSQL('item','item::text collate "C"')} as canonical from source_rows`);
  assert.notEqual(hash(changed.canonical),expected,'field drift is still rejected, not normalized away');
 }finally{await db.close();}
});
