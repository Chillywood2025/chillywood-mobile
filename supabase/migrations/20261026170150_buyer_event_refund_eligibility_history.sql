-- Event remedy eligibility is a buyer-visible review state, never a completed
-- refund, payout reversal or automatic provider operation.
alter function public."read_my_creator_purchases"(integer,timestamptz,uuid,text,uuid)
  rename to "read_my_creator_purchases_pre_event_remedies";
revoke all on function public."read_my_creator_purchases_pre_event_remedies"(integer,timestamptz,uuid,text,uuid)
  from public,anon,authenticated,service_role;

create function public."read_my_creator_purchases"(
  p_limit integer default 50,p_before_created_at timestamptz default null,p_before_id uuid default null,
  p_source_type text default null,p_source_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_page jsonb;
  v_item jsonb;
  v_items jsonb:='[]'::jsonb;
  v_eligibility jsonb;
begin
  v_page:=public."read_my_creator_purchases_pre_event_remedies"(
    p_limit,p_before_created_at,p_before_id,p_source_type,p_source_id);
  if v_user is null or v_page->>'userId' is distinct from v_user::text
  then raise exception 'buyer_purchase_history_authority_required'; end if;
  for v_item in select value from jsonb_array_elements(v_page->'items') loop
    v_eligibility:=null;
    if v_item->>'sourceType'='event' and v_item->>'sourceId' is not null
      and v_item->>'status' in('active','upcoming','expired','completed','canceled','paid_unfulfilled','reconciliation_required')
      and v_item->'receipt'->>'providerEventId' is not null then
      select jsonb_build_object('eligibility','eligible','status','provider_review_required',
        'reasons',jsonb_agg(distinct remedy."reason" order by remedy."reason"),'createdAt',min(remedy."created_at"))
      into v_eligibility
      from public."creator_event_purchase_remedies" remedy
      left join public."paid_creator_event_passes" pass_row on pass_row."id"=remedy."pass_id"
        and pass_row."buyer_id"=v_user and pass_row."creator_event_id"=remedy."event_id"
      left join public."money_purchase_intents" intent on intent."id"=remedy."purchase_intent_id"
        and intent."user_id"=v_user and intent."source_type"='event' and intent."source_id"=remedy."event_id"
      left join public."access_grants" grant_row on grant_row."id"=remedy."access_grant_id"
        and grant_row."id"=pass_row."access_grant_id" and grant_row."user_id"=v_user
        and grant_row."source_type"='provider_event' and grant_row."source_id"=remedy."event_id"
        and grant_row."grant_type"='event_pass'
      where remedy."buyer_id"=v_user and remedy."event_id"::text=v_item->>'sourceId'
        and remedy."refund_eligibility"='eligible' and remedy."status"='provider_review_required'
        and ((intent."id" is not null and intent."id"::text=v_item->>'purchaseIntentId'
            and exists(select 1 from public."provider_events" paid
              where paid."id"::text=v_item->'receipt'->>'providerEventId'
                and paid."user_id"=v_user and paid."product_id"=intent."product_id"
                and paid."provider"=intent."provider" and paid."environment"=intent."environment"
                and paid."metadata"->>'purchase_intent_id'=intent."id"::text
                and paid."metadata"->>'provider_product_id'=intent."provider_product_id"
                and paid."event_type" in('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL')
                and (paid."status"='processed' or (paid."status"='ignored' and exists(
                  select 1 from public."revenuecat_provider_reconciliation_obligations" obligation
                  where obligation."provider_event_id"=paid."id" and obligation."user_id"=v_user
                    and obligation."purchase_intent_id"=intent."id" and obligation."provider"=intent."provider"
                    and obligation."environment"=intent."environment" and obligation."provider_product_id"=intent."provider_product_id"
                    and obligation."state"='pending_reconciliation')))))
          or (v_item->>'purchaseIntentId' is null and grant_row."provider_event_id"::text=v_item->'receipt'->>'providerEventId'))
      having count(*)>0;
    end if;
    v_items:=v_items||jsonb_build_array(v_item||jsonb_build_object('refundEligibility',v_eligibility));
  end loop;
  return jsonb_set(v_page,'{items}',v_items);
end;
$$;
revoke all on function public."read_my_creator_purchases"(integer,timestamptz,uuid,text,uuid) from public,anon,service_role;
grant execute on function public."read_my_creator_purchases"(integer,timestamptz,uuid,text,uuid) to authenticated;
