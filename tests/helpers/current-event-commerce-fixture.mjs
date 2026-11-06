// Current-schema companion to the historical shared event SQL fixture. Keep
// historical migration checkpoints unchanged. All provider facts are synthetic.
import {seedQualifiedCommerceCreator,assertBuyerHasNoPremium} from './automatic-commerce-fixture.mjs';

export async function seedCurrentEventCommerceCreator(db,{premium=true,kind='creator'}={}){
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const creator=actors.find(actor=>actor.kind===kind);
  const existing=(await db.query("select provider_account_id from public.creator_payout_accounts where creator_user_id=$1 and provider='stripe_connect' and provider_environment='test'",[creator.user_id])).rows[0];
  await seedQualifiedCommerceCreator(db,{id:creator.user_id,session:creator.session_id},{premium,providerAccountId:existing?.provider_account_id});
  for(const actor of actors.filter(actor=>actor.kind.startsWith('buyer')))
    await assertBuyerHasNoPremium(db,{id:actor.user_id});
}
