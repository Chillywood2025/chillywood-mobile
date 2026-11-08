-- Source-only native-store quote preparation. Install after existing paid-video
-- source, before permissions-finalize.sql, in the same explicit transaction.
-- No provider purchase/intent/receipt/grant is created or enabled by this file.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_quote_controls(singleton boolean primary key default true check(singleton),preparation_enabled boolean not null default false);
insert into sandbox_commerce_v1.native_store_quote_controls values(true,false);
create table sandbox_commerce_v1.native_store_catalog_bindings(
 id uuid not null,revision bigint not null check(revision>0),offer_id uuid not null references sandbox_commerce_v1.offers,
 offer_revision bigint not null check(offer_revision>0),store text not null check(store in ('APP_STORE','PLAY_STORE')),
 catalog jsonb not null check(jsonb_typeof(catalog)='object'),primary key(id,revision)
);
create table sandbox_commerce_v1.native_store_catalog_retirements(
 binding_id uuid not null,binding_revision bigint not null,reason text not null check(length(reason)>0),
 primary key(binding_id,binding_revision),foreign key(binding_id,binding_revision) references sandbox_commerce_v1.native_store_catalog_bindings(id,revision)
);
create table sandbox_commerce_v1.native_store_selections(
 id uuid primary key default gen_random_uuid(),buyer_id uuid not null,session_id uuid not null,request_id uuid not null,
 payload jsonb not null,quote jsonb not null,created_at timestamptz not null default clock_timestamp(),unique(buyer_id,request_id)
);
create function sandbox_commerce_v1.native_store_quote_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'native_store_quote_immutable' using errcode='55000'; end $$;
do $$declare t text;begin
 foreach t in array array['native_store_quote_controls','native_store_catalog_bindings','native_store_catalog_retirements','native_store_selections'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy owner_only on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  if t<>'native_store_quote_controls' then
   execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
   execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
  end if;
 end loop;
end $$;
create function sandbox_commerce_v1.native_store_selection_json(s sandbox_commerce_v1.native_store_selections)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','nssv1_selection_'||s.id,'originalRequestId',s.request_id,
 'originalSessionGeneration',s.session_id,'createdAt',s.created_at,'quote',s.quote);
$$;
create function sandbox_commerce_v1.native_store_quote_command(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed text[];buyer jsonb;seller jsonb;prior sandbox_commerce_v1.native_store_selections;
 o sandbox_commerce_v1.offers;r sandbox_commerce_v1.resources;v sandbox_commerce_v1.resource_versions;
 terms sandbox_commerce_v1.video_terms;a sandbox_commerce_v1.delivery_assets;b sandbox_commerce_v1.native_store_catalog_bindings;
 cat jsonb;quote jsonb;body jsonb;status text:='ok';matches integer;enabled boolean;owner_until timestamptz;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192
 then raise exception 'native_store_quote_request_invalid';end if;
 allowed:=case p_command when 'offer' then array['offerId','store'] when 'prepare' then array['offerId','store','expectedQuote'] when 'recover' then array['originalRequestId'] end;
 if allowed is null or not(p_payload ?& allowed) or p_payload-allowed<>'{}'::jsonb then raise exception 'native_store_quote_shape_invalid';end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if p_command='recover' then
  if jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string' or p_payload->>'originalRequestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$'
  then raise exception 'native_store_quote_shape_invalid';end if;
  select * into prior from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and request_id=(p_payload->>'originalRequestId')::uuid;
  if found then body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
  else status:='unknown';body:=jsonb_build_object('selection',null,'reason','preparation_unknown');end if;
 else
  if jsonb_typeof(p_payload->'offerId') is distinct from 'string' or jsonb_typeof(p_payload->'store') is distinct from 'string'
   or p_payload->>'store' not in ('APP_STORE','PLAY_STORE') then raise exception 'native_store_quote_shape_invalid';end if;
  if p_command='prepare' then
   if jsonb_typeof(p_payload->'expectedQuote') is distinct from 'object' then raise exception 'native_store_quote_shape_invalid';end if;
   if not pg_try_advisory_xact_lock(hashtextextended('native-store-prepare:'||p_user,691)) then raise exception 'native_store_quote_busy' using errcode='55P03';end if;
   select * into prior from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and request_id=p_request;
   if found and row(prior.session_id,prior.payload) is distinct from row(p_session,p_payload) then raise exception 'native_store_quote_idempotency_conflict';end if;
  end if;
  if prior.id is not null then
   -- Replayed evidence cannot dispatch; later media withdrawal does not erase it.
   body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
  else
   select * into strict o from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer') for share nowait;
   select * into strict r from sandbox_commerce_v1.resources where id=o.resource_id for share nowait;
   select * into strict v from sandbox_commerce_v1.resource_versions where resource_id=r.id and revision=o.resource_revision for share nowait;
   if r.kind<>'paid_content' or v.kind<>'paid_content' or r.status<>'published' or o.status<>'published' or r.revision<>o.resource_revision
     or r.creator_id<>v.creator_id or r.creator_id=p_user or v.currency<>'usd'
     or o.revision>9007199254740991 or v.revision>9007199254740991 or v.price_minor>9007199254740991
     then raise exception 'native_store_offer_unavailable';end if;
   select * into strict terms from sandbox_commerce_v1.video_terms where resource_id=r.id and revision=o.resource_revision for share nowait;
   if terms.audience<>'paid' then raise exception 'native_store_offer_unavailable';end if;
   a:=sandbox_commerce_v1.clean_resource_asset(terms.asset_id,r.id,o.resource_revision,r.creator_id,'video');
   -- Existing helper is provider-neutral despite its historical name: it checks
   -- exact retained media/upload/route, not any Test Store checkout permission.
   perform sandbox_commerce_v1.test_store_v3_assert_media(jsonb_populate_record(null::sandbox_commerce_v1.intents,
     jsonb_build_object('resource_id',r.id,'resource_revision',v.revision,'creator_id',r.creator_id,'kind','paid_content','amount_minor',v.price_minor,'currency',v.currency)));
   if a.byte_length>16777216 then raise exception 'native_store_offer_unavailable';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(r.creator_id,p_user);
   lock table sandbox_commerce_v1.native_store_catalog_bindings,sandbox_commerce_v1.native_store_catalog_retirements in share mode nowait;
   select count(*) into matches from sandbox_commerce_v1.native_store_catalog_bindings x where x.offer_id=o.id and x.offer_revision=o.revision and x.store=p_payload->>'store'
    and not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements z where z.binding_id=x.id and z.binding_revision=x.revision);
   if matches<>1 then
    status:='held';body:=case when p_command='offer' then jsonb_build_object('quote',null,'reason','native_store_catalog_unavailable') else jsonb_build_object('selection',null,'reason','native_store_catalog_unavailable') end;
   else
    select * into strict b from sandbox_commerce_v1.native_store_catalog_bindings x where x.offer_id=o.id and x.offer_revision=o.revision and x.store=p_payload->>'store'
     and not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements z where z.binding_id=x.id and z.binding_revision=x.revision);
    cat:=b.catalog;
    if cat is distinct from jsonb_build_object('protocol','native-store-sandbox-catalog-v1','bindingId','nssv1_catalog_'||b.id,'revision',b.revision,
      'projectId',cat->>'projectId','appId',cat->>'appId','store',b.store,'environment','SANDBOX','wireProductId',cat->>'wireProductId',
      'productType','one_time','basePlanId',null,'resourceId','scv1_resource_'||r.id,'resourceRevision',v.revision,'creatorId',r.creator_id,
      'amountMinor',v.price_minor,'currency','usd','quantity',1,'asset',jsonb_build_object('id','scv1_asset_'||a.id,'incarnation',a.incarnation,
      'sha256',a.sha256,'byteLength',a.byte_length,'resourceRevision',a.resource_revision,'profile','scpv-mp4-h264-aac-v1'))
      or b.revision>9007199254740991
      or exists(select 1 from (values(cat->>'projectId'),(cat->>'appId'),(cat->>'wireProductId')) field(value)
        where coalesce(octet_length(value),0) not between 1 and 512 or value~'[[:cntrl:]]'
        or value is distinct from btrim(value,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
    then raise exception 'native_store_catalog_mismatch';end if;
    quote:=jsonb_build_object('offerId','scv1_offer_'||o.id,'offerRevision',o.revision,'resourceId','scv1_resource_'||r.id,'resourceRevision',v.revision,
      'creatorId',r.creator_id,'kind','paid_content','amountMinor',v.price_minor,'currency','usd','asset',cat->'asset',
      'catalog',jsonb_build_object('bindingId',cat->>'bindingId','revision',b.revision,'projectId',cat->>'projectId','appId',cat->>'appId',
      'store',b.store,'environment','SANDBOX','wireProductId',cat->>'wireProductId'));
    quote:=quote||jsonb_build_object('quoteDigest',encode(sha256(convert_to(quote::text,'UTF8')),'hex'));
    if p_command='offer' then body:=jsonb_build_object('quote',quote,'reason',null);
    else
     select preparation_enabled into strict enabled from sandbox_commerce_v1.native_store_quote_controls where singleton for share nowait;
     if not enabled then status:='held';body:=jsonb_build_object('selection',null,'reason','native_store_preparation_disabled');
     else
      perform sandbox_commerce_v1.assert_generation(true);
      buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'buyer');seller:=sandbox_commerce_v1.assert_authority(r.creator_id,null,'creator_subject');
      if p_payload->'expectedQuote' is distinct from quote then raise exception 'native_store_quote_changed';end if;
      if (select count(*) from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception 'native_store_preparation_limit';end if;
      perform sandbox_commerce_v1.assert_fresh(buyer);perform sandbox_commerce_v1.assert_fresh(seller);
      if clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
      insert into sandbox_commerce_v1.native_store_selections(buyer_id,session_id,request_id,payload,quote) values(p_user,p_session,p_request,p_payload,quote) returning * into prior;
      body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
     end if;
    end if;
   end if;
  end if;
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 if seller is not null then perform sandbox_commerce_v1.assert_fresh(seller);end if;
 if owner_until is not null and clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
 return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
  'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,'data',body,
  'dispatchAllowed',false,'correlation','unsupported');
end $$;
revoke all on function sandbox_commerce_v1.native_store_quote_immutable(),sandbox_commerce_v1.native_store_selection_json(sandbox_commerce_v1.native_store_selections),
 sandbox_commerce_v1.native_store_quote_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
reset role;
create function public.native_store_sandbox_command_v1(p_user_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$select sandbox_commerce_v1.native_store_quote_command(p_user_id,p_session_id,p_command,p_request_id,p_payload)$$;
alter function public.native_store_sandbox_command_v1(uuid,uuid,text,uuid,jsonb) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_command_v1(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_command_v1(uuid,uuid,text,uuid,jsonb) to service_role;
