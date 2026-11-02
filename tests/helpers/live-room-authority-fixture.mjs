// Full-schema, synthetic actor/session/legal/finite Premium evidence. No gate
// replacements, network, production identifiers or provider calls.
import assert from 'node:assert/strict';
export const liveFixtureActors = Object.fromEntries(['host','friend','follower','stranger'].map((key,index)=>[key,{
  id:`ac510000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  session:`ac510001-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
}]));
export const liveFixtureTitle='ac510002-0000-4000-8000-000000000001';
export const liveFixtureClaims=(actor,role='authenticated')=>JSON.stringify({role,sub:actor.id,session_id:actor.session});
export async function seedLiveRoomActor(db,actor,{premium=true}={}) {
  await db.query(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now()) on conflict do nothing`,[actor.id]);
  await db.query(`insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day') on conflict do nothing`,[actor.session,actor.id]);
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
    from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account' on conflict do nothing`,[actor.id,actor.session]);
  if(premium) {
    await db.exec(`update public.platform_money_kill_switches set state='sandbox_only' where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled')`);
    const result=(await db.query(`select public.process_revenuecat_premium_event_atomic('revenuecat_google_play',$2,'INITIAL_PURCHASE',$1::uuid,
      p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',repeat('a',64),
      'NORMAL','google_play','android',null,p.id,$3) result
      from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
        and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1`,
    [actor.id,`live-authority-premium-${actor.id}`,`live-authority-original-${actor.id}`])).rows[0]?.result;
    assert.equal(result?.status,'processed',JSON.stringify(result));
  }
}
export async function seedLiveRoomAuthority(db) {
  for(const actor of Object.values(liveFixtureActors)) await seedLiveRoomActor(db,actor);
  const {host,friend,follower}=liveFixtureActors;
  await db.query(`insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
    values($1,$2,$1,'active',now(),$2)`,[host.id,friend.id]);
  await db.query(`insert into public.channel_followers(channel_user_id,follower_user_id) values($1,$2),($1,$3)`,[host.id,friend.id,follower.id]);
  await db.query(`insert into public.titles(id,title,video_url,is_published,status) values($1,'Canonical public title','https://example.invalid/source.mp4',true,'published')`,[liveFixtureTitle]);
}
export async function withLiveRoomActor(db,actor,fn,role='authenticated') {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role',$2,true)`,[liveFixtureClaims(actor,role),role]);
    await db.exec(`set local role ${role}`);
    const result=await fn();await db.exec('commit');return result;
  } catch(error) {await db.exec('rollback');throw error;}
}
