import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const oldFile='supabase/migrations/20261020141458_deleted_content_retention.sql';
const migration=readFileSync('supabase/migrations/20261025083249_deleted_content_user_id_hold_scope.sql','utf8');
const oldSource=readFileSync(oldFile,'utf8');
const start=oldSource.indexOf('create function private.deleted_content_hold_matches(');
const oldFunction=oldSource.slice(start,oldSource.indexOf('$$;',start)+3);
const owner='abcdef01-0000-4000-8000-000000000001',other='abcdef01-0000-4000-8000-000000000002';
const signature='private.deleted_content_hold_matches(text,text,text,text,text,text,text)';

test('user_id is the existing Legal Evidence owner vocabulary, not a new inferred scope',()=>{
 const api=readFileSync('supabase/functions/admin-legal-evidence/index.ts','utf8');
 const branch=api.slice(api.indexOf('if (targetType === "user_id")'),api.indexOf('} else if (targetType === "profile_channel")'));
 for(const [table,column] of [['user_profiles','user_id'],['videos','owner_id'],['profile_posts','user_id']])
  assert.ok(branch.includes(`"${table}", "${column}", targetId`));
 assert.match(api,/from\("legal_holds"\)\.insert\(\{[\s\S]*?target_type: targetType/);
 assert.ok(!/\b(update|delete from|insert into|grant|revoke|drop)\s/i.test(migration.replace(/^--.*$/gm,'')), 'definition-only migration');
});

test('actual SQL exact owner matching, fail-closed malformed scope, legacy parity and ACL preservation',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create schema private; create role anon; create role authenticated; create role service_role;');
  await db.exec(oldFunction);
  await db.exec(`revoke all on function ${signature} from public,anon,authenticated,service_role;`);
  await db.exec(oldFunction.replace('private.deleted_content_hold_matches(', 'private.previous_hold_matches('));
  const metadata=async()=> (await db.query(`select proowner,proacl,provolatile,prosecdef,proconfig,proargnames from pg_proc where oid=$1::regprocedure`,[signature])).rows[0];
  const before=await metadata();
  await db.exec(migration);
  assert.deepEqual(await metadata(),before);
  const call=async args=>(await db.query('select private.deleted_content_hold_matches($1,$2,$3,$4,$5,$6,$7) result',args)).rows[0].result;
  for(const kind of ['creator_video','social_attachment','platform_brand_asset','profile_post','profile_post_comment','creator_video_comment','chat_message','room_message']){
   assert.equal(await call(['user_id',owner,kind,other,owner,null,null]),true,kind+' held owner');
   assert.equal(await call(['user_id',owner,kind,owner,other,null,null]),false,kind+' ID collision does not imply ownership');
   assert.equal(await call(['user_id',owner.toUpperCase(),kind,other,owner,null,null]),true,kind+' equivalent UUID');
  }
  for(const bad of [null,'','not-a-uuid',owner+'x',' '+owner,owner.slice(0,-1),"');select 1;--"]){
   assert.equal(await call(['user_id',bad,'creator_video',other,owner,null,null]),true,'invalid hold fails closed');
   assert.equal(await call(['user_id',owner,'creator_video',other,bad,null,null]),true,'unknown owner fails closed');
  }
  for(const scope of [null,'','USER_ID','future_scope','profile_channel','content_id'])
   assert.equal(await call([scope,owner,'creator_video',other,other,null,null]),true,'unknown scope remains held');
  const oldTypes=['user','account','user_profile','profile_post','profile_post_comment','creator_video_comment','chat_message','room_message','watch_party_room_message','creator_video','video','social_attachment','platform_brand_asset','unknown',null];
  for(const h of oldTypes)for(const t of oldTypes)for(const author of [owner,other,null]){
   const values=[h,owner,t,other,author,'creator_video',owner];
   const rows=(await db.query('select private.previous_hold_matches($1,$2,$3,$4,$5,$6,$7) previous, private.deleted_content_hold_matches($1,$2,$3,$4,$5,$6,$7) current',values)).rows[0];
   assert.equal(rows.current,rows.previous,JSON.stringify(values));
  }
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signature])).rows[0].allowed,false);
 }finally{await db.close();}
});
