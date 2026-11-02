import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {pgtapSQLPreflight} from './helpers/pgtap-sql-preflight.mjs';

test('pool pgTAP SQL preflight uses full schema; native PostgreSQL qualification remains mandatory',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 try{
  await db.exec(pgtapSQLPreflight);
  const results=await db.exec(readFileSync('supabase/tests/creator_clip_export_pool_test.sql','utf8'));
  const assertions=results.flatMap(result=>result.rows??[]).flatMap(row=>Object.values(row)).filter(value=>typeof value==='string'&&value.startsWith('ok '));
  assert.equal(assertions.length,21);
 }finally{await db.close();}
});
