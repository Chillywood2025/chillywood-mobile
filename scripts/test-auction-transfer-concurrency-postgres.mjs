#!/usr/bin/env node
// Real backends in an owned disposable clone of a local reset Supabase DB.
// No remote endpoints, provider calls, altered production functions or Mac.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';

if(process.argv.includes('--help')) {
  console.log('Run after local Supabase reset: node scripts/test-auction-transfer-concurrency-postgres.mjs. SUPABASE_DB_CONTAINER may name a local supabase_db_* CLI container. Only generated disposable clone is written.');
  process.exit(0);
}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_auction`;
const restore=createBrandGuardCloneRestorer({container});
const literal=x=>`'${String(x).replaceAll("'","''")}'`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'fixture query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','auction-fixture-admin',...a],input,encoding);
const sessions=[];
function session(name,sql) {
  const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  child.stdin.write(`set application_name=${literal(name)};set statement_timeout='30s';set time zone 'UTC';${sql}\n`);
  const s={child,done,output:()=>stdout,name};sessions.push(s);return s;
}
async function until(predicate,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(predicate())return;await delay(25);}throw Error(`queue timeout: ${label}`);}
let cloned=false;
try {
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
  const containers=success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n');
  assert.ok(containers.includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030204513');",'postgres'),'t','full auction cumulative-recovery migration reset required');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create disposable clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  query("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
  const actors=JSON.parse(query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  const claims=(who,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:actors[who].id,session_id:actors[who].session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const call=(who,sql,role)=>`begin;${claims(who,role)}select ${sql};commit;`;
  // PostgreSQL row/composite RPCs (including room join) are not JSON text.
  const rpc=(who,sql)=>JSON.parse(query(call(who,`to_jsonb(${sql})`)).split('\n').at(-1));
  query(readFileSync('tests/fixtures/creator-external-payment-authority.sql','utf8'));
  const cap=query(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,route_kind,currency,
    environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
    values('room_seat_auction','${actors.creator.id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
    'synthetic fixture','synthetic fixture',now()-interval '1 minute',now()+interval '1 hour',true) returning id;`);
  query(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    select '${cap}',user_id,session_id,'synthetic fixture',now()-interval '1 minute',now()+interval '10 minutes'
    from event_reservation_fixture.actors where kind like 'buyer%';`);
  const product=query(`insert into public.monetization_products(product_key,product_type,display_name,provider,provider_product_id,environment,status,is_android_digital,is_physical_good)
    values('auction_race_fixture','room_seat_pass','Synthetic concurrency fixture','stripe_room_auction','prod_AuctionFixture','sandbox','sandbox',false,false) returning id;`);
  query(`insert into private.creator_room_auction_product_bindings values('${cap}','${product}','synthetic fixture only',now());
    insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
    values('${cap}','acct_platform','acct_fixture','${product}','prod_AuctionFixture','synthetic fixture only','active',true,now(),now()+interval '10 minutes');`);
  const service=sql=>call('buyer1',sql,'service_role');
  const run=sql=>JSON.parse(query(service(sql)).split('\n').at(-1));
  const json=x=>`${literal(JSON.stringify(x))}::jsonb`;
  const receiptSql=e=>`public.process_stripe_room_auction_receipt(${json(e)},'${createHash('sha256').update(JSON.stringify(e)).digest('hex')}')`;
  async function fixture(name) {
    const providerSuffix=name.replace(/[^A-Za-z0-9]/gu,'');
    const party=`TRANSFER-${name}`;
    // Each schedule has an independent synthetic room, not a room-creation
    // abuse scenario. Reset only this clone fixture's exact creation bucket;
    // keep every production trigger and all other actors/actions untouched.
    const bucket=`actor_user_id='${actors.creator.id}' and action_key='watch_party_room_create' and target_key='live' and metadata->>'source'='watch_party_rooms'`;
    const otherBuckets=()=>query(`select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]'::jsonb) from public.abuse_rate_limit_events e where not (${bucket})`);
    const beforeBuckets=otherBuckets();
    query(`delete from public.abuse_rate_limit_events where ${bucket};`);
    assert.equal(otherBuckets(),beforeBuckets,'independent fixture setup preserves every unrelated abuse bucket');
    query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values('${party}','${actors.creator.id}','live','open','open',true,'private');`);
    const setup=rpc('creator',`public.prepare_creator_room_seat_auction('${party}')`);
    const auction=rpc('creator',`public.create_creator_room_seat_auction('${party}','stage_reserved_seat',237,1,clock_timestamp()+interval '2 seconds',now()+interval '1 hour','test','${randomUUID()}','${setup.roomSessionId}')`);
    rpc('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
    await delay(2100);
    const quote=rpc('buyer1',`public.create_creator_room_seat_auction_award_quote('${auction.id}',null)`);
    const attempt=randomUUID();
    const claim=run(`public.prepare_creator_room_auction_platform_checkout('${quote.id}','${actors.buyer1.id}','${actors.buyer1.session}','${attempt}')`);
    assert.equal(claim.startAuthorized,true);
    // Binder returns void. query still checks psql's exit status and propagates
    // every SQL error; there is deliberately no invented JSON result to parse.
    query(service(`public.bind_creator_room_auction_checkout('${quote.id}','${attempt}','cs_test_${providerSuffix}','pi_${providerSuffix}','acct_platform',237,'usd')`));
    const paid={eventId:`evt_${providerSuffix}`,eventType:'checkout.session.completed',occurredAt:new Date().toISOString(),accountId:'acct_platform',environment:'test',objectId:`cs_test_${providerSuffix}`,paymentIntentId:`pi_${providerSuffix}`,checkoutSessionId:`cs_test_${providerSuffix}`,quoteId:quote.id,buyerId:actors.buyer1.id,creatorId:actors.creator.id,auctionId:auction.id,amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_AuctionFixture',settlementContractId:claim.settlementContractId,settlementPolicy:claim.settlementPolicy};
    assert.equal(run(receiptSql(paid)).status,'fulfilled');
    const contract=claim.settlementContractId;
    const facts={account_id:'acct_platform',environment:'test',currency:'usd',charge_id:`ch_${providerSuffix}`,payment_intent_id:`pi_${providerSuffix}`,balance_id:`txn_${providerSuffix}`,balance_status:'available',disputed:false,financial_authority:false,gross_minor:237,provider_fee_minor:37,tax_minor:0,store_fee_minor:0,refunded_minor:0,refund_net_minor:0,tax_reversal_minor:0,refunds:[]};
    run(`public.record_auction_platform_cost_observation('${contract}',${json(facts)})`);
    rpc('buyer1',`public.join_watch_party_room_session('${party}')`);
    query(call('creator',`public.set_creator_room_participant_authority_service('${party}','${actors.creator.id}','${actors.creator.session}','${actors.buyer1.id}','speaker',false,'active')`,'service_role'));
    rpc('buyer1',`public.heartbeat_watch_party_room_session('${party}','active',false,false,true)`);
    query(`update public.watch_party_rooms set is_active=false where party_id='${party}';`);
    const qualified=run(`public.qualify_auction_room_release_from_domain('${contract}')`);
    assert.equal(qualified.status,'qualified_test_only');
    const refund={...paid,eventId:`evt_Refund${providerSuffix}`,eventType:'charge.refunded',objectId:`ch_${providerSuffix}`,checkoutSessionId:null,outcome:'refunded',refundedAmountMinor:237};
    return {name,contract,facts,refund,qualified,reserve:`public.reserve_auction_test_transfer('${contract}')`};
  }
  let checks=0;
  const values=s=>s.split('\n').filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));
  // Each schedule observes a real backend lock edge before allowing commit.
  // Both orderings below are controls: neither a timing sleep nor a mock mutex
  // can substitute for the production serialization and outcome assertions.
  async function race(label,holderSql,waiterSql) {
    const holder=session(`transfer-holder-${checks}`,`begin;${holderSql}select 'HOLDER_READY';`);
    await until(()=>holder.output().includes('HOLDER_READY'),`${label}: holder`);
    const waiter=session(`transfer-waiter-${checks}`,`begin;${waiterSql}commit;`);waiter.child.stdin.end();
    await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder.name)}
      where w.datname=current_database() and w.application_name=${literal(waiter.name)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1',`${label}: actual backend block`);
    holder.child.stdin.end('commit;\n');
    const h=await holder.done,w=await waiter.done;
    assert.equal(h.code,0,h.stderr);assert.equal(w.code,0,w.stderr);
    console.log(`ok ${++checks} - ${label}`);
    return [values(h.stdout).at(-1),values(w.stdout).at(-1)];
  }
  const svc=sql=>`${claims('buyer1','service_role')}select ${sql};`;
  const dispatch=op=>`public.claim_auction_test_transfer_dispatch('${op}')`;
  const operation=op=>JSON.parse(query(`select to_jsonb(o) from private.auction_transfer_operations o where id='${op}';`));
  const allocationSnapshot=()=>query('select coalesce(jsonb_agg(to_jsonb(a) order by id),\'[]\'::jsonb) from private.auction_held_net_allocations a;');
  const a=await fixture('DUPLICATE');
  const before=allocationSnapshot();
  const [r1,r2]=await race('duplicate release reservation binds one immutable allocation',svc(a.reserve),svc(a.reserve));
  assert.equal(r1.operationId,r2.operationId);assert.equal(r1.dispatchAuthorized,false);assert.equal(r2.dispatchAuthorized,false);
  assert.equal(query(`select count(*) from private.auction_transfer_operations where contract_id='${a.contract}'`),'1');
  const op=r1.operationId;
  const [d1,d2]=await race('duplicate workers get one permit and persist unknown before response',svc(dispatch(op)),svc(dispatch(op)));
  assert.equal(d1.dispatchAuthorized,true);assert.equal(d1.state,'unknown');assert.equal(d2.dispatchAuthorized,false);
  assert.equal(run(dispatch(op)).dispatchAuthorized,false,'lost response must not produce a retry permit');
  assert.equal(operation(op).state,'unknown');
  const transfer={id:'tr_DUPLICATE',object:'transfer',livemode:false,platform_account_id:'acct_platform',destination:'acct_fixture',source_transaction:'ch_DUPLICATE',amount:160,currency:'usd',transfer_group:d1.transfer_group,amount_reversed:0,metadata:{auction_operation_id:op,auction_contract_id:a.contract}};
  const confirm=`public.record_auction_test_transfer_result('${op}',${json(transfer)})`;
  const [c1,c2]=await race('duplicate transfer confirmations preserve one provider identity',svc(confirm),svc(confirm));
  assert.equal(c1.status,'confirmed');assert.equal(c2.status,'confirmed');
  assert.equal(query(`select count(*) from private.auction_transfer_result_observations where operation_id='${op}'`),'1');
  assert.throws(()=>run(`public.record_auction_test_transfer_result('${op}',${json({...transfer,id:'tr_ChangedIdentity'})})`),/transfer_identity_changed/);
  assert.throws(()=>query(`update private.auction_held_net_allocations set creator_minor=creator_minor+1 where id='${operation(op).allocation_id}'`),/immutable/);
  assert.equal(allocationSnapshot(),before,'dispatch and receipt never rewrite held allocation');
  const b=await fixture('REFUND_FIRST');const bop=run(b.reserve).operationId;
  const [,bd]=await race('refund commits first: dispatch canceled',svc(receiptSql(b.refund)),svc(dispatch(bop)));
  assert.equal(bd.dispatchAuthorized,false);assert.equal(operation(bop).state,'canceled');
  run(receiptSql({...b.refund,eventId:'evt_RefundFirstRepeat'}));
  assert.equal(operation(bop).state,'canceled','repeat invalidation cannot resurrect a canceled operation');
  const c=await fixture('DISPATCH_FIRST');const cop=run(c.reserve).operationId;
  const [cd]=await race('dispatch commits first: refund creates recovery without redispatch',svc(dispatch(cop)),svc(receiptSql(c.refund)));
  assert.equal(cd.dispatchAuthorized,true);assert.equal(operation(cop).state,'reconciliation_required');assert.equal(operation(cop).recovery_required,true);assert.equal(run(dispatch(cop)).dispatchAuthorized,false);
  const e=await fixture('REVOKE_FIRST');const eop=run(e.reserve).operationId;
  const [,ed]=await race('release evidence revocation wins against dispatch',`update private.auction_release_evidence set revoked_at=clock_timestamp() where id='${e.qualified.releaseEvidenceId}';`,svc(dispatch(eop)));
  assert.equal(ed.dispatchAuthorized,false);assert.equal(operation(eop).state,'canceled');
  const f=await fixture('DISPATCH_REVOKE');const fop=run(f.reserve).operationId;
  const [fd]=await race('dispatch wins before release evidence revocation',svc(dispatch(fop)),`update private.auction_release_evidence set revoked_at=clock_timestamp() where id='${f.qualified.releaseEvidenceId}';`);
  assert.equal(fd.dispatchAuthorized,true);assert.equal(run(dispatch(fop)).dispatchAuthorized,false);
  assert.equal(operation(fop).state,'reconciliation_required');assert.equal(operation(fop).recovery_required,true);
  const cost=await fixture('COST_FIRST');const costOp=run(cost.reserve).operationId;
  const costBefore=query(`select to_jsonb(a) from private.auction_held_net_allocations a where id='${operation(costOp).allocation_id}'`);
  const changedCost=`public.record_auction_platform_cost_observation('${cost.contract}',${json({...cost.facts,disputed:true})})`;
  const [,costDispatch]=await race('new verified cost allocation invalidates reserved transfer',svc(changedCost),svc(dispatch(costOp)));
  assert.equal(costDispatch.dispatchAuthorized,false);assert.equal(operation(costOp).state,'canceled');
  run(`public.record_auction_platform_cost_observation('${cost.contract}',${json({...cost.facts,disputed:true,balance_status:'pending'})})`);
  assert.equal(operation(costOp).state,'canceled','repeated cost observations cannot revive canceled transfer');
  assert.equal(query(`select to_jsonb(a) from private.auction_held_net_allocations a where id='${operation(costOp).allocation_id}'`),costBefore,'new allocations never overwrite original 80/20 net ledger');
  const g=await fixture('ELIGIBILITY');const gop=run(g.reserve).operationId;
  const [,gd]=await race('eligibility loss commits first: no stale dispatch permit',`update public.creator_payout_eligibility_records set fraud_hold_active=true where payout_account_id in(select id from public.creator_payout_accounts where creator_user_id='${actors.creator.id}');`,svc(dispatch(gop)));
  assert.equal(gd.dispatchAuthorized,false);assert.equal(operation(gop).state,'canceled');
  // Restore only synthetic fixture eligibility; no provider mutation.
  query(`update public.creator_payout_eligibility_records set fraud_hold_active=false where payout_account_id in(select id from public.creator_payout_accounts where creator_user_id='${actors.creator.id}');`);
  const h=await fixture('DISPATCH_ELIGIBILITY');const hop=run(h.reserve).operationId;
  const [hd]=await race('dispatch first versus eligibility loss retains recovery obligation',svc(dispatch(hop)),`update public.creator_payout_eligibility_records set fraud_hold_active=true where payout_account_id in(select id from public.creator_payout_accounts where creator_user_id='${actors.creator.id}');`);
  assert.equal(hd.dispatchAuthorized,true);assert.equal(operation(hop).state,'reconciliation_required');assert.equal(operation(hop).recovery_required,true);
  query(`update public.creator_payout_eligibility_records set fraud_hold_active=false where payout_account_id in(select id from public.creator_payout_accounts where creator_user_id='${actors.creator.id}');`);
  const q=await fixture('QUALIFICATION_REVOKE');const qop=run(q.reserve).operationId;
  const [,qd]=await race('platform qualification revocation prevents dispatch',`update private.auction_platform_qualifications set revoked_at=clock_timestamp() where capability_id='${cap}';`,svc(dispatch(qop)));
  assert.equal(qd.dispatchAuthorized,false);assert.equal(operation(qop).state,'canceled');
  run(receiptSql(a.refund));
  const evidence=amount=>query(`insert into private.auction_reversal_evidence(operation_id,amount_minor,evidence_reference,policy_version,qualified_at,expires_at)
    values('${op}',${amount},'synthetic native race only','synthetic_auction_reversal_test_v1',clock_timestamp(),clock_timestamp()+interval '1 hour') returning id;`);
  const er1=evidence(100),er2=evidence(100);
  const reverse=id=>`public.reserve_auction_test_reversal('${id}')`;
  const [v1,v2]=await race('concurrent reversals cannot over-reserve original 160 net',svc(reverse(er1)),svc(reverse(er2)));
  assert.equal(v1.status,'reserved');assert.equal(v2.status,'held');
  assert.equal(query(`select sum(amount_minor) from private.auction_reversal_operations where transfer_operation_id='${op}' and state<>'canceled'`),'100');
  const vop=v1.operationId,rd=`public.claim_auction_test_reversal_dispatch('${vop}')`;
  assert.equal(run(`public.read_auction_test_reversal_operation('${vop}')`).expected_reversed_minor,0,'reservation freezes observed cumulative reversal before dispatch');
  const [rd1,rd2]=await race('duplicate reversal workers receive exactly one unknown-result permit',svc(rd),svc(rd));
  assert.equal(rd1.dispatchAuthorized,true);assert.equal(rd2.dispatchAuthorized,false);assert.equal(run(rd).dispatchAuthorized,false);
  assert.equal(rd1.expected_reversed_minor,0,'claim preserves immutable cumulative snapshot');
  const reversal={id:'trr_DUPLICATE',object:'transfer_reversal',platform_account_id:'acct_platform',transfer:transfer.id,amount:100,currency:'usd',metadata:{auction_reversal_id:vop,auction_operation_id:op},parent_transfer:{...transfer,amount_reversed:100}};
  const rc=`public.record_auction_test_reversal_result('${vop}',${json(reversal)})`;
  const [rc1,rc2]=await race('double reversal confirmation is idempotent and never claims buyer refund',svc(rc),svc(rc));
  assert.equal(rc1.status,'confirmed');assert.equal(rc2.status,'confirmed');assert.equal(rc1.buyerRefundCompleted,false);assert.equal(rc2.buyerRefundCompleted,false);
  assert.equal(rc1.cumulativeReconciled,true);assert.equal(rc2.cumulativeReconciled,true);
  assert.equal(rc1.reversalConfirmed,true);assert.equal(rc2.reversalConfirmed,true);
  assert.equal(run(`public.read_auction_test_reversal_operation('${vop}')`).expected_reversed_minor,0,'postflight evidence does not rewrite reservation snapshot');
  assert.throws(()=>run(`public.record_auction_test_reversal_result('${vop}',${json({...reversal,id:'trr_ChangedIdentity'})})`),/reversal_identity_changed/);
  assert.equal(query(`select count(*) from private.auction_transfer_result_observations where operation_id='${op}' and evidence->>'object'='transfer_reversal'`),'1');
  assert.equal(operation(op).recovery_required,true,'partial reversal cannot erase recovery obligation');
  assert.equal(query(`select amount_minor from private.auction_transfer_operations where id='${op}'`),'160');
  assert.equal(query(`select creator_minor from private.auction_held_net_allocations where id='${r1.allocationId??operation(op).allocation_id}'`),'160');
  assert.equal(checks,14);
  console.log('Auction transfer native concurrency: 14 observed production lock schedules passed; synthetic provider evidence only.');
} finally {
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try {if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally {restore.assertSourceUnchanged();}
}
