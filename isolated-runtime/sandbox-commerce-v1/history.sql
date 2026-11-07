-- Install AFTER receipts.sql and BEFORE permissions-finalize.sql, in the same
-- disabled-generation transaction. New owned read/recovery APIs only; no
-- provider invocation, legacy write, financial authority or access grant.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.intent_abandonments (
  intent_id uuid primary key references sandbox_commerce_v1.intents(id),
  buyer_id uuid not null, original_request_id uuid not null,
  original_session_id uuid not null, abandoned_by_session_id uuid not null,
  abandoned_at timestamptz not null default clock_timestamp()
);
alter table sandbox_commerce_v1.intent_abandonments enable row level security;
alter table sandbox_commerce_v1.intent_abandonments force row level security;
create policy core_owner on sandbox_commerce_v1.intent_abandonments
  for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.intent_abandonments from public,anon,authenticated,service_role;
create index intents_buyer_history on sandbox_commerce_v1.intents(buyer_id,created_at desc,id desc);
create index intents_creator_history on sandbox_commerce_v1.intents(creator_id,created_at desc,id desc);
create index resources_creator_history on sandbox_commerce_v1.resources(creator_id,created_at desc,id desc);
create index offers_resource_history on sandbox_commerce_v1.offers(resource_id,created_at desc,id desc);
reset role;

-- Keep the privileged read projection narrow. Creation under the fresh role
-- avoids existing-owner default ACLs; transfer ownership only after closing it.
-- All authority fences are acquired OUTSIDE the exception subtransaction, so
-- an ineligible creator response does not silently discard its read fences.
set local role sbx_v1_authority_owner;
create function sandbox_commerce_v1.creator_capability_read(p_user uuid,p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path='' set row_security=off as $$
declare a jsonb; reason text; message text; premium_until timestamptz;
begin
  lock table auth.sessions,auth.users,public.account_deletion_requests,public.user_profiles,
    public.wave1_legal_acceptances,public.wave1_legal_document_versions,
    public.platform_money_kill_switches,public.access_grants,public.creator_payout_accounts,
    public.creator_payout_eligibility_records,public.monetization_products,public.provider_events,
    public.revenuecat_consumable_transaction_intents,public.revenuecat_premium_transaction_authority,
    public.revenuecat_terminal_authority_quarantine_resolutions,public.revenuecat_terminal_authority_quarantines,
    public.revenuecat_unbound_initial_authority,public.revenuecat_unbound_terminal_authority,
    public.user_entitlements,public.wave1_creator_eligibility,sandbox_commerce_v1.declarations
    in share mode nowait;
  begin
    a:=sandbox_commerce_v1.assert_authority(p_user,p_session,'creator');
    if clock_timestamp()>=(a->>'valid_until')::timestamptz then
      raise exception 'sandbox_authority_expired' using errcode='42501';end if;
    return jsonb_build_object('eligible',true,'reason','eligible','validUntil',a->'valid_until');
  exception when insufficient_privilege then
    get stacked diagnostics message=message_text;
    if message in ('sandbox_creator_authority_required','sandbox_current_legal_required') then
      premium_until:=sandbox_commerce_v1.premium_valid_until(p_user,clock_timestamp());
      reason:=case when premium_until is null or premium_until<=clock_timestamp()
        then 'premium_required' when message='sandbox_current_legal_required'
        then 'creator_legal_required' else 'creator_eligibility_required' end;
    elsif message='sandbox_current_account_required' then reason:='creator_restricted';
    elsif message='sandbox_financial_controls_required' then reason:='financial_controls_unavailable';
    else raise; end if;
  end;
  return jsonb_build_object('eligible',false,'reason',reason,'validUntil',null);
end; $$;
revoke all on function sandbox_commerce_v1.creator_capability_read(uuid,uuid)
  from public,anon,authenticated,service_role,sbx_v1_core_owner;
reset role;
alter function sandbox_commerce_v1.creator_capability_read(uuid,uuid) owner to postgres;
grant execute on function sandbox_commerce_v1.creator_capability_read(uuid,uuid) to sbx_v1_core_owner;

set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.history_declaration(p_user uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('declared18Plus',declared_18_plus,'countryCode',country_code,
    'regionCode',region_code,'declarationVersion',declaration_version,'updatedAt',updated_at,'sessionId',session_id)
  from sandbox_commerce_v1.declarations where user_id=p_user;
$$;
create function sandbox_commerce_v1.history_offer(p_offer uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id','scv1_offer_'||o.id,'resourceId','scv1_resource_'||r.id,
    'creatorId',r.creator_id,'kind',r.kind,'title',r.title,'revision',o.revision,
    'resourceRevision',o.resource_revision,'status',o.status,'amountMinor',c.amount_minor,
    'currency',c.currency,'createdAt',o.created_at,
    'available',o.status='published' and r.status='published' and o.resource_revision=r.revision,
    'checkoutConnected',false)
  from sandbox_commerce_v1.offers o join sandbox_commerce_v1.resources r on r.id=o.resource_id
  join sandbox_commerce_v1.catalog c on c.id=o.catalog_id where o.id=p_offer;
$$;
-- One bounded page, shared by studio previews and explicit owner continuation.
-- A lookahead row proves truncation without counting or aggregating the tail.
create function sandbox_commerce_v1.history_offer_page(p_resource uuid,p_as_of timestamptz,
  p_cursor_at timestamptz,p_cursor_id uuid,p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare row_value record; items jsonb:='[]'::jsonb; last_cursor jsonb:=null;
  next_cursor jsonb:=null; counter integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>50 or p_as_of is null or not isfinite(p_as_of)
  then raise exception 'sandbox_page_invalid' using errcode='22023';end if;
  for row_value in select o.id,o.created_at from sandbox_commerce_v1.offers o
    where o.resource_id=p_resource and o.created_at<=p_as_of
      and (p_cursor_id is null or (o.created_at,o.id)<(p_cursor_at,p_cursor_id))
    order by o.created_at desc,o.id desc limit p_limit+1 loop
    counter:=counter+1;if counter>p_limit then next_cursor:=last_cursor;exit;end if;
    items:=items||jsonb_build_array(sandbox_commerce_v1.history_offer(row_value.id));
    last_cursor:=jsonb_build_object('asOf',p_as_of,'createdAt',row_value.created_at,'id',row_value.id);
  end loop;
  return jsonb_build_object('resourceId','scv1_resource_'||p_resource,'offers',items,'nextCursor',next_cursor);
end; $$;
create function sandbox_commerce_v1.history_resource(p_resource uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select sandbox_commerce_v1.resource_json(r)||jsonb_build_object('title',r.title,'createdAt',r.created_at,
    'offers',page.value->'offers','offersNextCursor',page.value->'nextCursor',
    'offersTruncated',page.value->'nextCursor'<>'null'::jsonb)
  from sandbox_commerce_v1.resources r
  cross join lateral sandbox_commerce_v1.history_offer_page(r.id,statement_timestamp(),null,null,10) as page(value)
  where r.id=p_resource;
$$;
create function sandbox_commerce_v1.history_abandonment(p_intent uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('intentId','scv1_intent_'||intent_id,'originalRequestId',original_request_id,
    'originalSessionId',original_session_id,'abandonedBySessionId',abandoned_by_session_id,
    'abandonedAt',abandoned_at,'proof','undispatched_tombstone')
  from sandbox_commerce_v1.intent_abandonments where intent_id=p_intent;
$$;
create function sandbox_commerce_v1.history_attempt(p_intent uuid,p_current_session uuid,p_user uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id','scv1_intent_'||i.id,'offerId','scv1_offer_'||i.offer_id,
    'offerRevision',i.offer_revision,'resourceId','scv1_resource_'||i.resource_id,
    'resourceRevision',i.resource_revision,'creatorId',i.creator_id,'kind',i.kind,
    'amountMinor',i.amount_minor,'currency',i.currency,
    'status',case when b.intent_id is not null then 'abandoned'
      when i.state='prepared' and i.expires_at<=clock_timestamp() then 'expired' else i.state end,
    'createdAt',i.created_at,'expiresAt',i.expires_at,
    'originalSessionMatchesCurrent',i.buyer_id=p_user and i.buyer_session_id=p_current_session,
    'dispatchState',coalesce(a.state,'not_recorded'),
    'receipt',(select jsonb_build_object('id','scv1_receipt_'||r.id,'intentId','scv1_intent_'||i.id,
      'status',r.state,'receiptType','provider_verified','purchasedAt',r.purchased_at,
      'amountMinor',i.amount_minor,'currency',i.currency,'grantsAccess',false,'notPayable',true)
      from sandbox_commerce_v1.receipts r where r.intent_id=i.id order by r.purchased_at desc,r.id desc limit 1),
    'abandonment',case when i.buyer_id=p_user then sandbox_commerce_v1.history_abandonment(i.id) else null end,
    'providerDispatchAllowed',false,'noDispatchProven',i.buyer_id=p_user and b.intent_id is not null)
  from sandbox_commerce_v1.intents i
  left join sandbox_commerce_v1.dispatch_attempts a on a.intent_id=i.id
  left join sandbox_commerce_v1.intent_abandonments b on b.intent_id=i.id where i.id=p_intent;
$$;

create function sandbox_commerce_v1.tip_history_command(p_command text,p_payload jsonb,
  p_expected_account_id uuid,p_expected_session_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  uid uuid; sid uuid; v_request_id uuid; original_id uuid; authority jsonb; capability jsonb;
  state text; allowed text[]; body jsonb; result jsonb; prior sandbox_commerce_v1.requests;
  original sandbox_commerce_v1.requests; i sandbox_commerce_v1.intents; o sandbox_commerce_v1.offers;
  resource sandbox_commerce_v1.resources; target uuid; found_target uuid;
  mutation boolean:=p_command in ('offer.retire','checkout.abandon'); busy boolean:=false;
  cursor_value jsonb; as_of timestamptz; cursor_at timestamptz; cursor_id uuid;
  page_limit integer; counter integer:=0; row_value record; items jsonb:='[]'::jsonb;
  next_cursor jsonb:=null; last_cursor jsonb:=null; more boolean:=false;
begin
  if claims->>'role' is distinct from 'authenticated' or claims->>'sub' is null
    or claims->>'session_id' is null or p_expected_account_id is null or p_expected_session_generation is null
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16384
    or p_payload->>'protocol' is distinct from 'sandbox-commerce-v1'
    or p_command is null or p_command not in ('capability.read','studio.read','offers.read','offer.read','history.read',
      'status.read','request.read','offer.retire','checkout.abandon')
  then raise exception 'sandbox_request_context_invalid' using errcode='42501'; end if;
  uid:=(claims->>'sub')::uuid;sid:=(claims->>'session_id')::uuid;v_request_id:=(p_payload->>'requestId')::uuid;
  if uid is distinct from p_expected_account_id or sid is distinct from p_expected_session_generation or v_request_id is null
  then raise exception 'sandbox_account_binding_invalid' using errcode='42501'; end if;
  allowed:=array['protocol','requestId']||case p_command
    when 'capability.read' then array[]::text[] when 'studio.read' then array['cursor','limit']
    when 'offers.read' then array['resourceId','cursor','limit']
    when 'offer.read' then array['offerId'] when 'history.read' then array['role','cursor','limit']
    when 'status.read' then array['intentId','receiptId'] when 'request.read' then array['originalRequestId']
    when 'offer.retire' then array['offerId','expectedRevision']
    when 'checkout.abandon' then array['intentId','originalRequestId'] end;
  if not(p_payload ?& allowed) or p_payload-allowed<>'{}'::jsonb
    or jsonb_typeof(p_payload->'requestId') is distinct from 'string'
    or p_payload->>'requestId'<>v_request_id::text
  then raise exception 'sandbox_command_payload_invalid' using errcode='22023'; end if;
  perform sandbox_commerce_v1.assert_generation(false);
  if mutation and not pg_try_advisory_xact_lock(hashtextextended('sandbox-commerce-v1:'||uid||':'||v_request_id,683))
  then raise exception 'sandbox_request_busy' using errcode='55P03'; end if;
  authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
  select l.state into strict state from sandbox_commerce_v1.lifecycle l where singleton;
  if mutation then
    select * into prior from sandbox_commerce_v1.requests r where r.user_id=uid and r.request_id=v_request_id;
    if found and (prior.command is distinct from p_command or prior.payload is distinct from p_payload)
    then raise exception 'sandbox_idempotency_conflict' using errcode='22023'; end if;
  end if;

  if p_command in ('studio.read','offers.read','history.read') then
    if jsonb_typeof(p_payload->'limit') is distinct from 'number' or p_payload->>'limit'!~'^[1-9][0-9]?$'
      or (p_payload->>'limit')::integer>50
      or (p_command='history.read' and (jsonb_typeof(p_payload->'role') is distinct from 'string'
        or p_payload->>'role' not in ('buyer','creator')))
    then raise exception 'sandbox_page_invalid' using errcode='22023'; end if;
    page_limit:=(p_payload->>'limit')::integer;cursor_value:=p_payload->'cursor';
    if cursor_value='null'::jsonb then as_of:=clock_timestamp();
    else
      if jsonb_typeof(cursor_value)<>'object' or not(cursor_value ?& array['asOf','createdAt','id'])
        or cursor_value-array['asOf','createdAt','id']<>'{}'::jsonb
        or jsonb_typeof(cursor_value->'asOf') is distinct from 'string'
        or jsonb_typeof(cursor_value->'createdAt') is distinct from 'string'
        or jsonb_typeof(cursor_value->'id') is distinct from 'string'
      then raise exception 'sandbox_page_invalid' using errcode='22023'; end if;
      as_of:=(cursor_value->>'asOf')::timestamptz;cursor_at:=(cursor_value->>'createdAt')::timestamptz;
      cursor_id:=(cursor_value->>'id')::uuid;
      if not isfinite(as_of) or not isfinite(cursor_at) or cursor_id is null
        or cursor_value->>'id'<>cursor_id::text or cursor_at>as_of or as_of>clock_timestamp()
      then raise exception 'sandbox_page_invalid' using errcode='22023'; end if;
    end if;
  end if;

  if p_command='capability.read' then
    capability:=sandbox_commerce_v1.creator_capability_read(uid,sid);
    if capability->>'validUntil' is not null and clock_timestamp()>=(capability->>'validUntil')::timestamptz
    then raise exception 'sandbox_authority_expired' using errcode='42501'; end if;
    body:=jsonb_build_object('generationState',state,'canAuthor',state='active' and (capability->>'eligible')::boolean,
      'creatorEligible',(capability->>'eligible')::boolean,'creatorReason',capability->>'reason',
      'canReadHistory',true,'canRetireOwnOffers',true,'checkoutConnected',false,
      'declaration',sandbox_commerce_v1.history_declaration(uid));
  elsif p_command='studio.read' then
    for row_value in select r.id,r.created_at from sandbox_commerce_v1.resources r
      where r.creator_id=uid and r.created_at<=as_of
        and (cursor_id is null or (r.created_at,r.id)<(cursor_at,cursor_id))
      order by r.created_at desc,r.id desc limit page_limit+1 loop
      counter:=counter+1;if counter>page_limit then more:=true;exit;end if;
      items:=items||jsonb_build_array(sandbox_commerce_v1.history_resource(row_value.id));
      last_cursor:=jsonb_build_object('asOf',as_of,'createdAt',row_value.created_at,'id',row_value.id);
    end loop;
    if more then next_cursor:=last_cursor;end if;
    body:=jsonb_build_object('resources',items,'nextCursor',next_cursor,'catalog',
      coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'amountMinor',c.amount_minor,'currency',c.currency,
        'publicationAvailable',true,'checkoutConnected',false) order by c.currency,c.amount_minor)
        from (select kind,amount_minor,currency from sandbox_commerce_v1.catalog where kind='creator_tip'
          order by currency,amount_minor limit 100)c),'[]'::jsonb),
      'catalogTruncated',(select count(*)>100 from sandbox_commerce_v1.catalog where kind='creator_tip'));
  elsif p_command='offers.read' then
    if jsonb_typeof(p_payload->'resourceId') is distinct from 'string'
    then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
    target:=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource');
    select * into resource from sandbox_commerce_v1.resources where id=target and creator_id=uid;
    if resource.id is null then raise exception 'sandbox_resource_unavailable' using errcode='42501';end if;
    body:=sandbox_commerce_v1.history_offer_page(resource.id,as_of,cursor_at,cursor_id,page_limit);
  elsif p_command in ('offer.read','offer.retire') then
    if jsonb_typeof(p_payload->'offerId') is distinct from 'string'
    then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
    target:=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer');
    if p_command='offer.retire' then
      select * into o from sandbox_commerce_v1.offers where id=target for update nowait;
    else select * into o from sandbox_commerce_v1.offers where id=target;end if;
    if o.id is null then raise exception 'sandbox_offer_unavailable' using errcode='42501';end if;
    select * into strict resource from sandbox_commerce_v1.resources where id=o.resource_id;
    if p_command='offer.retire' then
      if resource.creator_id<>uid then raise exception 'sandbox_offer_unavailable' using errcode='42501';end if;
      if jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number'
        or p_payload->>'expectedRevision'!~'^[1-9][0-9]{0,14}$'
      then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
      if prior.request_id is null then
        if o.revision<>(p_payload->>'expectedRevision')::bigint
        then raise exception 'sandbox_offer_version_unavailable' using errcode='42501';end if;
        if o.status<>'retired' then
          update sandbox_commerce_v1.offers set status='retired',revision=revision+1 where id=o.id;
        end if;
      end if;
    elsif resource.creator_id<>uid and (o.status<>'published' or resource.status<>'published' or resource.revision<>o.resource_revision)
    then raise exception 'sandbox_offer_unavailable' using errcode='42501';end if;
    body:=jsonb_build_object('offer',sandbox_commerce_v1.history_offer(o.id));
  elsif p_command='history.read' then
    for row_value in select x.id,x.created_at from sandbox_commerce_v1.intents x
      where (case when p_payload->>'role'='buyer' then x.buyer_id=uid else x.creator_id=uid end)
        and x.created_at<=as_of and (cursor_id is null or (x.created_at,x.id)<(cursor_at,cursor_id))
      order by x.created_at desc,x.id desc limit page_limit+1 loop
      counter:=counter+1;if counter>page_limit then more:=true;exit;end if;
      items:=items||jsonb_build_array(sandbox_commerce_v1.history_attempt(row_value.id,sid,uid));
      last_cursor:=jsonb_build_object('asOf',as_of,'createdAt',row_value.created_at,'id',row_value.id);
    end loop;
    if more then next_cursor:=last_cursor;end if;
    body:=jsonb_build_object('role',p_payload->>'role','items',items,'nextCursor',next_cursor);
  elsif p_command='status.read' then
    if (p_payload->'intentId'='null'::jsonb)=(p_payload->'receiptId'='null'::jsonb)
      or jsonb_typeof(p_payload->'intentId') not in ('string','null')
      or jsonb_typeof(p_payload->'receiptId') not in ('string','null')
    then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
    if p_payload->'intentId'<>'null'::jsonb then target:=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent');
    else select intent_id into target from sandbox_commerce_v1.receipts
      where id=sandbox_commerce_v1.identifier(p_payload->>'receiptId','receipt');end if;
    select * into i from sandbox_commerce_v1.intents where id=target and (buyer_id=uid or creator_id=uid);
    if i.id is null then raise exception 'sandbox_history_unavailable' using errcode='42501';end if;
    body:=jsonb_build_object('entry',sandbox_commerce_v1.history_attempt(i.id,sid,uid));
  elsif p_command='request.read' then
    if jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string'
    then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
    original_id:=(p_payload->>'originalRequestId')::uuid;
    if original_id is null or p_payload->>'originalRequestId'<>original_id::text
    then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
    busy:=not pg_try_advisory_xact_lock(hashtextextended('sandbox-commerce-v1:'||uid||':'||original_id,683));
    if not busy then select * into original from sandbox_commerce_v1.requests where user_id=uid and requests.request_id=original_id;end if;
    body:=jsonb_build_object('resolution',case when busy then 'busy' when original.request_id is null then 'unknown' else 'found' end,
      'originalRequestId',original_id,'recordedCommand',original.command,'recordedSessionId',original.session_id,
      'recordedPayload',original.payload,'resource',null,'offer',null,'entry',null,'declaration',null,
      'retryAllowed',false,'noDispatchProven',false);
    if original.request_id is not null then
      if original.command='creator.declare' then body:=body||jsonb_build_object('declaration',sandbox_commerce_v1.history_declaration(uid));
      elsif original.command='resource.create' then
        target:=sandbox_commerce_v1.identifier(original.result#>>'{data,resource,id}','resource');
        select id into found_target from sandbox_commerce_v1.resources where id=target and creator_id=uid;
        body:=body||jsonb_build_object('resource',sandbox_commerce_v1.history_resource(found_target));
      elsif original.command in ('offer.publish','offer.retire') then
        target:=sandbox_commerce_v1.identifier(original.result#>>'{data,offer,id}','offer');
        select x.id into found_target from sandbox_commerce_v1.offers x join sandbox_commerce_v1.resources r on r.id=x.resource_id
          where x.id=target and r.creator_id=uid;
        body:=body||jsonb_build_object('offer',sandbox_commerce_v1.history_offer(found_target));
      elsif original.command in ('checkout.prepare','checkout.abandon') then
        target:=sandbox_commerce_v1.identifier(case when original.command='checkout.prepare'
          then original.result#>>'{data,intent,id}' else original.payload->>'intentId' end,'intent');
        select id into found_target from sandbox_commerce_v1.intents where id=target and buyer_id=uid;
        body:=body||jsonb_build_object('entry',sandbox_commerce_v1.history_attempt(found_target,sid,uid),
          'noDispatchProven',sandbox_commerce_v1.history_abandonment(found_target) is not null);
      else raise exception 'sandbox_request_recovery_unavailable' using errcode='42501';end if;
    end if;
  elsif p_command='checkout.abandon' then
    if jsonb_typeof(p_payload->'intentId') is distinct from 'string'
      or jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string'
    then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
    target:=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent');original_id:=(p_payload->>'originalRequestId')::uuid;
    if original_id is null or p_payload->>'originalRequestId'<>original_id::text
    then raise exception 'sandbox_command_payload_invalid' using errcode='22023';end if;
    -- Same exact gate and order as begin_dispatch. Ownership never changes the
    -- intent's original session, quote or provider identity.
    if not pg_try_advisory_xact_lock(hashtextextended('sandbox-dispatch:'||(p_payload->>'intentId'),683))
    then raise exception 'sandbox_dispatch_busy' using errcode='55P03';end if;
    select * into i from sandbox_commerce_v1.intents where id=target for update nowait;
    if i.id is null or i.buyer_id<>uid then raise exception 'sandbox_history_unavailable' using errcode='42501';end if;
    select * into original from sandbox_commerce_v1.requests where user_id=uid and requests.request_id=original_id;
    if original.command is distinct from 'checkout.prepare' or original.session_id is distinct from i.buyer_session_id
      or original.result#>>'{data,intent,id}' is distinct from ('scv1_intent_'||i.id)
      or original.payload->>'offerId' is distinct from ('scv1_offer_'||i.offer_id)
      or (original.payload->>'expectedRevision')::bigint is distinct from i.offer_revision
    then raise exception 'sandbox_original_request_mismatch' using errcode='42501';end if;
    if exists(select 1 from sandbox_commerce_v1.intent_abandonments where intent_id=i.id and original_request_id<>original_id)
    then raise exception 'sandbox_original_request_mismatch' using errcode='42501';end if;
    if not exists(select 1 from sandbox_commerce_v1.intent_abandonments where intent_id=i.id) then
      if i.state not in ('prepared','expired') or i.dispatch_id is not null or i.dispatched_at is not null
        or exists(select 1 from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id)
        or exists(select 1 from sandbox_commerce_v1.receipts where intent_id=i.id)
        or exists(select 1 from sandbox_commerce_v1.original_states where intent_id=i.id)
        or exists(select 1 from sandbox_commerce_v1.receipt_ingress where payload->>'intentId' in (i.id::text,'scv1_intent_'||i.id))
      then raise exception 'sandbox_undispatched_abandonment_unavailable' using errcode='42501';end if;
      insert into sandbox_commerce_v1.intent_abandonments(intent_id,buyer_id,original_request_id,original_session_id,abandoned_by_session_id)
        values(i.id,uid,original_id,i.buyer_session_id,sid);
      update sandbox_commerce_v1.intents set state='failed' where id=i.id;
    end if;
    body:=jsonb_build_object('entry',sandbox_commerce_v1.history_attempt(i.id,sid,uid),
      'abandonment',sandbox_commerce_v1.history_abandonment(i.id),'noDispatchProven',true,'replacementAllowed',true,'retryAllowed',false);
  end if;

  perform sandbox_commerce_v1.assert_fresh(authority);
  if capability->>'validUntil' is not null and clock_timestamp()>=(capability->>'validUntil')::timestamptz
  then raise exception 'sandbox_authority_expired' using errcode='42501';end if;
  result:=jsonb_build_object('protocol','sandbox-commerce-v1','environment','sandbox','command',p_command,
    'requestId',v_request_id,'actor',jsonb_build_object('userId',uid,'accountId',uid,'sessionGeneration',sid),'status','ok','data',body);
  if mutation and prior.request_id is null then
    insert into sandbox_commerce_v1.requests(user_id,request_id,session_id,command,payload,result)
      values(uid,v_request_id,sid,p_command,p_payload,result);
  end if;
  perform sandbox_commerce_v1.assert_fresh(authority);
  return result;
end; $$;
revoke all on function sandbox_commerce_v1.history_declaration(uuid),sandbox_commerce_v1.history_offer(uuid),
  sandbox_commerce_v1.history_offer_page(uuid,timestamptz,timestamptz,uuid,integer),
  sandbox_commerce_v1.history_resource(uuid),sandbox_commerce_v1.history_abandonment(uuid),
  sandbox_commerce_v1.history_attempt(uuid,uuid,uuid),sandbox_commerce_v1.tip_history_command(text,jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_sandbox_tips_v1(p_command text,p_payload jsonb,
  p_expected_account_id uuid,p_expected_session_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  return sandbox_commerce_v1.tip_history_command(p_command,p_payload,p_expected_account_id,p_expected_session_generation);
end; $$;
revoke all on function public.isolated_sandbox_tips_v1(text,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.isolated_sandbox_tips_v1(text,jsonb,uuid,uuid) to authenticated;
reset role;
revoke create on schema public from sbx_v1_core_owner;
