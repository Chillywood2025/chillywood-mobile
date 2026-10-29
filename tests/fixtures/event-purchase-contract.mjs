// Synthetic server facts for production event-client tests; no provider action.
export const TERMS_ID = '77777777-7777-4777-8777-777777777777';
export const RESERVATION_ID = '88888888-8888-4888-8888-888888888888';
export const eventContract = (offerId, creatorEventId, priceCents=99) => ({
  termsRevisionId: TERMS_ID, timeZone:'America/New_York',salesOpenAt:null,salesCloseAt:null,salesPaused:false,
  terms:{id:TERMS_ID,offerId,creatorEventId,revision:1,title:'Sunday online show',description:'Online admission to this event only',
    priceCents,currency:'usd',startsAt:'2099-01-04T01:00:00.000Z',endsAt:'2099-01-04T02:00:00.000Z',timeZone:'America/New_York',
    salesOpenAt:null,salesCloseAt:null,capacityLimit:10,attendance:'virtual',replayPolicy:'none',replayAvailableAt:null,replayExpiresAt:null},
});
export const heldReservation = (buyerId, offerId, creatorEventId, purchaseIntentId, priceCents=99) => ({
  id:RESERVATION_ID,buyerId,offerId,creatorEventId,purchaseIntentId,termsRevisionId:TERMS_ID,
  state:'held',expiresAt:'2099-01-01T00:00:00.000Z',priceCents,currency:'usd',
});
