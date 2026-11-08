-- Fresh inactive capture composition. Derived commands.sql SHA256 e42ec2f8ac50e2dea104a16abfa4429a3f351e560060fab4f19556a11e0bfb45.
-- Substitute in a fresh profile only; no active replacement.
-- Install AFTER authority.sql, in the same disabled-generation transaction.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.command(
  p_command text,p_payload jsonb,p_expected_account_id uuid,p_expected_session_generation uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  uid uuid; sid uuid; v_request_id uuid; authority jsonb; seller_authority jsonb;
  prior sandbox_commerce_v1.requests;
  declaration sandbox_commerce_v1.declarations;
  declaration_positive boolean; declaration_changed_at timestamptz;
  resource sandbox_commerce_v1.resources;
  offer sandbox_commerce_v1.offers;
  catalog sandbox_commerce_v1.catalog;
  intent sandbox_commerce_v1.intents;
  receipt sandbox_commerce_v1.receipts;
  result jsonb; body jsonb; status text:='ok'; eligible boolean:=false; allowed text[];
begin
  -- The gateway must authenticate these claims. JWT user_metadata is never used.
  -- The app's session generation is the exact Auth session UUID, not a counter.
  if claims->>'role' is distinct from 'authenticated'
    or claims->>'sub' is null or claims->>'session_id' is null
    or p_expected_session_generation is null
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>16384
    or p_payload->>'protocol' is distinct from 'sandbox-commerce-v1'
  then raise exception 'sandbox_request_context_invalid' using errcode='42501'; end if;
  uid:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid;
  v_request_id:=(p_payload->>'requestId')::uuid;
  if uid is distinct from p_expected_account_id or sid is distinct from p_expected_session_generation or v_request_id is null then
    raise exception 'sandbox_account_binding_invalid' using errcode='42501'; end if;
  if p_command is null or p_command not in ('creator.declare','resource.create','resource.read',
    'offer.publish','offer.read','checkout.prepare','checkout.read','receipt.read','delivery.resolve')
  then raise exception 'sandbox_unknown_command' using errcode='22023'; end if;
  allowed:=array['protocol','requestId']||case p_command
    when 'creator.declare' then array['declared18Plus','countryCode','regionCode','declarationVersion']
    when 'resource.create' then array['kind','title']
    when 'resource.read' then array['resourceId']
    when 'offer.publish' then array['resourceId','amountMinor','currency','expectedRevision']
    when 'offer.read' then array['offerId']
    when 'checkout.prepare' then array['offerId','expectedRevision']
    when 'checkout.read' then array['intentId']
    when 'receipt.read' then array['receiptId']
    when 'delivery.resolve' then array['resourceId','expectedRevision'] end;
  if not (p_payload ?& allowed) or (p_payload-allowed)<>'{}'::jsonb
    or jsonb_typeof(p_payload->'requestId') is distinct from 'string'
    or (p_payload ? 'expectedRevision' and (jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number'
      or p_payload->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'))
    or (p_payload ? 'amountMinor' and (jsonb_typeof(p_payload->'amountMinor') is distinct from 'number'
      or p_payload->>'amountMinor' !~ '^[1-9][0-9]{0,14}$'))
    or (p_payload ? 'currency' and (jsonb_typeof(p_payload->'currency') is distinct from 'string'
      or p_payload->>'currency' !~ '^[a-z]{3}$'))
  then raise exception 'sandbox_command_payload_invalid' using errcode='22023'; end if;
  -- Historical outcomes remain reconcilable after retirement or seller expiry.
  -- Only a cache miss may enter the new-initiation authority path below.
  perform sandbox_commerce_v1.assert_generation(false);
  -- Never wait for a duplicate command while holding shared authority fences.
  if not pg_try_advisory_xact_lock(hashtextextended('sandbox-commerce-v1:'||uid||':'||v_request_id,683))
  then raise exception 'sandbox_request_busy' using errcode='55P03'; end if;
  authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
  select * into prior from sandbox_commerce_v1.requests where user_id=uid and request_id=v_request_id;
  if found then
    if prior.command is distinct from p_command or prior.payload is distinct from p_payload
    then raise exception 'sandbox_idempotency_conflict' using errcode='22023'; end if;
    -- Mutations may be replayed, but read/status/delivery must observe current state.
    if p_command in ('creator.declare','resource.create','offer.publish','checkout.prepare') then
      if p_command='creator.declare' then
        begin
          perform sandbox_commerce_v1.assert_generation(true);
          seller_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
          perform sandbox_commerce_v1.assert_fresh(seller_authority); eligible:=true;
        exception when insufficient_privilege then eligible:=false;
        end;
        prior.result:=jsonb_set(prior.result,'{data,eligible}',to_jsonb(eligible));
      elsif p_command='resource.create' then
        select * into strict resource from sandbox_commerce_v1.resources
          where id=sandbox_commerce_v1.identifier(prior.result#>>'{data,resource,id}','resource') and creator_id=uid;
        prior.result:=jsonb_set(prior.result,'{data,resource}',sandbox_commerce_v1.resource_json(resource));
      elsif p_command='offer.publish' then
        select o.* into strict offer from sandbox_commerce_v1.offers o join sandbox_commerce_v1.resources r on r.id=o.resource_id
          where o.id=sandbox_commerce_v1.identifier(prior.result#>>'{data,offer,id}','offer') and r.creator_id=uid;
        select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id;
        if resource.status<>'published' or resource.revision<>offer.resource_revision then
          prior.result:=prior.result||jsonb_build_object('status','held','data',jsonb_build_object('reason','resource_unavailable'));
        else prior.result:=jsonb_set(prior.result,'{data,offer}',sandbox_commerce_v1.offer_json(offer)); end if;
      elsif p_command='checkout.prepare' then
        select * into strict intent from sandbox_commerce_v1.intents
          where id=sandbox_commerce_v1.identifier(prior.result#>>'{data,intent,id}','intent') and buyer_id=uid;
        if intent.state='prepared' and intent.expires_at<=clock_timestamp() then intent.state:='expired'; end if;
        prior.result:=jsonb_set(prior.result,'{data,intent}',sandbox_commerce_v1.intent_json(intent));
      end if;
      perform sandbox_commerce_v1.assert_fresh(authority);
      if seller_authority is not null then perform sandbox_commerce_v1.assert_fresh(seller_authority); end if;
      return prior.result||jsonb_build_object('actor',jsonb_build_object('userId',uid,
        'accountId',uid,'sessionGeneration',p_expected_session_generation));
    end if;
  end if;

  perform sandbox_commerce_v1.assert_generation(p_command in
    ('creator.declare','resource.create','offer.publish','checkout.prepare'));
  authority:=sandbox_commerce_v1.assert_authority(uid,sid,
    case when p_command in ('resource.create','offer.publish') then 'creator'
      when p_command in ('resource.read','checkout.read','receipt.read','delivery.resolve') then 'delivery'
      else 'buyer' end);

  if p_command='creator.declare' then
    if (p_payload-'protocol'-'requestId'-'declared18Plus'-'countryCode'-'regionCode'-'declarationVersion')<>'{}'::jsonb
      or jsonb_typeof(p_payload->'declared18Plus') is distinct from 'boolean'
      or p_payload->>'declarationVersion' is distinct from 'adult-us-creator-v1'
      or coalesce(p_payload->>'countryCode','') !~ '^[A-Z]{2}$'
      or jsonb_typeof(p_payload->'regionCode') not in ('null','string')
      or (p_payload->>'regionCode' is not null and p_payload->>'regionCode' !~ '^[A-Z0-9-]{1,12}$')
    then raise exception 'sandbox_declaration_invalid' using errcode='22023'; end if;
    -- Serialize own declaration writes; no cross-schema FK or tuple lock.
    if not pg_try_advisory_xact_lock(hashtextextended('sandbox-declaration:'||uid,683))
    then raise exception 'sandbox_declaration_busy' using errcode='55P03'; end if;
    lock table sandbox_commerce_v1.declarations,sandbox_commerce_v1.declaration_history in row exclusive mode nowait;
    perform sandbox_commerce_v1.assert_fresh(authority);
    select * into declaration from sandbox_commerce_v1.declarations where user_id=uid;
    -- A new request or session alone is not a changed self-attestation. The
    -- separate request record still retains that call's exact session/payload.
    if not found or row(declaration.declared_18_plus,declaration.country_code,declaration.region_code,declaration.declaration_version)
      is distinct from row((p_payload->>'declared18Plus')::boolean,p_payload->>'countryCode',
        p_payload->>'regionCode',p_payload->>'declarationVersion') then
      declaration_changed_at:=clock_timestamp();
      declaration_positive:=(p_payload->>'declared18Plus')::boolean and p_payload->>'countryCode'='US'
        and p_payload->>'declarationVersion'='adult-us-creator-v1'
        and coalesce(p_payload->>'regionCode' in
          ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'),false);
      if declaration_positive and (select count(*) from sandbox_commerce_v1.declaration_history
        where user_id=uid and positive_declaration
          and declared_at>declaration_changed_at-interval '24 hours')>=10 then
        raise exception 'sandbox_creator_declaration_rate_limited' using errcode='54000';
      end if;
      insert into sandbox_commerce_v1.declaration_history(user_id,session_id,request_id,
        declared_18_plus,country_code,region_code,declaration_version,declared_at)
      values(uid,sid,v_request_id,(p_payload->>'declared18Plus')::boolean,p_payload->>'countryCode',
        p_payload->>'regionCode',p_payload->>'declarationVersion',declaration_changed_at);
      insert into sandbox_commerce_v1.declarations(user_id,session_id,declared_18_plus,country_code,region_code,declaration_version,updated_at)
      values(uid,sid,(p_payload->>'declared18Plus')::boolean,p_payload->>'countryCode',
        p_payload->>'regionCode',p_payload->>'declarationVersion',declaration_changed_at)
      on conflict(user_id) do update set session_id=excluded.session_id,
        declared_18_plus=excluded.declared_18_plus,country_code=excluded.country_code,
        region_code=excluded.region_code,declaration_version=excluded.declaration_version,updated_at=excluded.updated_at;
    end if;
    begin
      seller_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
      perform sandbox_commerce_v1.assert_fresh(seller_authority); eligible:=true;
    exception when insufficient_privilege then eligible:=false;
    end;
    body:=jsonb_build_object('eligible',eligible);
  elsif p_command='resource.create' then
    if (p_payload-'protocol'-'requestId'-'kind'-'title')<>'{}'::jsonb
      or jsonb_typeof(p_payload->'title') is distinct from 'string'
    then raise exception 'sandbox_resource_invalid' using errcode='22023'; end if;
    perform sandbox_commerce_v1.assert_fresh(authority);
    insert into sandbox_commerce_v1.resources(creator_id,kind,title)
      values(uid,p_payload->>'kind',btrim(p_payload->>'title')) returning * into resource;
    body:=jsonb_build_object('resource',sandbox_commerce_v1.resource_json(resource));
  elsif p_command='resource.read' then
    select * into strict resource from sandbox_commerce_v1.resources
      where id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource');
    if resource.creator_id<>uid and resource.status<>'published' then
      raise exception 'sandbox_resource_unavailable' using errcode='42501'; end if;
    body:=jsonb_build_object('resource',sandbox_commerce_v1.resource_json(resource));
  elsif p_command='offer.publish' then
    select * into strict resource from sandbox_commerce_v1.resources
      where id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource') for update nowait;
    if resource.creator_id<>uid or resource.status in ('quarantined','retired')
      or resource.revision is distinct from (p_payload->>'expectedRevision')::bigint
    then raise exception 'sandbox_resource_version_unavailable' using errcode='42501'; end if;
    -- Fixed-price issuance cannot silently implement auction settlement or
    -- recurring subscription terms. Those modes require their actual adapters.
    if resource.kind<>'creator_tip' then
      status:='held';body:=jsonb_build_object('reason','mode_integration_unavailable');
    else
      select * into catalog from sandbox_commerce_v1.catalog where kind=resource.kind
        and amount_minor=(p_payload->>'amountMinor')::bigint and currency=p_payload->>'currency';
      if not found
      then status:='held';body:=jsonb_build_object('reason','provider_or_resource_binding_unavailable');
      else
        perform sandbox_commerce_v1.assert_fresh(authority);
        insert into sandbox_commerce_v1.offers(resource_id,resource_revision,catalog_id)
          values(resource.id,resource.revision,catalog.id) returning * into offer;
        update sandbox_commerce_v1.resources set status='published' where id=resource.id;
        body:=jsonb_build_object('offer',sandbox_commerce_v1.offer_json(offer));
      end if;
    end if;
  elsif p_command='offer.read' then
    select * into strict offer from sandbox_commerce_v1.offers
      where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer');
    select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id;
    if offer.status<>'published' or resource.status<>'published' or resource.revision<>offer.resource_revision
    then raise exception 'sandbox_offer_unavailable' using errcode='42501'; end if;
    body:=jsonb_build_object('offer',sandbox_commerce_v1.offer_json(offer));
  elsif p_command='checkout.prepare' then
    select * into strict offer from sandbox_commerce_v1.offers
      where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer') for share nowait;
    select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id for share nowait;
    select * into strict catalog from sandbox_commerce_v1.catalog where id=offer.catalog_id for share nowait;
    if offer.status<>'published' or resource.status<>'published'
      or offer.revision is distinct from (p_payload->>'expectedRevision')::bigint
      or offer.resource_revision<>resource.revision or resource.creator_id=uid
      or resource.kind<>'creator_tip'
    then raise exception 'sandbox_offer_unavailable' using errcode='42501'; end if;
    seller_authority:=sandbox_commerce_v1.assert_authority(resource.creator_id,null,'creator_subject');
    perform sandbox_commerce_v1.assert_fresh(authority);
    perform sandbox_commerce_v1.assert_fresh(seller_authority);
    insert into sandbox_commerce_v1.intents(buyer_id,buyer_session_id,offer_id,offer_revision,
      resource_id,resource_revision,creator_id,kind,provider,scope_key,store,product_id,amount_minor,currency)
    values(uid,sid,offer.id,offer.revision,resource.id,resource.revision,resource.creator_id,
      resource.kind,catalog.provider,catalog.scope_key,catalog.store,catalog.product_id,catalog.amount_minor,catalog.currency)
    returning * into intent;
    body:=jsonb_build_object('intent',sandbox_commerce_v1.intent_json(intent));
  elsif p_command='checkout.read' then
    select * into strict intent from sandbox_commerce_v1.intents
      where id=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent') and buyer_id=uid;
    if intent.state='prepared' and intent.expires_at<=clock_timestamp() then intent.state:='expired'; end if;
    body:=jsonb_build_object('intent',sandbox_commerce_v1.intent_json(intent));
  elsif p_command='receipt.read' then
    select r.* into strict receipt from sandbox_commerce_v1.receipts r
      join sandbox_commerce_v1.intents i on i.id=r.intent_id
      where r.id=sandbox_commerce_v1.identifier(p_payload->>'receiptId','receipt') and i.buyer_id=uid;
    select * into strict intent from sandbox_commerce_v1.intents where id=receipt.intent_id;
    body:=jsonb_build_object('receipt',jsonb_build_object('id','scv1_receipt_'||receipt.id,
      'intentId','scv1_intent_'||intent.id,'offerId','scv1_offer_'||intent.offer_id,
      'resourceId','scv1_resource_'||intent.resource_id,'kind',intent.kind,
      'status',receipt.state,'receiptType','provider_verified'),'grantsAccess',false);
  elsif p_command='delivery.resolve' then
    select * into strict resource from sandbox_commerce_v1.resources
      where id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource');
    if (resource.creator_id<>uid and resource.status<>'published')
      or resource.revision is distinct from (p_payload->>'expectedRevision')::bigint
    then raise exception 'sandbox_resource_unavailable' using errcode='42501'; end if;
    -- A grant alone is not storage/playback/room/fulfillment authority.
    -- This bundle intentionally issues no generic URL, token or inferred access.
    body:=jsonb_build_object('reason','mode_delivery_adapter_unavailable');status:='held';
  end if;
  perform sandbox_commerce_v1.assert_fresh(authority);
  if seller_authority is not null then perform sandbox_commerce_v1.assert_fresh(seller_authority); end if;
  result:=jsonb_build_object('protocol','sandbox-commerce-v1','environment','sandbox',
    'command',p_command,'requestId',v_request_id,'actor',jsonb_build_object('userId',uid,'accountId',uid,
      'sessionGeneration',p_expected_session_generation),'status',status,'data',body);
  if p_command in ('creator.declare','resource.create','offer.publish','checkout.prepare') and status='ok' then
    insert into sandbox_commerce_v1.requests(user_id,request_id,session_id,command,payload,result)
      values(uid,v_request_id,sid,p_command,p_payload,result);
  end if;
  perform sandbox_commerce_v1.assert_fresh(authority);
  if seller_authority is not null then perform sandbox_commerce_v1.assert_fresh(seller_authority); end if;
  return result;
end; $$;
revoke all on function sandbox_commerce_v1.command(text,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
reset role;

-- Fresh-role creation avoids inheriting the existing owner's default ACLs.
-- This temporary CREATE permission is revoked before the install commits.
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_sandbox_commerce_v1(p_command text,p_payload jsonb,
  p_expected_account_id uuid,p_expected_session_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  if p_command is null or p_command not in ('creator.declare','capability.read')
  then raise exception 'capture_profile_legacy_economic_command_disabled' using errcode='42501'; end if;
  return sandbox_commerce_v1.command(p_command,p_payload,p_expected_account_id,p_expected_session_generation);
end;
$$;
revoke all on function public.isolated_sandbox_commerce_v1(text,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.isolated_sandbox_commerce_v1(text,jsonb,uuid,uuid) to authenticated;
reset role;
revoke create on schema public from sbx_v1_core_owner;
