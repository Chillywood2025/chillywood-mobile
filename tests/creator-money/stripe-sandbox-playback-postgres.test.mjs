import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

// Executes the actual adapter migration. Existing session/source verifier
// internals are dependencies here; full migration replay is tested separately.
test('Stripe playback SQL scopes exact grants and current source/session; no native dispatch',{timeout:120000},async()=>{
 const db=new PGlite(),buyer=randomUUID(),session=randomUUID(),video=randomUUID(),creator=randomUUID(),version=randomUUID(),proof=randomUUID(),grant=randomUUID(),otherGrant=randomUUID();
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.buyer',true),'')::uuid $$;
 create function auth.role() returns text language sql as $$ select current_setting('test.role',true) $$;
 create function public.whole_app_exact_current_session_authority_internal() returns boolean language sql as $$ select true $$;
 create function public.creator_tip_buyer_session_authority_internal(b uuid,s uuid) returns boolean language sql as $$ select b=auth.uid() and s=nullif(current_setting('test.session',true),'')::uuid $$;
 create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
 create table public.videos(id uuid,owner_id uuid,mime_type text);
 create table private.native_production_video_versions(id uuid,source_id uuid,creator_id uuid,revision bigint);
 create table private.native_production_source_proofs(id uuid,version_id uuid,origin_provider text,origin_bucket text,origin_object text,origin_generation text,asset_sha256 text,byte_length bigint,verified_at timestamptz,expires_at timestamptz);
 create function private.stripe_video_source_current(v uuid,c uuid) returns boolean language sql as $$ select exists(select 1 from public.videos where id=v and owner_id=c) $$;
 create function private.native_production_source_current(v uuid,p uuid) returns boolean language sql as $$ select exists(select 1 from private.native_production_source_proofs where id=p and version_id=v and expires_at>clock_timestamp()) $$;
 create table private.stripe_paid_video_orders(id uuid default gen_random_uuid(),buyer_id uuid,video_id uuid,creator_id uuid,status text,environment text,access_grant_id uuid,created_at timestamptz default now());
 create table public.access_grants(id uuid,user_id uuid,source_id uuid,provider text,grant_type text,environment text,status text,revoked_at timestamptz,refunded_at timestamptz,starts_at timestamptz,expires_at timestamptz);
 create function private.stripe_video_access_current(b uuid,v uuid) returns boolean language sql as $$ select true $$;`);
 await db.exec(readFileSync('supabase/migrations/20261112184000_stripe_paid_video_sandbox_playback.sql','utf8'));
 await db.query(`select set_config('test.buyer',$1,false),set_config('test.session',$2,false),set_config('test.role','service_role',false)`,[buyer,session]);
 await db.query(`insert into auth.sessions values($1,$2,now()+interval '1 hour')`,[session,buyer]);
 await db.query(`insert into public.videos values($1,$2,'video/mp4')`,[video,creator]);
 await db.query(`insert into private.native_production_video_versions values($1,$2,$3,1)`,[version,video,creator]);
 assert.equal(await one('select private.stripe_video_delivery_ready($1)',[video]),false);
 await db.query(`insert into private.native_production_source_proofs values($1,$2,'cloudflare_r2','private','test.mp4',$3,$4,1024,now(),now()+interval '1 hour')`,[proof,version,'"'+'a'.repeat(32)+'"','a'.repeat(64)]);
 assert.equal(await one('select private.stripe_video_delivery_ready($1)',[video]),true);
 for(const g of [grant,otherGrant]){
 await db.query(`insert into public.access_grants values($1,$2,$3,'stripe_connect','paid_content_access','sandbox','sandbox_only',null,null,now(),null)`,[g,buyer,video]);
 await db.query(`insert into private.stripe_paid_video_orders(buyer_id,video_id,status,environment,access_grant_id,creator_id) values($1,$2,'paid','sandbox',$3,$4)`,[buyer,video,g,creator]);}
 const origin=()=>one('select public.resolve_stripe_sandbox_paid_video_origin($1,$2,$3,$4)',[video,grant,buyer,session]);
 assert.equal((await origin()).protocol,'stripe-sandbox-origin-v1');
 await db.query('update private.stripe_paid_video_orders set creator_id=$1 where access_grant_id=$2',[randomUUID(),grant]);
 assert.equal(await origin(),null);
 await db.query('update private.stripe_paid_video_orders set creator_id=$1 where access_grant_id=$2',[creator,grant]);
 const descriptor=await one('select public.get_stripe_sandbox_paid_video_playback($1)',[video]);
 assert.equal(descriptor.status,'READY');assert.equal('objectKey' in descriptor,false);
 await db.query(`update public.access_grants set refunded_at=now() where id=$1`,[grant]);
 assert.equal(await origin(),null); // Another valid purchase must not rescue this grant.
 await db.query(`update public.access_grants set refunded_at=null where id=$1`,[grant]);
 await db.query(`select set_config('test.session',$1,false)`,[randomUUID()]);assert.equal(await origin(),null);
 await db.query(`select set_config('test.session',$1,false)`,[session]);
 await db.exec(`update private.native_production_source_proofs set expires_at=now()-interval '1 second'`);assert.equal(await origin(),null);
 await db.exec(`set test.role='authenticated'`);await assert.rejects(origin(),/service_role_required/);
 for(const role of ['anon','authenticated']){
 assert.equal(await one(`select has_function_privilege($1,'public.resolve_stripe_sandbox_paid_video_origin(uuid,uuid,uuid,uuid)','execute')`,[role]),false);
 }
 }finally{await db.close();}
});
