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
}
