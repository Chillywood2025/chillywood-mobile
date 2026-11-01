#!/usr/bin/env node
// Fee-ledger races on real backends in an owned disposable local Supabase clone.
// No remote endpoints, provider calls, altered production functions or Mac.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';

if(process.argv.includes('--help')) {
  console.log('Run after local Supabase reset: node scripts/test-commerce-fee-concurrency-postgres.mjs. SUPABASE_DB_CONTAINER may name a local supabase_db_* CLI container. Only generated disposable clone is written.');
  process.exit(0);
}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_fees`;
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
  if(query("select to_regclass('private.commerce_tax_qualifications') is not null")==='t')query(`
    insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
      professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
      registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
    values('room_auction','prod_AuctionFixture','acct_platform','test','worldwide','all_supported_platforms','SYNTHETIC CHECKOUT ONLY','SYNTHETIC ONLY',true,
      'automatic','self','txcd_99999999','inclusive','SYNTHETIC ONLY','SYNTHETIC ONLY','SYNTHETIC ONLY',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',true);`);
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

  assert.equal(query("select to_regclass('private.commerce_known_cost_snapshots') is not null"),'t','fee-policy bundle reset required');
  let checks=0;
  async function race(label,holderSql,waiterSql,expectedError=null){
    const holder=session(`fee-holder-${checks}`,`begin;${holderSql}select 'HOLDER_READY';`);
    await until(()=>holder.output().includes('HOLDER_READY'),`${label}: holder`);
    const waiter=session(`fee-waiter-${checks}`,`begin;${waiterSql}commit;`);waiter.child.stdin.end();
    await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder.name)}
      where w.datname=current_database() and w.application_name=${literal(waiter.name)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1',`${label}: actual backend lock edge`);
    holder.child.stdin.end('commit;\n');
    const h=await holder.done,w=await waiter.done;assert.equal(h.code,0,h.stderr);
    if(expectedError){assert.notEqual(w.code,0);assert.match(w.stderr,expectedError);}else assert.equal(w.code,0,w.stderr);
    console.log(`ok ${++checks} - ${label}`);
  }
  const a=await fixture('FEEA'),b=await fixture('FEEB');
  const context=id=>run(`public.get_commerce_fee_report_import_context('${id}')`);
  const ca=context(a.contract),cb=context(b.contract);
  const evidence=(c,runId,feeId,amount=5)=>({schemaVersion:1,accountId:c.accountId,environment:c.environment,
    reportRunId:runId,fileId:'file_'+runId.replace('frr_',''),reportType:'all_fees.incurred_at.itemized.2',intervalStart:100,intervalEnd:200,
    chargeId:c.chargeId,refundIds:c.refundIds,rows:[{feeTransactionId:feeId,incurredBy:c.chargeId,incurredByType:'charge',
     amountMinor:amount,taxMinor:0,currency:'usd',product:'Tax',suite:'Revenue',featureName:'Automatic tax',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_'+feeId.replaceAll('_','')}],
    unattributedRows:0,observedRowCount:1,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
    holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300});
  const record=(id,c,e)=>`public.record_commerce_fee_report_observation('${id}','${c.sourceObservationId}',${json(e)})`;
  const serviceSql=sql=>`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';set local request.jwt.claim.role='service_role';select ${sql};`;
  const first=evidence(ca,'frr_First','fee_First');
  await race('same-sale identical import is idempotent after real row-lock wait',serviceSql(record(a.contract,ca,first)),serviceSql(record(a.contract,ca,first)));
  assert.equal(query(`select count(*) from private.commerce_fee_components where component->>'feeTransactionId'='fee_First'`),'1');
  await race('different sales serialize account component attribution without a lock cycle',
    serviceSql(record(a.contract,ca,evidence(ca,'frr_Second','fee_Second'))),serviceSql(record(b.contract,cb,evidence(cb,'frr_Third','fee_Third'))));
  assert.equal(query(`select count(*) from private.commerce_fee_components where account_id='acct_platform'`),'3');
  query(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
    values('${actors.creator.id}','known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),'${actors.creator.session}');
    insert into private.commerce_fee_semantic_qualifications(account_id,environment,semantics,evidence_reference,verified_at,expires_at,balance_attribution_verified)
    values('acct_platform','test','all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','SYNTHETIC NATIVE TEST ONLY',now(),now()+interval '1 hour',true);`);
  await race('late report after snapshot invalidates readiness instead of spending old net',
    serviceSql(`public.reconcile_commerce_known_costs('room_auction','${a.contract}')`),serviceSql(record(a.contract,ca,evidence(ca,'frr_Late','fee_Late'))));
  assert.equal(query(`select private.commerce_tax_fee_settlement_ready('room_auction',(select quote_id from private.auction_platform_settlement_contracts where id='${a.contract}'))`),'f');
  const partial={...b.facts,refunded_minor:100,refund_net_minor:-100,tax_reversal_minor:0,
    refunds:[{id:'re_Native',balance_id:'txn_NativeRefund',amount:100,fee:0,net:-100,status:'available'}]};
  await race('refund source advancement rejects waiting old-source fee import',
    serviceSql(`public.record_auction_platform_cost_observation('${b.contract}',${json(partial)})`),
    serviceSql(record(b.contract,cb,evidence(cb,'frr_Stale','fee_Stale'))),/fee_source_observation_stale/);
  assert.equal(query(`select count(*) from private.commerce_fee_report_observations where report_run_id='frr_Stale'`),'0');
  assert.equal(checks,4);
  console.log('Commerce fee native concurrency: 4 observed backend lock schedules; synthetic evidence only; no provider requests.');
} finally {
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try {if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally {restore.assertSourceUnchanged();}
}
