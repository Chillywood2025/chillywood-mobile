// Owned-clone native contention, not provider verification.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commerceSeedAdapter,seedCommerceCreator,seedCommerceBuyer} from '../../tests/helpers/automatic-commerce-fixture.mjs';
export async function runAutomaticCommerceDeclarationRaces({query,race,lit}) {
 const db=commerceSeedAdapter(query),actor=await seedCommerceCreator(db,undefined,{environment:'production'});
 const peer={id:actor.id,session:randomUUID()};
 // Seed account legal acceptances for this exact second session as well.
 await seedCommerceBuyer(db,peer);
 const auth=a=>`set local role authenticated;set local request.jwt.claims=${lit(JSON.stringify({role:'authenticated',sub:a.id,session_id:a.session}))};`;
 const declaration=region=>`select public.declare_creator_money_eligibility(true,'US',${lit(region)},'adult-us-creator-v1');`;
 for(let index=0;index<9;index++)query(`begin;${auth(actor)}${declaration(index%2?'NY':'CA')}commit;`);
 const result=await race('distinct exact sessions serialize the final declaration slot',auth(actor)+declaration('TX'),auth(peer)+declaration('WA'),{error:/creator_declaration_rate_limited/});
 assert.ok(result.first,'winning declaration returns real evidence');
 assert.equal(query(`select count(*) from private.creator_eligibility_declarations where creator_id=${lit(actor.id)}`),'10');
 query(`begin;${auth(peer)}${declaration('TX')}commit;`);
 assert.equal(query(`select count(*) from private.creator_eligibility_declarations where creator_id=${lit(actor.id)}`),'10','same latest evidence is a retry even at quota');
 const rows=query(`select md5(jsonb_agg(to_jsonb(d) order by id)::text) from private.creator_eligibility_declarations d where creator_id=${lit(actor.id)}`);
 const grants=query("select md5(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text) from public.access_grants g");
 const retry=await race('mode writer before declaration is rechecked after authority gate wait',
  "update public.platform_money_kill_switches set state='off' where key='live_money_enabled';select '{}'::jsonb;",
  auth(peer)+declaration('TX'));
 // The actual RPC now waits BEFORE capturing mode. Genuine production
 // Premium also permits Sandbox; unchanged evidence is a valid retry, not a
 // new declaration or financial authority. The stale explicit-mode guard
 // remains denied in its own blocked schedule below.
 assert.equal(retry.second.canCreateMoneyExposure,false);
 assert.equal(query(`select public.wave1_user_has_active_legal_requirements_internal(${lit(actor.id)},'creator_money')`),'f',
  'declaration-only fixture still lacks explicit creator-money consent');
 assert.equal(retry.second.sandboxCapability.canUseCreatorTools,false,
  'valid idempotent declaration never manufactures missing legal authority');
 assert.equal(query(`select md5(jsonb_agg(to_jsonb(d) order by id)::text) from private.creator_eligibility_declarations d where creator_id=${lit(actor.id)}`),rows);
 assert.equal(query("select md5(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text) from public.access_grants g"),grants);
 assert.equal(query(`select count(*) from public.creator_payout_accounts where creator_user_id=${lit(actor.id)}`),'0');
 await race('explicit stale production subject is denied after authority gate wait',
  "update public.platform_money_kill_switches set state='off' where key='live_money_enabled';select '{}'::jsonb;",
  `select private.lock_ordinary_creator_subject(${lit(peer.id)},${lit(peer.session)},'production');select '{}'::jsonb;`,{error:/creator_mode_changed/});
 query("begin;set local request.jwt.claim.role='service_role';update public.platform_money_kill_switches set state='on' where key='live_money_enabled';commit;");
}
