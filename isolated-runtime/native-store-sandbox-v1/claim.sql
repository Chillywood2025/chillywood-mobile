-- Source-only assertion capture after quote.sql. No transaction reservation,
-- SDK qualification, settlement, dispatch or access authority is created.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.native_store_claims(
 id uuid primary key default gen_random_uuid(),selection_id uuid not null unique references sandbox_commerce_v1.native_store_selections,
 buyer_id uuid not null,session_id uuid not null,request_id uuid not null,
 transaction_identifier text not null,product_identifier text not null,
 created_at timestamptz not null default clock_timestamp(),unique(buyer_id,request_id)
);
alter table sandbox_commerce_v1.native_store_claims enable row level security;
alter table sandbox_commerce_v1.native_store_claims force row level security;
create policy owner_only on sandbox_commerce_v1.native_store_claims for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.native_store_claims from public,anon,authenticated,service_role;
create trigger immutable before update or delete on sandbox_commerce_v1.native_store_claims for each row execute function sandbox_commerce_v1.native_store_quote_immutable();
create trigger immutable_truncate before truncate on sandbox_commerce_v1.native_store_claims for each statement execute function sandbox_commerce_v1.native_store_quote_immutable();
create function sandbox_commerce_v1.native_store_claim_json(c sandbox_commerce_v1.native_store_claims)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','nssv1_claim_'||c.id,'selectionId','nssv1_selection_'||c.selection_id,
 'originalRequestId',c.request_id,'originalSessionGeneration',c.session_id,'createdAt',c.created_at,
 'transactionIdentifier',c.transaction_identifier,'productIdentifier',c.product_identifier,'evidence','client_assertion','settlementAllowed',false);
$$;
create function sandbox_commerce_v1.native_store_claim_command(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer jsonb;s sandbox_commerce_v1.native_store_selections;c sandbox_commerce_v1.native_store_claims;
 allowed text[];body jsonb;status text:='ok';sid uuid;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096 then raise exception 'native_store_claim_invalid';end if;
 allowed:=case p_command when 'claim' then array['selectionId','transactionIdentifier','productIdentifier'] when 'claim-recover' then array['selectionId'] end;
 if allowed is null or not(p_payload ?& allowed) or p_payload-allowed<>'{}'::jsonb
  or jsonb_typeof(p_payload->'selectionId') is distinct from 'string'
  or p_payload->>'selectionId' !~ '^nssv1_selection_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 then raise exception 'native_store_claim_invalid';end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 sid:=substring(p_payload->>'selectionId' from 17)::uuid;
 if p_command='claim' then
  if exists(select 1 from (values(p_payload->'transactionIdentifier'),(p_payload->'productIdentifier')) f(value)
   where jsonb_typeof(value) is distinct from 'string' or coalesce(octet_length(value#>>'{}'),0) not between 1 and 512
   or (value#>>'{}')~'[[:cntrl:]]' or (value#>>'{}') is distinct from btrim(value#>>'{}',E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
  then raise exception 'native_store_claim_invalid';end if;
  if not pg_try_advisory_xact_lock(hashtextextended('native-store-claim:'||p_user,691)) then raise exception 'native_store_claim_busy' using errcode='55P03';end if;
 end if;
 select * into s from sandbox_commerce_v1.native_store_selections where id=sid and buyer_id=p_user;
 if s.id is null then
  if p_command='claim' then raise exception 'native_store_selection_unavailable';end if;
  status:='unknown';body:=jsonb_build_object('claim',null,'reason','claim_unknown');
 else
  select * into c from sandbox_commerce_v1.native_store_claims where buyer_id=p_user and selection_id=sid;
  if p_command='claim' then
   if c.id is not null then
    -- Exact same-account assertion resends may cross sessions after an unknown
    -- write. The first successful insertion's submitting session stays immutable.
    if row(c.request_id,c.transaction_identifier,c.product_identifier) is distinct from
       row(p_request,p_payload->>'transactionIdentifier',p_payload->>'productIdentifier') then raise exception 'native_store_claim_conflict';end if;
   else
    -- A current session may retain a same-account historical SDK assertion
    -- after logout/crash. session_id below is the submitting session, not proof
    -- it initiated the purchase; original selection session remains immutable.
    if p_payload->>'productIdentifier' is distinct from s.quote#>>'{catalog,wireProductId}' then raise exception 'native_store_claim_product_mismatch';end if;
    if exists(select 1 from sandbox_commerce_v1.native_store_claims where buyer_id=p_user and request_id=p_request) then raise exception 'native_store_claim_conflict';end if;
    -- Assertions intentionally do not reserve a transaction across buyers or
    -- selections. An attacker cannot squat another buyer's receipt identifier.
    insert into sandbox_commerce_v1.native_store_claims(selection_id,buyer_id,session_id,request_id,transaction_identifier,product_identifier)
    values(sid,p_user,p_session,p_request,p_payload->>'transactionIdentifier',p_payload->>'productIdentifier') returning * into c;
   end if;
  end if;
  if c.id is null then status:='unknown';body:=jsonb_build_object('claim',null,'reason','claim_unknown');
  else body:=jsonb_build_object('claim',sandbox_commerce_v1.native_store_claim_json(c),'reason',null);end if;
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
 'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,'data',body,'dispatchAllowed',false,'correlation','unsupported');
end $$;
-- Worker-only exact primary-key read. Never accept caller-authored quote/buyer
-- metadata as database evidence or expose this private row through a user route.
create function sandbox_commerce_v1.native_store_claim_read(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 select jsonb_build_object('buyerId',s.buyer_id,'selectionSessionGeneration',s.session_id,'claim',sandbox_commerce_v1.native_store_claim_json(c),'quote',s.quote)
 into result from sandbox_commerce_v1.native_store_claims c join sandbox_commerce_v1.native_store_selections s on s.id=c.selection_id and s.buyer_id=c.buyer_id where c.id=p_id;
 return result;
end $$;
revoke all on function sandbox_commerce_v1.native_store_claim_json(sandbox_commerce_v1.native_store_claims),
 sandbox_commerce_v1.native_store_claim_command(uuid,uuid,text,uuid,jsonb),sandbox_commerce_v1.native_store_claim_read(uuid) from public,anon,authenticated,service_role;
reset role;
create or replace function public.native_store_sandbox_command_v1(p_user_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select case when p_command in ('claim','claim-recover') then sandbox_commerce_v1.native_store_claim_command(p_user_id,p_session_id,p_command,p_request_id,p_payload)
 else sandbox_commerce_v1.native_store_quote_command(p_user_id,p_session_id,p_command,p_request_id,p_payload) end;
$$;
create function public.native_store_sandbox_claim_read_v1(p_claim_id uuid) returns jsonb language sql security definer set search_path='' as $$select sandbox_commerce_v1.native_store_claim_read(p_claim_id)$$;
alter function public.native_store_sandbox_claim_read_v1(uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_claim_read_v1(uuid) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_claim_read_v1(uuid) to service_role;
