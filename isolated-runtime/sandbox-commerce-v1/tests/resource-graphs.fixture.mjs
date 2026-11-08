// Synthetic disposable resource fixture. Direct receipt inserts are not provider
// authentication or qualification; only the real new SQL lifecycle is exercised.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { BUYER, BUYER_SESSION, SELLER, SELLER_SESSION, sqlText, fixtureApi } from './receipts.fixture.mjs';

export function installResourceSql(here) {
  const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n'
    + ' declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
  const authorityFixture = fs.readFileSync(path.join(here, 'authority.fixture.sql'), 'utf8');
  assert.equal(authorityFixture.split(declaration).length, 2, 'Minimum declarations fixture changed; review adaptation');
  const files = ['core.sql', 'premium-authority.sql', 'authority.sql', 'commands.sql', 'receipts.sql',
    'resource-graphs.sql', 'delivery-authority.sql', 'permissions-finalize.sql'];
  const source = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(here, '..', file), 'utf8')]));
  return {
    sql: 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
      + 'alter default privileges for role postgres grant execute on functions to authenticated;'
      + source['core.sql'] + fs.readFileSync(path.join(here, 'premium-authority.fixture.sql'), 'utf8')
      + authorityFixture.replace(declaration, '-- Real core declarations table is used.')
      + 'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);'
      + source['premium-authority.sql'] + source['authority.sql'] + source['commands.sql'] + source['receipts.sql']
      + source['resource-graphs.sql'] + source['delivery-authority.sql'] + source['permissions-finalize.sql'] + 'commit;',
    sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(source[file]).digest('hex')])),
    fixtureAdaptation: 'Removed exactly the minimum declarations CREATE; used actual source tables, functions and finalization.',
  };
}

export async function runResourceGraphCases({ q, runQuery, bin, args, env }) {
  const api = fixtureApi(q, runQuery), cases = [];
  const parse = sql => JSON.parse(q(sql));
  const rejected = (sql, pattern = /sandbox|resource|receipt|grant|permission|immutable|capacity|inventory|claim|delivery|expired/iu) => {
    const result = runQuery(sql); assert.notEqual(result.status, 0, `Expected SQL rejection: ${sql}`);
    assert.match(result.stderr, pattern); return result;
  };
  const reset = () => { api.reset(); q('truncate public.channel_audience_blocks;'); };
  const recordCase = (name, operation) => { reset(); operation(); cases.push(name); };
  const settle = receipt => parse(`select sandbox_commerce_v1.settle_resource_receipt('${receipt}');`);
  const deliverySql = (product, target, action, user = BUYER, session = BUYER_SESSION) =>
    `select sandbox_commerce_v1.authorize_resource_delivery('${user}','${session}','${product}',1,'${target}',1,${action === null ? 'null' : sqlText(action)});`;
  const authorize = (...values) => parse(deliverySql(...values));
  const allowed = (context, action, issuer, user = BUYER, session = BUYER_SESSION) => {
    const result = authorize(context.resourceId, context.targetId ?? context.resourceId, action, user, session);
    assert.equal(result.eligibleForIssuer, true); assert.equal(result.authorizationProof, false);
    assert.equal(result.grantsAccess, false); assert.equal(result.publishAllowed, false);
    assert.equal(result.issuer, issuer); assert.equal(result.binding.userId, user); assert.equal(result.binding.sessionId, session);
    return result;
  };
  let amount = 100;
  const version = (id, kind, price) => q(`insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency)
    values('${id}',1,'${SELLER}',${sqlText(kind)},'Synthetic immutable terms',${price},'usd');`);
  const resource = kind => {
    const resourceId = randomUUID(), price = ++amount;
    q(`insert into sandbox_commerce_v1.resources(id,creator_id,kind,title,status) values('${resourceId}','${SELLER}',${sqlText(kind)},'Synthetic target','published');`);
    version(resourceId, kind, price); return { resourceId, kind, price };
  };
  const purchase = (kind, { resourceId = randomUUID(), buyer = BUYER, session = BUYER_SESSION, receiptExpires = "clock_timestamp()+interval '1 hour'", purchasedAt = "clock_timestamp()-interval '1 second'" } = {}) => {
    const ids = { resourceId, catalogId: randomUUID(), offerId: randomUUID(), intentId: randomUUID(), receiptId: randomUUID() };
    const price = ++amount, providerProduct = `synthetic.${kind}.${ids.catalogId}`;
    q(`insert into sandbox_commerce_v1.resources(id,creator_id,kind,title,status)
      values('${ids.resourceId}','${SELLER}',${sqlText(kind)},'Synthetic resource','published');
      insert into sandbox_commerce_v1.catalog(id,kind,provider,scope_key,store,product_id,amount_minor,currency)
      values('${ids.catalogId}',${sqlText(kind)},'stripe','synthetic-resource-scope','stripe',${sqlText(providerProduct)},${price},'usd');
      insert into sandbox_commerce_v1.offers(id,resource_id,resource_revision,catalog_id)
      values('${ids.offerId}','${ids.resourceId}',1,'${ids.catalogId}');
      insert into sandbox_commerce_v1.intents(id,buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,
        creator_id,kind,provider,scope_key,store,product_id,amount_minor,currency,state)
      values('${ids.intentId}','${buyer}','${session}','${ids.offerId}',1,'${ids.resourceId}',1,'${SELLER}',${sqlText(kind)},
        'stripe','synthetic-resource-scope','stripe',${sqlText(providerProduct)},${price},'usd','verified');
      insert into sandbox_commerce_v1.receipts(id,intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
      values('${ids.receiptId}','${ids.intentId}','stripe','synthetic-resource-scope','stripe',${sqlText(providerProduct)},
        'synthetic-${ids.receiptId}','synthetic-${ids.receiptId}','verified',${purchasedAt},${receiptExpires},clock_timestamp());`);
    version(resourceId, kind, price);
    return { ...ids, kind, buyer, session, price };
  };

  const anotherReceipt = (context, buyer = BUYER, session = BUYER_SESSION) => {
    const intentId = randomUUID(), receiptId = randomUUID();
    q(`insert into sandbox_commerce_v1.intents(id,buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,
      creator_id,kind,provider,scope_key,store,product_id,amount_minor,currency,state)
      select '${intentId}','${buyer}','${session}',offer_id,offer_revision,resource_id,resource_revision,creator_id,kind,provider,scope_key,store,product_id,amount_minor,currency,state
      from sandbox_commerce_v1.intents where id='${context.intentId}';
      insert into sandbox_commerce_v1.receipts(id,intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
      select '${receiptId}','${intentId}',provider,scope_key,store,product_id,'synthetic-${receiptId}','synthetic-${receiptId}',state,purchased_at,expires_at,last_event_at
      from sandbox_commerce_v1.receipts where id='${context.receiptId}';`);
    return { ...context, intentId, receiptId, buyer, session };
  };
  const addBuyer = (user = randomUUID(), session = randomUUID()) => {
    q(`insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${user}',clock_timestamp(),'{}');
      insert into auth.sessions values('${session}','${user}',clock_timestamp()+interval '1 hour');
      insert into public.wave1_legal_acceptances select '${user}','${session}',document_key,version,market,capability,'member',null
      from public.wave1_legal_document_versions where capability='account';`);
    return { user, session };
  };
  const asset = (context, purpose = 'video', { scan = true, mismatchedScan = false } = {}) => {
    const assetId = randomUUID(), incarnation = randomUUID(), objectVersion = randomUUID(), hash = 'a'.repeat(64);
    const key = `sandbox-commerce-v1/${SELLER}/scv1_resource_${context.resourceId}/scv1_asset_${assetId}/bytes`;
    q(`insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,object_key,object_version,incarnation,sha256,byte_length,state,moderation)
      values('${assetId}','${context.resourceId}',1,'${SELLER}',${sqlText(purpose)},'s3','synthetic-private-bucket',${sqlText(key)},'${objectVersion}','${incarnation}','${hash}',1234,'retained','clear');`);
    if (scan) q(`insert into sandbox_commerce_v1.delivery_asset_scans(asset_id,incarnation,provider,bucket,object_key,object_version,sha256,byte_length,state,scanner_version,completed_at)
      values('${assetId}','${incarnation}','s3','synthetic-private-bucket',${sqlText(key)},'${mismatchedScan ? randomUUID() : objectVersion}','${hash}',1234,'clean','synthetic-scanner',clock_timestamp()-interval '1 second');`);
    return { assetId, incarnation, objectVersion, key };
  };
  const video = (context, audience = 'paid', options) => {
    const media = asset(context, 'video', options);
    q(`insert into sandbox_commerce_v1.video_terms values('${context.resourceId}',1,'${media.assetId}',${sqlText(audience)});`);
    return { ...context, ...media };
  };
  const room = (context, { capacity = 2, seats = 1, end = "clock_timestamp()+interval '1 hour'", source } = {}) => {
    const generation = randomUUID();
    if (!source && context.kind === 'watch_party_live') source = video(resource('paid_content'));
    q(`insert into sandbox_commerce_v1.room_terms(resource_id,revision,generation,creator_id,starts_at,ends_at,capacity,seat_capacity,state,source_resource_id,source_revision)
      values('${context.resourceId}',1,'${generation}','${SELLER}',clock_timestamp()-interval '1 minute',${end},${capacity},${seats},'open',
      ${source ? sqlText(source.resourceId) : 'null'},${source ? '1' : 'null'});`);
    return { ...context, generation, source };
  };
  const event = (context, { replay = false, state = 'live' } = {}) => {
    const generation = randomUUID(), outputId = randomUUID();
    const replayAsset = replay ? asset(context, 'event_replay') : null;
    q(`insert into sandbox_commerce_v1.event_terms(resource_id,revision,generation,creator_id,starts_at,ends_at,replay_allowed,replay_starts_at,replay_ends_at,state)
      values('${context.resourceId}',1,'${generation}','${SELLER}',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',${replay},
        ${replay ? "clock_timestamp()-interval '1 second'" : 'null'},${replay ? "clock_timestamp()+interval '2 hours'" : 'null'},${sqlText(state)});
      insert into sandbox_commerce_v1.event_outputs(resource_id,revision,generation,output_id,provider_namespace,provider_room_name,state,replay_asset_id)
      values('${context.resourceId}',1,'${generation}','${outputId}','sandbox-commerce-v1','scv1-event-scv1_resource_${context.resourceId}-${generation}','active',${replay ? sqlText(replayAsset.assetId) : 'null'});`);
    return { ...context, generation, outputId, replayAsset };
  };
  const member = (kind, { duration = kind === 'vip_pass' ? 30 * 86400 : 3600, audience = kind === 'vip_pass' ? 'vip' : 'paid' } = {}) => {
    const context = purchase(kind), target = video(resource('paid_content'), audience);
    q(`insert into sandbox_commerce_v1.membership_terms values('${context.resourceId}',1,${duration});
      insert into sandbox_commerce_v1.membership_inclusions values('${context.resourceId}',1,'${target.resourceId}',1,${sqlText(kind === 'vip_pass' ? 'vip' : 'subscriber')},true);`);
    return { ...context, targetId: target.resourceId, target };
  };
  const seatProduct = (kind = 'live_watch_party_seat', options) => {
    const entry = room(purchase('live_watch_party_access'), options), context = purchase(kind);
    if (kind === 'live_watch_party_seat') q(`insert into sandbox_commerce_v1.room_seat_terms values('${context.resourceId}',1,'${entry.resourceId}',1,'${entry.generation}');`);
    return { ...context, targetId: entry.resourceId, generation: entry.generation, entry };
  };
  const auction = (kind, { winner = BUYER, deadline = "clock_timestamp()+interval '1 hour'" } = {}) => {
    const context = kind === 'room_seat_auction:stage_reserved_seat' ? seatProduct(kind) : purchase(kind);
    const target = context.entry ?? (kind === 'event_auction' ? event(resource('event')) : room(resource('watch_party_live')));
    const lotId = randomUUID();
    q(`insert into sandbox_commerce_v1.auction_terms values('${context.resourceId}',1,'${lotId}','${target.resourceId}',1,'${target.generation}','${winner}',${deadline},'awarded');`);
    return { ...context, targetId: target.resourceId, target, generation: target.generation, lotId };
  };
  const merch = (stock = 1) => {
    const context = purchase('physical_merch'), photo = asset(context, 'merch_photo'), variantId = randomUUID();
    q(`insert into sandbox_commerce_v1.merch_variants(id,resource_id,revision,sku,photo_asset_id,stock,reserved,state)
      values('${variantId}','${context.resourceId}',1,'synthetic-shirt-medium','${photo.assetId}',${stock},0,'active');`);
    return { ...context, photo, variantId };
  };
  const setup = kind => {
    if (kind === 'paid_content') return video(purchase(kind));
    if (kind === 'channel_subscription' || kind === 'vip_pass') return member(kind);
    if (kind === 'watch_party_live' || kind === 'live_watch_party_access') return room(purchase(kind));
    if (kind === 'live_watch_party_seat') return seatProduct();
    if (kind === 'event') return event(purchase(kind));
    if (kind.includes('auction')) return auction(kind);
    if (kind === 'physical_merch') return merch();
    return purchase(kind);
  };
  const modes = {
    paid_content: ['play_video', 'media_signer'], channel_subscription: ['play_video', 'media_signer'], vip_pass: ['play_video', 'media_signer'],
    watch_party_live: ['join_room', 'room_admission'], live_watch_party_access: ['join_room', 'room_admission'],
    live_watch_party_seat: ['request_seat', 'seat_request'], event: ['watch_event', 'event_spectator_proxy'],
    event_auction: ['watch_event', 'event_spectator_proxy'], 'room_seat_auction:party_admission': ['join_room', 'room_admission'],
    'room_seat_auction:stage_reserved_seat': ['request_seat', 'seat_request'], physical_merch: ['read_test_order', 'order_reader'],
  };
  for (const [kind, [action, issuer]] of Object.entries(modes)) recordCase(`${kind} settles its exact private mode graph and yields only scoped issuer eligibility`, () => {
    const context = setup(kind);
    if (context.entry) { settle(context.entry.receiptId); allowed(context.entry, 'join_room', 'room_admission'); }
    const result = settle(context.receiptId); assert.ok(result.grantId || result.orderId);
    const repeated = settle(context.receiptId); assert.equal(repeated.grantId ?? repeated.orderId, result.grantId ?? result.orderId);
    allowed(context, action, issuer);
    if (kind === 'watch_party_live') {
      q(`update sandbox_commerce_v1.resources set status='quarantined' where id='${context.source.resourceId}';`);
      rejected(deliverySql(context.resourceId, context.resourceId, 'join_room'));
    }
    assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0');
  });
  recordCase('Missing action and incomplete typed delivery context reject before every mode can allocate or authorize', () => {
    const counts = () => q(`select jsonb_build_object('admissions',(select count(*) from sandbox_commerce_v1.room_admissions),
      'seats',(select count(*) from sandbox_commerce_v1.room_seats),'orders',(select count(*) from sandbox_commerce_v1.merch_orders));`);
    for (const kind of Object.keys(modes)) {
      const context = setup(kind);
      if (context.entry) { settle(context.entry.receiptId); allowed(context.entry, 'join_room', 'room_admission'); }
      settle(context.receiptId);const before = counts();
      rejected(deliverySql(context.resourceId, context.targetId ?? context.resourceId, null), /sandbox_delivery_request_invalid/u);
      rejected(deliverySql(context.resourceId, context.targetId ?? context.resourceId, 'unknown_action'), /sandbox_delivery_request_invalid/u);
      assert.equal(counts(), before);
    }
    const context = video(purchase('paid_content'));settle(context.receiptId);
    const valid = [sqlText(BUYER),sqlText(BUYER_SESSION),sqlText(context.resourceId),'1',sqlText(context.resourceId),'1',sqlText('play_video')];
    for (const index of [0,1,2,3,4,5]) {
      const invalid = [...valid];invalid[index] = 'null';
      rejected(`select sandbox_commerce_v1.authorize_resource_delivery(${invalid.join(',')});`, /sandbox_delivery_request_invalid/u);
    }
    for (const index of [3,5]) {
      const invalid = [...valid];invalid[index] = '0';
      rejected(`select sandbox_commerce_v1.authorize_resource_delivery(${invalid.join(',')});`, /sandbox_delivery_request_invalid/u);
    }
  });
  recordCase('Tips cannot mint a digital grant or pass through non-tip settlement', () => {
    const context = purchase('creator_tip'); rejected(`select sandbox_commerce_v1.settle_resource_receipt('${context.receiptId}');`);
    assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'), '0');
  });
  recordCase('Every resource table is FORCE RLS; ordinary roles cannot invoke private settlement/delivery or read private graphs', () => {
    const context = video(purchase('paid_content'));
    for (const role of ['anon', 'authenticated', 'service_role']) {
      rejected(`set role ${role};select * from sandbox_commerce_v1.resource_versions;`, /permission denied/u);
      rejected(`set role ${role};select sandbox_commerce_v1.settle_resource_receipt('${context.receiptId}');`, /permission denied/u);
      rejected(`set role ${role};${deliverySql(context.resourceId, context.resourceId, 'play_video')}`, /permission denied/u);
    }
    assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);"), '0');
  });
  recordCase('Immutable product terms, object incarnations and exact scan tuples cannot be replaced', () => {
    const context = video(purchase('paid_content')); settle(context.receiptId);
    for (const update of [
      `update sandbox_commerce_v1.resource_versions set price_minor=price_minor+1 where resource_id='${context.resourceId}';`,
      `update sandbox_commerce_v1.delivery_assets set object_version='other' where id='${context.assetId}';`,
      `update sandbox_commerce_v1.delivery_asset_scans set incarnation='${randomUUID()}' where asset_id='${context.assetId}';`,
    ]) rejected(update, /immutable/u);
    allowed(context, 'play_video', 'media_signer');
  });
  recordCase('A scan for another physical object version cannot qualify media delivery', () => {
    const context = video(purchase('paid_content'), 'paid', { mismatchedScan: true });
    rejected(`select sandbox_commerce_v1.settle_resource_receipt('${context.receiptId}');`);
  });
  recordCase('Asset namespace prefixes require literal resource and asset separators rather than LIKE wildcards', () => {
    const context = purchase('paid_content'), assetId = randomUUID();
    for (const [resourcePrefix,assetPrefix] of [['scv1Xresource_','scv1_asset_'],['scv1_resourceX','scv1_asset_'],['scv1_resource_','scv1Xasset_']]) {
      const key = `sandbox-commerce-v1/${SELLER}/${resourcePrefix}${context.resourceId}/${assetPrefix}${assetId}/bytes`;
      rejected(`insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,
        object_key,object_version,incarnation,sha256,byte_length) values('${assetId}','${context.resourceId}',1,'${SELLER}',
        'video','s3','synthetic-private-bucket',${sqlText(key)},'v1','${randomUUID()}','${'a'.repeat(64)}',1);`, /check constraint/u);
    }
    assert.equal(q('select count(*) from sandbox_commerce_v1.delivery_assets;'), '0');
    const good = video(context);settle(good.receiptId);allowed(good, 'play_video', 'media_signer');
  });
  recordCase('Finite room/event/replay constraints and runtime guards reject missing or infinite windows', () => {
    const context = purchase('event');
    const start = "clock_timestamp()-interval '1 minute'", end = "clock_timestamp()+interval '1 hour'";
    for (const [starts,ends,replayStarts,replayEnds] of [[start,end,start,'null'],[start,end,start,"'infinity'"],
      [start,end,"'-infinity'",end],[start,"'infinity'",start,end],["'-infinity'",end,start,end]]) {
      rejected(`insert into sandbox_commerce_v1.event_terms(resource_id,revision,generation,creator_id,starts_at,ends_at,
        replay_allowed,replay_starts_at,replay_ends_at,state) values('${context.resourceId}',1,'${randomUUID()}','${SELLER}',
        ${starts},${ends},true,${replayStarts},${replayEnds},'replay');`, /check constraint/u);
    }
    const roomContext = purchase('live_watch_party_access');
    for (const [starts,ends] of [[start,"'infinity'"],["'-infinity'",end]]) {
      rejected(`insert into sandbox_commerce_v1.room_terms(resource_id,revision,generation,creator_id,starts_at,ends_at,
        capacity,seat_capacity,state) values('${roomContext.resourceId}',1,'${randomUUID()}','${SELLER}',${starts},${ends},2,1,'open');`, /check constraint/u);
    }
    const replay = event(context, { replay:true, state:'replay' });settle(replay.receiptId);
    // Simulate an old malformed row only inside a rollback-only disposable
    // transaction. Actual source constraints/triggers remain unchanged afterward.
    const oldReplay = `begin;do $$declare c record;begin for c in select conname from pg_constraint
      where conrelid='sandbox_commerce_v1.event_terms'::regclass and contype='c' loop
      execute format('alter table sandbox_commerce_v1.event_terms drop constraint %I',c.conname);end loop;end$$;
      alter table sandbox_commerce_v1.event_terms disable trigger user;
      update sandbox_commerce_v1.event_terms set replay_ends_at=null where resource_id='${replay.resourceId}';`;
    rejected(oldReplay + deliverySql(replay.resourceId,replay.resourceId,'watch_event') + 'rollback;', /sandbox_finite_replay_window_required/u);
    allowed(replay,'watch_event','event_spectator_proxy');
  });
  recordCase('Every digital mode clamps minted rights to a finite verified receipt expiry and rejects infinite receipt facts', () => {
    for (const kind of Object.keys(modes).filter(kind=>kind!=='physical_merch')) {
      const context = setup(kind);q(`update sandbox_commerce_v1.receipts set expires_at=clock_timestamp()+interval '10 minutes' where id='${context.receiptId}';`);
      const result = settle(context.receiptId);
      assert.equal(q(`select g.expires_at=r.expires_at from sandbox_commerce_v1.resource_grants g
        join sandbox_commerce_v1.receipts r on r.id=g.receipt_id where g.id='${result.grantId}';`), 't');
    }
    const context = video(purchase('paid_content'));
    q(`update sandbox_commerce_v1.receipts set purchased_at='-infinity' where id='${context.receiptId}';`);
    rejected(`select sandbox_commerce_v1.settle_resource_receipt('${context.receiptId}');`, /sandbox_exact_non_tip_receipt_required/u);
    q(`update sandbox_commerce_v1.receipts set purchased_at=clock_timestamp()-interval '1 second',expires_at='infinity' where id='${context.receiptId}';`);
    rejected(`select sandbox_commerce_v1.settle_resource_receipt('${context.receiptId}');`, /sandbox_exact_non_tip_receipt_required/u);
  });
  recordCase('A shortened receipt expiry caps current issuance and expiry rejects without rewriting the immutable grant', () => {
    const context = video(purchase('paid_content'));const result = settle(context.receiptId);
    const original = q(`select expires_at from sandbox_commerce_v1.resource_grants where id='${result.grantId}';`);
    q(`update sandbox_commerce_v1.receipts set expires_at=clock_timestamp()+interval '3 seconds' where id='${context.receiptId}';`);
    const expiresMs = Number(q(`select floor(extract(epoch from expires_at)*1000) from sandbox_commerce_v1.receipts where id='${context.receiptId}';`));
    assert.equal(allowed(context,'play_video','media_signer').binding.expiresAtMs, expiresMs);
    assert.equal(q(`select expires_at from sandbox_commerce_v1.resource_grants where id='${result.grantId}';`), original);
    q(`update sandbox_commerce_v1.receipts set expires_at=clock_timestamp()-interval '1 millisecond' where id='${context.receiptId}';`);
    rejected(deliverySql(context.resourceId,context.resourceId,'play_video'), /sandbox_current_exact_resource_grant_required/u);
  });
  recordCase('Retained paid rights survive creator Premium loss and generation retirement but current buyer identity remains exact', () => {
    const context = video(purchase('paid_content')); settle(context.receiptId);
    q(`delete from public.user_entitlements where user_id='${SELLER}';delete from auth.sessions where user_id='${SELLER}';update sandbox_commerce_v1.lifecycle set state='retired';
      update sandbox_commerce_v1.resources set status='retired' where id='${context.resourceId}';`);
    allowed(context, 'play_video', 'media_signer');
    rejected(deliverySql(context.resourceId, context.resourceId, 'play_video', SELLER, SELLER_SESSION));
    rejected(deliverySql(context.resourceId, context.resourceId, 'play_video', BUYER, SELLER_SESSION));
    q(`update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${BUYER_SESSION}';`);
    rejected(deliverySql(context.resourceId, context.resourceId, 'play_video'));
  });
  for (const [label, change] of [
    ['creator account ban', `update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='${SELLER}';`],
    ['viewer block', `insert into public.channel_audience_blocks values('${SELLER}','${BUYER}');`],
    ['creator legal invalidation', `update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where user_id='${SELLER}';`],
    ['creator moderation hold', `insert into public.wave1_creator_eligibility(creator_user_id,moderation_state) values('${SELLER}','HELD');`],
  ]) recordCase(`Retained rights still enforce ${label}`, () => {
    const context = video(purchase('paid_content')); settle(context.receiptId); q(change);
    rejected(deliverySql(context.resourceId, context.resourceId, 'play_video'));
  });
  for (const receiptState of ['refunded', 'revoked', 'quarantined']) recordCase(`A ${receiptState} exact receipt immediately blocks retained media delivery`, () => {
    const context = video(purchase('paid_content')); settle(context.receiptId);
    q(`update sandbox_commerce_v1.receipts set state='${receiptState}' where id='${context.receiptId}';`);
    rejected(deliverySql(context.resourceId, context.resourceId, 'play_video'));
  });
  recordCase('Revocation, moderation, deletion and exact receipt holds revoke delivery independently', () => {
    const context = video(purchase('paid_content')); const result = settle(context.receiptId);
    q(`update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where id='${result.grantId}';`);
    rejected(deliverySql(context.resourceId, context.resourceId, 'play_video'));
    rejected(`update sandbox_commerce_v1.resource_grants set revoked_at=null where id='${result.grantId}';`, /lifecycle_reversal/u);
    const held = video(purchase('paid_content')); settle(held.receiptId);
    q(`insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason) values('${BUYER}','${held.receiptId}','synthetic provider hold');`);
    rejected(deliverySql(held.resourceId, held.resourceId, 'play_video'));
    q('update sandbox_commerce_v1.resource_delivery_holds set resolved_at=clock_timestamp();');
    rejected('update sandbox_commerce_v1.resource_delivery_holds set resolved_at=null;', /lifecycle_reversal/u);
    q(`update sandbox_commerce_v1.delivery_assets set state='quarantined' where id='${held.assetId}';`);
    rejected(deliverySql(held.resourceId, held.resourceId, 'play_video'));
    q(`update sandbox_commerce_v1.delivery_assets set state='deleted',moderation='removed' where id='${held.assetId}';`);
    rejected(`update sandbox_commerce_v1.delivery_assets set state='retained',moderation='clear' where id='${held.assetId}';`, /lifecycle_reversal/u);
  });
  recordCase('Subscriptions cannot include VIP-only content and VIP terms cannot exceed thirty days', () => {
    const context = member('channel_subscription', { audience: 'vip' }); settle(context.receiptId);
    rejected(deliverySql(context.resourceId, context.targetId, 'play_video'));
    const vip = member('vip_pass', { duration: 31 * 86400 });
    rejected(`select sandbox_commerce_v1.settle_resource_receipt('${vip.receiptId}');`);
  });
  recordCase('Finite room grants expire by actual database time without rewriting immutable terms', () => {
    const context = room(purchase('live_watch_party_access'), { end: "clock_timestamp()+interval '2 seconds'" });
    settle(context.receiptId); allowed(context, 'join_room', 'room_admission');
    q('select pg_sleep(2.1);');
    rejected(deliverySql(context.resourceId, context.resourceId, 'join_room'));
  });
  recordCase('Room admission has bounded capacity and same-account rejoin does not allocate another place', () => {
    const context = room(purchase('live_watch_party_access'), { capacity: 1 }); settle(context.receiptId);
    allowed(context, 'join_room', 'room_admission'); allowed(context, 'join_room', 'room_admission');
    assert.equal(q('select count(*) from sandbox_commerce_v1.room_admissions;'), '1');
    const second = addBuyer(), secondReceipt = anotherReceipt(context, second.user, second.session); settle(secondReceipt.receiptId);
    rejected(deliverySql(context.resourceId, context.resourceId, 'join_room', second.user, second.session));
    q(`update sandbox_commerce_v1.room_terms set state='ended' where resource_id='${context.resourceId}';`);
    rejected(deliverySql(context.resourceId, context.resourceId, 'join_room'));
  });
  recordCase('Paid seats require an independent admitted entry and never confer publishing or host authority', () => {
    const context = seatProduct(); settle(context.receiptId);
    rejected(deliverySql(context.resourceId, context.targetId, 'request_seat'));
    settle(context.entry.receiptId); allowed(context.entry, 'join_room', 'room_admission');
    allowed(context, 'request_seat', 'seat_request');
    q('update sandbox_commerce_v1.room_seats set host_approved=true;');
    const result = allowed(context, 'request_seat', 'seat_request'); assert.equal(result.publishAllowed, false);
    rejected(deliverySql(context.resourceId, context.targetId, 'publish_room_media'));
  });
  recordCase('Paid-seat eligibility independently binds the entry session, terminal state and shortened receipt deadline', () => {
    const context = seatProduct();settle(context.entry.receiptId);allowed(context.entry,'join_room','room_admission');settle(context.receiptId);
    const session = randomUUID();q(`insert into auth.sessions values('${session}','${BUYER}',clock_timestamp()+interval '1 hour');
      insert into public.wave1_legal_acceptances select '${BUYER}','${session}',document_key,version,market,capability,'member',null
      from public.wave1_legal_document_versions where capability='account';`);
    rejected(deliverySql(context.resourceId,context.targetId,'request_seat',BUYER,session), /sandbox_separate_current_room_entry_required/u);
    allowed(context.entry,'join_room','room_admission',BUYER,session);
    q(`update sandbox_commerce_v1.receipts set expires_at=clock_timestamp()+interval '3 seconds' where id='${context.entry.receiptId}';`);
    const expiresMs = Number(q(`select floor(extract(epoch from expires_at)*1000) from sandbox_commerce_v1.receipts where id='${context.entry.receiptId}';`));
    assert.equal(allowed(context,'request_seat','seat_request',BUYER,session).binding.expiresAtMs,expiresMs);
    q(`update sandbox_commerce_v1.receipts set expires_at=clock_timestamp()-interval '1 millisecond' where id='${context.entry.receiptId}';`);
    rejected(deliverySql(context.resourceId,context.targetId,'request_seat',BUYER,session), /sandbox_separate_current_room_entry_required/u);
    for (const state of ['refunded','quarantined']) {
      const other = seatProduct();settle(other.entry.receiptId);allowed(other.entry,'join_room','room_admission');settle(other.receiptId);
      q(`update sandbox_commerce_v1.receipts set state='${state}' where id='${other.entry.receiptId}';`);
      rejected(deliverySql(other.resourceId,other.targetId,'request_seat'), /sandbox_separate_current_room_entry_required/u);
      assert.equal(q(`select state from sandbox_commerce_v1.receipts where id='${other.receiptId}';`), 'verified');
    }
  });
  recordCase('Ended rooms, revoked admissions and released seats cannot be reopened', () => {
    const context = seatProduct(); settle(context.entry.receiptId); allowed(context.entry, 'join_room', 'room_admission');
    settle(context.receiptId); allowed(context, 'request_seat', 'seat_request');
    q(`update sandbox_commerce_v1.room_terms set state='ended' where resource_id='${context.targetId}';
      update sandbox_commerce_v1.room_admissions set revoked_at=clock_timestamp();update sandbox_commerce_v1.room_seats set state='released';`);
    rejected(`update sandbox_commerce_v1.room_terms set state='open' where resource_id='${context.targetId}';`, /lifecycle_reversal/u);
    rejected('update sandbox_commerce_v1.room_admissions set revoked_at=null;', /lifecycle_reversal/u);
    rejected("update sandbox_commerce_v1.room_seats set state='reserved';", /lifecycle_reversal/u);
    rejected(deliverySql(context.resourceId, context.targetId, 'request_seat'));
  });
  recordCase('Event replay requires purchased replay permission, finite replay terms and exact scanned output', () => {
    const context = event(purchase('event'), { replay: true, state: 'replay' }); settle(context.receiptId);
    allowed(context, 'watch_event', 'event_spectator_proxy');
    q(`update sandbox_commerce_v1.delivery_assets set moderation='held' where id='${context.replayAsset.assetId}';`);
    rejected(deliverySql(context.resourceId, context.resourceId, 'watch_event'));
    const noReplay = event(purchase('event'), { state: 'replay' }); settle(noReplay.receiptId);
    rejected(deliverySql(noReplay.resourceId, noReplay.resourceId, 'watch_event'));
  });
  recordCase('Event and output lifecycle moves forward only and ended replay cannot resume', () => {
    const context = event(purchase('event'), { replay: true }); settle(context.receiptId);
    rejected(`update sandbox_commerce_v1.event_terms set state='scheduled' where resource_id='${context.resourceId}';`, /lifecycle_reversal/u);
    q(`update sandbox_commerce_v1.event_terms set state='replay' where resource_id='${context.resourceId}';`);
    allowed(context, 'watch_event', 'event_spectator_proxy');
    rejected(`update sandbox_commerce_v1.event_terms set state='live' where resource_id='${context.resourceId}';`, /lifecycle_reversal/u);
    q(`update sandbox_commerce_v1.event_terms set state='ended' where resource_id='${context.resourceId}';
      update sandbox_commerce_v1.event_outputs set state='ended' where resource_id='${context.resourceId}';`);
    rejected(`update sandbox_commerce_v1.event_terms set state='replay' where resource_id='${context.resourceId}';`, /lifecycle_reversal/u);
    rejected(`update sandbox_commerce_v1.event_outputs set state='active' where resource_id='${context.resourceId}';`, /lifecycle_reversal/u);
    rejected(deliverySql(context.resourceId, context.resourceId, 'watch_event'));
  });
  recordCase('Auction settlement requires the exact winner and unexpired claim and cannot duplicate its lot', () => {
    const wrong = auction('event_auction', { winner: SELLER }); rejected(`select sandbox_commerce_v1.settle_resource_receipt('${wrong.receiptId}');`);
    const late = auction('event_auction', { deadline: "clock_timestamp()-interval '1 second'" }); rejected(`select sandbox_commerce_v1.settle_resource_receipt('${late.receiptId}');`);
    const context = auction('event_auction'); const first = settle(context.receiptId);
    assert.equal(settle(context.receiptId).grantId, first.grantId); assert.equal(q(`select count(*) from sandbox_commerce_v1.auction_claims where lot_id='${context.lotId}';`), '1');
    const duplicate = anotherReceipt(context); rejected(`select sandbox_commerce_v1.settle_resource_receipt('${duplicate.receiptId}');`);
  });
  recordCase('Test-only merch reserves finite stock idempotently and never creates access or shipment', () => {
    const context = merch(1); const first = settle(context.receiptId);
    assert.equal(settle(context.receiptId).orderId, first.orderId);
    assert.equal(q(`select reserved from sandbox_commerce_v1.merch_variants where id='${context.variantId}';`), '1');
    const duplicate = anotherReceipt(context); rejected(`select sandbox_commerce_v1.settle_resource_receipt('${duplicate.receiptId}');`);
    assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'), '0');
    assert.equal(q('select count(*) from sandbox_commerce_v1.merch_orders where shipment_dispatched;'), '0');
    allowed(context, 'read_test_order', 'order_reader');
  });
  recordCase('Confirmed merch refund releases inventory exactly once; unknown outcomes cannot release stock', () => {
    const context = merch(1); settle(context.receiptId);
    rejected(`select sandbox_commerce_v1.release_resource_order('${context.receiptId}');`);
    assert.equal(q(`select reserved from sandbox_commerce_v1.merch_variants where id='${context.variantId}';`), '1');
    q(`update sandbox_commerce_v1.receipts set state='refunded' where id='${context.receiptId}';`);
    for (let index = 0; index < 2; index++) assert.equal(parse(`select sandbox_commerce_v1.release_resource_order('${context.receiptId}');`).status, 'released');
    assert.equal(q(`select reserved from sandbox_commerce_v1.merch_variants where id='${context.variantId}';`), '0');
    assert.equal(allowed(context, 'read_test_order', 'order_reader').details.receiptStatus, 'refunded');
  });
  recordCase('Disabled inclusion, canceled auction and terminal inventory order cannot reverse', () => {
    const membership = member('channel_subscription'); settle(membership.receiptId);
    q(`update sandbox_commerce_v1.membership_inclusions set active=false where product_id='${membership.resourceId}';`);
    rejected('update sandbox_commerce_v1.membership_inclusions set active=true;', /lifecycle_reversal/u);
    rejected(deliverySql(membership.resourceId, membership.targetId, 'play_video'));
    const award = auction('event_auction'); settle(award.receiptId);
    q(`update sandbox_commerce_v1.auction_terms set state='canceled' where resource_id='${award.resourceId}';`);
    rejected("update sandbox_commerce_v1.auction_terms set state='awarded';", /lifecycle_reversal/u);
    const order = merch(); settle(order.receiptId);
    q(`update sandbox_commerce_v1.receipts set state='refunded' where id='${order.receiptId}';
      select sandbox_commerce_v1.release_resource_order('${order.receiptId}');
      update sandbox_commerce_v1.merch_variants set state='retired' where id='${order.variantId}';`);
    rejected("update sandbox_commerce_v1.merch_orders set state='reserved';", /lifecycle_reversal/u);
    rejected("update sandbox_commerce_v1.merch_variants set state='active';", /lifecycle_reversal/u);
  });

  const concurrencyEvidence = [];
  const heldTransaction = async (firstSql, competingSql, afterCommitSql, label) => {
    const child = spawn(path.join(bin, 'psql'), args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const done = new Promise(resolve => child.on('close', resolve));
    try {
      child.stdin.write(`begin;set idle_in_transaction_session_timeout='8s';${firstSql}select 'RESOURCE_LOCK_HELD';\n`);
      const deadline = Date.now() + 5000;
      while (!stdout.includes('RESOURCE_LOCK_HELD') && child.exitCode === null && Date.now() < deadline) await delay(10);
      assert.ok(stdout.includes('RESOURCE_LOCK_HELD'), `First local transaction did not reach held fence: ${stderr}`);
      const began = Date.now(); rejected(competingSql, /lock|sandbox|capacity|inventory/iu);
      const waitedMs = Date.now() - began; assert.ok(waitedMs < 2000, 'NOWAIT conflict unexpectedly blocked');
      child.stdin.end('commit;\n'); assert.equal(await done, 0, stderr);
      rejected(afterCommitSql);
      concurrencyEvidence.push({ case: label, competingRejectionMs: waitedMs, committedFirstOwner: true, loserRemainsRejected: true });
    } finally {
      if (child.exitCode === null) { child.stdin.end('rollback;\n'); child.kill('SIGTERM'); await done; }
      assert.notEqual(child.exitCode, null, 'Local transaction session must close');
    }
  };
  reset();
  {
    const context = room(purchase('live_watch_party_access'), { capacity: 1 }); settle(context.receiptId);
    const second = addBuyer(), secondReceipt = anotherReceipt(context, second.user, second.session); settle(secondReceipt.receiptId);
    const firstSql = deliverySql(context.resourceId, context.resourceId, 'join_room');
    const secondSql = deliverySql(context.resourceId, context.resourceId, 'join_room', second.user, second.session);
    await heldTransaction(firstSql, secondSql, secondSql, 'last room place');
    assert.equal(q('select count(*) from sandbox_commerce_v1.room_admissions;'), '1');
    cases.push('Concurrent requests cannot oversubscribe the last room place; loser fails NOWAIT then capacity');
  }
  reset();
  {
    const context = room(purchase('live_watch_party_access'));settle(context.receiptId);allowed(context, 'join_room', 'room_admission');
    const read = deliverySql(context.resourceId, context.resourceId, 'join_room');
    await heldTransaction(`update sandbox_commerce_v1.room_admissions set revoked_at=clock_timestamp()
      where room_id='${context.resourceId}' and buyer_id='${BUYER}';`, read, read, 'existing admission revocation');
    assert.equal(q('select count(*) from sandbox_commerce_v1.room_admissions where revoked_at is not null;'), '1');
    cases.push('An in-flight child admission revocation rejects rejoin NOWAIT and remains revoked after commit');
  }
  reset();
  {
    const context = seatProduct();settle(context.entry.receiptId);allowed(context.entry, 'join_room', 'room_admission');
    settle(context.receiptId);allowed(context, 'request_seat', 'seat_request');
    const read = deliverySql(context.resourceId, context.targetId, 'request_seat');
    await heldTransaction(`update sandbox_commerce_v1.room_seats set state='released'
      where room_id='${context.targetId}' and buyer_id='${BUYER}';`, read, read, 'existing paid seat release');
    assert.equal(q("select count(*) from sandbox_commerce_v1.room_seats where state='released';"), '1');
    cases.push('An in-flight child seat release rejects eligibility NOWAIT and remains released after commit');
  }
  reset();
  {
    const context = seatProduct();settle(context.entry.receiptId);allowed(context.entry,'join_room','room_admission');settle(context.receiptId);
    const second = addBuyer(), entryReceipt = anotherReceipt(context.entry,second.user,second.session), seatReceipt = anotherReceipt(context,second.user,second.session);
    settle(entryReceipt.receiptId);allowed(context.entry,'join_room','room_admission',second.user,second.session);settle(seatReceipt.receiptId);
    const firstSql = deliverySql(context.resourceId,context.targetId,'request_seat');
    const secondSql = deliverySql(context.resourceId,context.targetId,'request_seat',second.user,second.session);
    await heldTransaction(firstSql,secondSql,secondSql,'last paid room seat');
    assert.equal(q("select count(*) from sandbox_commerce_v1.room_seats where state='reserved';"), '1');
    cases.push('Concurrent independently admitted buyers cannot reserve the same final paid seat');
  }
  reset();
  {
    const context = merch(1), second = anotherReceipt(context);
    const firstSql = `select sandbox_commerce_v1.settle_resource_receipt('${context.receiptId}');`;
    const secondSql = `select sandbox_commerce_v1.settle_resource_receipt('${second.receiptId}');`;
    await heldTransaction(firstSql, secondSql, secondSql, 'last merch unit');
    assert.equal(q('select count(*) from sandbox_commerce_v1.merch_orders;'), '1');
    cases.push('Concurrent receipt settlement cannot reserve the last merch unit twice');
  }
  assert.equal(q("select string_agg(state,',' order by key) from public.platform_money_kill_switches;"), 'off,off,off');
  assert.equal(q(`select count(*) from public.access_grants where user_id='${BUYER}';`), '0');
  return { cases, concurrencyEvidence };
}
