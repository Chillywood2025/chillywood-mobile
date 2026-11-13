// Synthetic observation ONLY, for disposable PostgreSQL tests. This helper
// does not contact the proxy, verify residence, qualify providers or enable money.
import {randomUUID} from 'node:crypto';
export async function syntheticVideoMarketObservation(db,orderId,patch={}) {
 const {rows:[order]}=await db.query('select request_id,video_id,checkout_platform from private.stripe_paid_video_orders where id=$1',[orderId]);
 if(!order)throw Error('synthetic_order_missing');
 const now=Date.now();return {nonce:randomUUID(),requestId:order.request_id,videoId:order.video_id,platform:order.checkout_platform,
  country:'US',verification:'trusted_ip_country_observation',observedAt:new Date(now).toISOString(),
  expiresAt:new Date(now+300000).toISOString(),bodySha256:'a'.repeat(64),authorizationSha256:'b'.repeat(64),...patch};
}
