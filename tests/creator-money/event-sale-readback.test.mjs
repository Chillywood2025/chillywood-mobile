import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {eventContract} from '../fixtures/event-purchase-contract.mjs';
const owner='11111111-1111-4111-8111-111111111111',event='22222222-2222-4222-8222-222222222222',offerId='33333333-3333-4333-8333-333333333333';
const input={creatorEventId:event,description:'Exact online admission',priceCents:199,capacityLimit:12,status:'sandbox',timeZone:'America/New_York',salesOpenAt:'2098-12-21T01:00:00Z',salesCloseAt:'2099-01-04T00:30:00Z',
  expectedUpdatedAt:'2026-10-26T17:00:00Z',expectedTerms:{title:'Sunday online show',startsAt:'2099-01-04T01:00:00.000Z',endsAt:'2099-01-04T02:00:00.000Z',replayPolicy:'none',replayAvailableAt:null,replayExpiresAt:null}};
const base=()=>{const contract=eventContract(offerId,event,199);return {id:offerId,creatorId:owner,...input,currency:'usd',...contract,
  title:input.expectedTerms.title,startsAt:input.expectedTerms.startsAt,endsAt:input.expectedTerms.endsAt,
  salesOpenAt:input.salesOpenAt,salesCloseAt:input.salesCloseAt,terms:{...contract.terms,description:input.description,capacityLimit:12,salesOpenAt:input.salesOpenAt,salesCloseAt:input.salesCloseAt}};};
const code=ts.transpileModule(fs.readFileSync('_lib/paidCreatorEvents.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime(value,stale=false){const exports={},calls=[];let current=true;const authority={userId:owner};
  const mocks={'react-native':{Platform:{OS:'android'}},'./supabase':{supabase:{}},
    './creatorMoneyPurchaseAuthority':{captureCreatorMoneyPurchaseAuthority:()=>authority,isCreatorMoneyPurchaseAuthorityCurrent:()=>current},
    './accountBoundSupabaseMutation':{runCurrentAccountBoundSupabaseMutationRpc:async(...args)=>{calls.push(args);if(stale)current=false;return{data:value,error:null};}}};
  new Function('exports','require',code)(exports,name=>mocks[name]??{});return{api:exports,calls};}
test('event sale confirmation binds source, owner, terms, exact amount, capacity, windows and status',async()=>{
  const h=runtime(base());assert.equal((await h.api.configurePaidCreatorEventSale(input)).priceCents,199);
  assert.equal(h.calls[0][0],'configure_paid_creator_event_sale');assert.equal(h.calls[0][2],owner);
  assert.equal(h.calls[0][1].p_expected_updated_at,input.expectedUpdatedAt);
  for(const change of [{creatorEventId:offerId},{creatorId:event},{priceCents:99},{currency:'eur'},
    {status:'active'},{capacityLimit:100},{description:'Other admission'},{timeZone:'UTC'},
    {salesOpenAt:null},{salesCloseAt:'2099-01-04T00:00Z'},{salesPaused:true},{title:'A changed show'},
    {startsAt:'2099-01-11T01:00Z'},{endsAt:'2099-01-04T01:30Z'}]){
    await assert.rejects(runtime({...base(),...change}).api.configurePaidCreatorEventSale(input),/could not be verified/);
  }
  for(const change of [{priceCents:99},{description:'Other terms'},{capacityLimit:100},{salesOpenAt:null},{salesCloseAt:null},{timeZone:'UTC'},
    {title:'Changed title'},{startsAt:'2099-01-11T01:00Z'},{endsAt:'2099-01-04T01:30Z'},
    {replayPolicy:'indefinite'},{replayAvailableAt:'2099-01-05T00:00Z'},{replayExpiresAt:'2099-01-10T00:00Z'}]){
    const value=base();value.terms={...value.terms,...change};await assert.rejects(runtime(value).api.configurePaidCreatorEventSale(input),/could not be verified/);
  }
  await assert.rejects(runtime(base(),true).api.configurePaidCreatorEventSale(input),/could not be verified/);
  const missingPreview=runtime(base());await assert.rejects(missingPreview.api.configurePaidCreatorEventSale({...input,expectedUpdatedAt:undefined}),/Refresh the event schedule/);
  assert.equal(missingPreview.calls.length,0);
});
