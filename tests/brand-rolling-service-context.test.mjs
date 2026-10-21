import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {installBrandSoftRemovalFixture} from './helpers/brand-soft-removal-fixture.mjs';

test('actual rolling fixture SQL uses completion JWT authority rather than only legacy role',async()=>{
 const db=new PGlite(),q=async(sql,args=[]) =>(await db.query(sql,args)).rows[0];
 try {
  await installBrandSoftRemovalFixture(db);
  // Auth adapter boundary only: match the native distinction that auth.jwt
  // reads JSON claims, not request.jwt.claim.role. Scanner/queue/Brand SQL is real.
  await db.exec("create or replace function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$");
  await db.exec("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets','rolling-fixture/test.png','v1')");
  const assetId=(await q("insert into platform_brand_assets(owner_user_id,asset_type,storage_object_key,storage_path,mime_type) values('rolling-fixture','hero_image','rolling-fixture/test.png','rolling-fixture/test.png','image/png') returning id")).id;
  const job=(await q('select id from media_scan_jobs where target_id=$1',[assetId])).id;
  const source=readFileSync(new URL('../scripts/studio-rolling-http-fixture.mjs',import.meta.url),'utf8');
  const literal=x=>`'${String(x).replaceAll("'","''")}'`;
  const template=pattern=>{const match=source.match(pattern);assert.ok(match,'actual fixture SQL template exists');return new Function('literal','job','deniedClaims',`return \`${match[1]}\`;`);};
  const claim=template(/const claimed = query\(`([\s\S]*?)`\);/);
  const reject=template(/for \(const deniedClaims of \[\{\}, \{ role: 'authenticated' \}\]\) \{\s*query\(`([\s\S]*?)`\);/);
  const complete=template(/const completed = JSON\.parse\(query\(`([\s\S]*?)`\)\);/);
  const claimed=(await db.exec(claim(literal,job))).flatMap(r=>r.rows??[]);
  assert.deepEqual(claimed,[{id:job}]);
  const beforeJob=await q('select to_jsonb(j) state from media_scan_jobs j where id=$1',[job]);
  const beforeSource=await q('select to_jsonb(a) state from platform_brand_assets a where id=$1',[assetId]);
  assert.equal(beforeJob.state.status,'scanning');
  for(const denied of [{},{role:'authenticated'}]){
   await db.exec(reject(literal,job,denied));
   assert.deepEqual(await q('select to_jsonb(j) state from media_scan_jobs j where id=$1',[job]),beforeJob);
   assert.deepEqual(await q('select to_jsonb(a) state from platform_brand_assets a where id=$1',[assetId]),beforeSource);
  }
  const completed=(await db.exec(complete(literal,job))).flatMap(r=>r.rows??[]);
  assert.equal(completed[0].complete_media_scan_job.targetPropagationComplete,true);
  assert.equal((await q('select scan_status from platform_brand_assets where id=$1',[assetId])).scan_status,'clean');
 }finally{await db.close();}
});
