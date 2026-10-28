import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {splitSQL} from './helpers/database-runtime-authority-fixture.mjs';

const evidence=JSON.parse(readFileSync('docs/audits/evidence/profile-migration-transaction-guards-20261027.json','utf8'));
test('installed identities retain candidate provenance without duplicate migrations',()=>{
 assert.equal(new Set(evidence.mapping.map(row=>row.file)).size,4);
 assert.equal(new Set(evidence.mapping.map(row=>row.candidateFile)).size,4);
 for(const row of evidence.mapping){
  assert.match(row.file,/^20261028\d{6}_/u);
  assert.match(row.candidateFile,/^20261027\d{6}_/u);
  assert.equal(row.file.slice(14),row.candidateFile.slice(14));
  assert.equal(existsSync(`supabase/migrations/${row.candidateFile}`),false);
  const original=evidence.atomicity.observations.find(item=>item.file===row.candidateFile);
  assert.ok(original,'historical atomicity identity is preserved');
  assert.equal(original.sha256,row.guardedPayloadSha256);
 }
});
const withoutComments=sql=>sql.replace(/^\s*(?:--[^\n]*\n\s*)*/u,'').trim();
for(const row of evidence.mapping) test(`bounded atomic migration payload: ${row.file}`,()=>{
 const source=readFileSync(`supabase/migrations/${row.file}`,'utf8');
 const statements=splitSQL(source);
 const commands=statements.map(withoutComments);
 assert.equal(commands[0],'begin;');
 assert.equal(commands.at(-1),'commit;');
 assert.equal(commands.filter(s=>s==='begin;').length,1);
 assert.equal(commands.filter(s=>s==='commit;').length,1);
 assert.deepEqual(commands.filter(s=>/^set local /iu.test(s)),[
  "set local lock_timeout = '5s';", "set local statement_timeout = '60s';",
 ]);
 const runtime=statements.filter((_,i)=>!/^\s*(?:begin;|commit;|set local (?:lock_timeout|statement_timeout)\s*=)/iu.test(commands[i])).map(s=>s.trim());
 assert.equal(createHash('sha256').update(JSON.stringify(runtime)).digest('hex'),row.runtimeStatementsSha256,'runtime statements match the separately measured payload');
 assert.equal(createHash('sha256').update(source).digest('hex'),row.guardedPayloadSha256,'exact native-qualified guarded payload');
});
