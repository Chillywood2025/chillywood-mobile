-- Inactive private enforcement; after resource-graphs.sql, before finalization.
-- This file grants no runtime execution and creates no HTTP/provider issuer.
-- Non-tip receipt ingestion is NOT implemented by the tip-only receipts.sql.
-- Only future independently qualified settlement may call settle_resource_receipt.
set local role sbx_v1_authority_owner;
-- Retained buyer rights do not depend on seller Premium or any live seller
-- session. Account, negative age/market/moderation/sanctions, retained current
-- legal acceptance, fraud/admin holds and both audience-block directions remain.
create function sandbox_commerce_v1.resource_owner_delivery_deadline(p_owner uuid,p_viewer uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' set row_security=off as $$
declare deadline timestamptz:=transaction_timestamp()+interval '5 seconds'; upcoming timestamptz;
begin
 if p_owner is null or p_viewer is null or current_setting('transaction_isolation')<>'read committed'
 then raise exception 'sandbox_owner_delivery_context_required' using errcode='42501'; end if;
 lock table auth.users,public.account_deletion_requests,public.user_profiles,public.wave1_creator_eligibility,
 public.wave1_legal_acceptances,public.wave1_legal_document_versions,public.creator_payout_eligibility_records,
 public.channel_audience_blocks,sandbox_commerce_v1.declarations in share mode nowait;
 if not exists(select 1 from auth.users u where u.id=p_owner and u.deleted_at is null and u.email_confirmed_at is not null
 and coalesce(u.raw_app_meta_data->>'accountDeidentified','false')<>'true' and (u.banned_until is null or u.banned_until<=clock_timestamp()))
 or exists(select 1 from public.account_deletion_requests where user_id=p_owner and status in ('scheduled','completed'))
 or exists(select 1 from public.channel_audience_blocks b where (b.channel_user_id=p_owner::text and b.blocked_user_id=p_viewer::text)
 or (b.channel_user_id=p_viewer::text and b.blocked_user_id=p_owner::text))
 or not exists(select 1 from (values(p_owner)) subject(id) left join public.wave1_creator_eligibility e on e.creator_user_id=subject.id
 left join sandbox_commerce_v1.declarations d on d.user_id=subject.id
 where (e.state is null or e.state not in ('SUSPENDED','REVOKED')) and (e.account_status is null or e.account_status in ('ACTIVE','UNKNOWN'))
 and coalesce(e.age_18_plus,d.declared_18_plus,false) and coalesce(e.moderation_state,'CLEAR')='CLEAR'
 and coalesce(e.creator_role,true) and coalesce(e.platform_capability,true) and e.sanctions_clear is not false
 and (case when coalesce(e.market,'UNKNOWN')='UNKNOWN' and d.country_code='US' then 'UNITED_STATES' else e.market end)='UNITED_STATES'
 and (d.user_id is null or (d.declared_18_plus and d.country_code='US' and d.declaration_version='adult-us-creator-v1'
 and d.region_code in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'))))
 or exists(select 1 from public.creator_payout_eligibility_records h where h.creator_user_id=p_owner::text
 and (h.fraud_hold_active or h.admin_review_status in ('pending_review','rejected','on_hold') or h.eligibility_status='on_hold'))
 then raise exception 'sandbox_owner_delivery_safety_required' using errcode='42501'; end if;
 if exists(select 1 from (values('terms','account'),('privacy','account'),('community_guidelines','account'),('creator_terms','creator'),('money_terms','creator_money')) required(doc,cap)
 where not exists(select 1 from public.wave1_legal_document_versions d where d.document_key=required.doc and d.capability=required.cap
 and d.market='UNITED_STATES' and d.active and d.effective_at<=clock_timestamp() and nullif(btrim(d.version),'') is not null))
 or exists(select 1 from public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES'
 and d.capability in ('account','creator','creator_money') and not exists(select 1 from public.wave1_legal_acceptances a
 where a.user_id=p_owner and a.document_key=d.document_key and a.document_version=d.version and a.market=d.market
 and a.capability=d.capability and a.invalidated_at is null and a.role_key=coalesce((select nullif(lower(btrim(p.channel_role)),'')
 from public.user_profiles p where p.user_id=p_owner::text),'member')))
 then raise exception 'sandbox_owner_retained_legal_required' using errcode='42501'; end if;
 select min(effective_at) into upcoming from public.wave1_legal_document_versions where active and market='UNITED_STATES'
 and capability in ('account','creator','creator_money') and effective_at>clock_timestamp();
 deadline:=least(deadline,upcoming);
 if clock_timestamp()>=deadline then raise exception 'sandbox_owner_delivery_expired' using errcode='42501'; end if;
 return deadline;
end; $$;
revoke all on function sandbox_commerce_v1.resource_owner_delivery_deadline(uuid,uuid) from public,anon,authenticated,service_role;
reset role;
alter function sandbox_commerce_v1.resource_owner_delivery_deadline(uuid,uuid) owner to postgres;
grant execute on function sandbox_commerce_v1.resource_owner_delivery_deadline(uuid,uuid) to sbx_v1_core_owner;
set local role sbx_v1_core_owner;

create function sandbox_commerce_v1.clean_resource_asset(p_id uuid,p_resource uuid,p_revision bigint,p_owner uuid,p_purpose text)
returns sandbox_commerce_v1.delivery_assets language plpgsql volatile security invoker set search_path='' as $$
declare a sandbox_commerce_v1.delivery_assets; s sandbox_commerce_v1.delivery_asset_scans;
begin
 select * into strict a from sandbox_commerce_v1.delivery_assets where id=p_id for share nowait;
 select * into strict s from sandbox_commerce_v1.delivery_asset_scans where asset_id=a.id and incarnation=a.incarnation for share nowait;
 if a.resource_id<>p_resource or a.resource_revision<>p_revision or a.owner_id<>p_owner or a.purpose<>p_purpose
 or a.state<>'retained' or a.moderation<>'clear' or s.state<>'clean' or s.completed_at>clock_timestamp()
 or row(s.provider,s.bucket,s.object_key,s.object_version,s.sha256,s.byte_length)
 is distinct from row(a.provider,a.bucket,a.object_key,a.object_version,a.sha256,a.byte_length)
 then raise exception 'sandbox_immutable_clean_asset_required' using errcode='42501'; end if;
 return a;
end; $$;

create function sandbox_commerce_v1.current_resource_grant(p_user uuid,p_product uuid,p_revision bigint)
returns sandbox_commerce_v1.resource_grants language plpgsql volatile security invoker set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants; receipt_until timestamptz;
begin
 select x.* into g from sandbox_commerce_v1.resource_grants x
 join sandbox_commerce_v1.receipts r on r.id=x.receipt_id
 join sandbox_commerce_v1.intents i on i.id=r.intent_id
 where x.buyer_id=p_user and x.product_id=p_product and x.product_revision=p_revision
 and x.revoked_at is null and isfinite(x.starts_at) and x.starts_at<=clock_timestamp()
 and (x.expires_at is null or (isfinite(x.expires_at) and x.expires_at>clock_timestamp()))
 and r.state='verified' and isfinite(r.purchased_at) and r.purchased_at<=clock_timestamp()
 and (r.expires_at is null or (isfinite(r.expires_at) and r.expires_at>clock_timestamp()))
 and i.state='verified' and i.buyer_id=p_user and i.resource_id=p_product and i.resource_revision=p_revision
 and not exists(select 1 from sandbox_commerce_v1.resource_delivery_holds h where h.buyer_id=p_user
   and (h.receipt_id is null or h.receipt_id=r.id) and h.resolved_at is null)
 order by x.expires_at desc nulls first,x.id limit 1 for share of x,r,i nowait;
 if not found then raise exception 'sandbox_current_exact_resource_grant_required' using errcode='42501'; end if;
 -- The grant is immutable, but provider receipt facts may later shorten their
 -- window. Return a bounded local projection; never extend or rewrite the grant.
 select expires_at into receipt_until from sandbox_commerce_v1.receipts where id=g.receipt_id;
 g.expires_at:=least(g.expires_at,receipt_until);
 return g;
end; $$;

create function sandbox_commerce_v1.settle_resource_receipt(p_receipt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r sandbox_commerce_v1.receipts; i sandbox_commerce_v1.intents; p sandbox_commerce_v1.resource_versions;
 g sandbox_commerce_v1.resource_grants; m sandbox_commerce_v1.membership_terms; a sandbox_commerce_v1.auction_terms;
 e sandbox_commerce_v1.event_terms; room sandbox_commerce_v1.room_terms; seat sandbox_commerce_v1.room_seat_terms;
 v sandbox_commerce_v1.merch_variants; o sandbox_commerce_v1.merch_orders; video sandbox_commerce_v1.video_terms;
 target sandbox_commerce_v1.resource_versions; starts timestamptz; ends timestamptz; consumed timestamptz;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 if not pg_try_advisory_xact_lock(hashtextextended('sandbox-resource-receipt:'||p_receipt_id,683))
 then raise exception 'sandbox_resource_receipt_busy' using errcode='55P03'; end if;
 select * into strict r from sandbox_commerce_v1.receipts where id=p_receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 select * into strict p from sandbox_commerce_v1.resource_versions where resource_id=i.resource_id and revision=i.resource_revision for share nowait;
 if r.state<>'verified' or i.state<>'verified' or p.kind='creator_tip'
 or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
 or row(p.kind,p.creator_id,p.price_minor,p.currency) is distinct from row(i.kind,i.creator_id,i.amount_minor,i.currency)
 or not isfinite(r.purchased_at) or r.purchased_at>clock_timestamp()
 or (r.expires_at is not null and (not isfinite(r.expires_at) or r.expires_at<=r.purchased_at))
 then raise exception 'sandbox_exact_non_tip_receipt_required' using errcode='42501'; end if;
 select * into g from sandbox_commerce_v1.resource_grants where receipt_id=r.id;
 if found then return jsonb_build_object('status','settled','grantId',g.id,'grantsAccess',false); end if;
 if p.kind='physical_merch' then
   select * into o from sandbox_commerce_v1.merch_orders where receipt_id=r.id;
   if found then return jsonb_build_object('status',o.state,'orderId',o.id,'grantsAccess',false); end if;
   select * into strict v from sandbox_commerce_v1.merch_variants where resource_id=p.resource_id and revision=p.revision for update nowait;
   perform sandbox_commerce_v1.clean_resource_asset(v.photo_asset_id,p.resource_id,p.revision,p.creator_id,'merch_photo');
   if v.state<>'active' or v.reserved>=v.stock then raise exception 'sandbox_merch_inventory_unavailable' using errcode='42501'; end if;
   update sandbox_commerce_v1.merch_variants set reserved=reserved+1 where id=v.id;
   insert into sandbox_commerce_v1.merch_orders(receipt_id,buyer_id,product_id,product_revision,variant_id,state)
   values(r.id,i.buyer_id,p.resource_id,p.revision,v.id,'reserved') returning * into o;
   perform sandbox_commerce_v1.assert_generation(false);
   return jsonb_build_object('status','reserved','orderId',o.id,'grantsAccess',false,'shipmentDispatched',false);
 end if;
 starts:=r.purchased_at;
 if p.kind='paid_content' then
   select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p.resource_id and revision=p.revision;
   if video.audience<>'paid' then raise exception 'sandbox_paid_video_terms_required'; end if;
   perform sandbox_commerce_v1.clean_resource_asset(video.asset_id,p.resource_id,p.revision,p.creator_id,'video');
 elsif p.kind in ('channel_subscription','vip_pass') then
   select * into strict m from sandbox_commerce_v1.membership_terms where resource_id=p.resource_id and revision=p.revision;
   if p.kind='vip_pass' and m.duration_seconds<>30*86400 then raise exception 'sandbox_vip_exact_30_day_term_required'; end if;
   if p.kind='channel_subscription' and r.expires_at is null then raise exception 'sandbox_verified_subscription_expiry_required'; end if;
   ends:=starts+make_interval(secs=>m.duration_seconds);
   if r.expires_at is not null then ends:=least(ends,r.expires_at); end if;
 elsif p.kind in ('watch_party_live','live_watch_party_access','live_watch_party_seat') then
   if p.kind='live_watch_party_seat' then
     select * into strict seat from sandbox_commerce_v1.room_seat_terms where resource_id=p.resource_id and revision=p.revision;
     select * into strict room from sandbox_commerce_v1.room_terms where resource_id=seat.room_id and revision=seat.room_revision and generation=seat.room_generation;
     select * into strict target from sandbox_commerce_v1.resource_versions where resource_id=room.resource_id and revision=room.revision;
     if target.kind<>'live_watch_party_access' or target.creator_id<>p.creator_id then raise exception 'sandbox_seat_target_required'; end if;
   else select * into strict room from sandbox_commerce_v1.room_terms where resource_id=p.resource_id and revision=p.revision; end if;
   if room.creator_id<>p.creator_id then raise exception 'sandbox_room_owner_required'; end if;
   ends:=room.ends_at;
 elsif p.kind='event' then
   select * into strict e from sandbox_commerce_v1.event_terms where resource_id=p.resource_id and revision=p.revision;
   if e.creator_id<>p.creator_id then raise exception 'sandbox_event_owner_required'; end if;
   ends:=case when e.replay_allowed then e.replay_ends_at else e.ends_at end;
 elsif p.kind in ('event_auction','room_seat_auction:party_admission','room_seat_auction:stage_reserved_seat') then
   select * into strict a from sandbox_commerce_v1.auction_terms where resource_id=p.resource_id and revision=p.revision for update nowait;
   consumed:=clock_timestamp();
   if a.state<>'awarded' or a.winner_id<>i.buyer_id or consumed>a.claim_deadline then raise exception 'sandbox_exact_auction_claim_required'; end if;
   select * into strict target from sandbox_commerce_v1.resource_versions where resource_id=a.target_id and revision=a.target_revision;
   if target.creator_id<>p.creator_id then raise exception 'sandbox_auction_target_owner_required'; end if;
   if p.kind='event_auction' then
     select * into strict e from sandbox_commerce_v1.event_terms where resource_id=a.target_id and revision=a.target_revision and generation=a.target_generation;
     if target.kind<>'event' then raise exception 'sandbox_auction_event_required'; end if;
     ends:=case when e.replay_allowed then e.replay_ends_at else e.ends_at end;
   else
     select * into strict room from sandbox_commerce_v1.room_terms where resource_id=a.target_id and revision=a.target_revision and generation=a.target_generation;
     if target.kind is distinct from (case when p.kind='room_seat_auction:party_admission' then 'watch_party_live' else 'live_watch_party_access' end)
     then raise exception 'sandbox_auction_room_kind_required'; end if;
     ends:=room.ends_at;
   end if;
 else raise exception 'sandbox_non_tip_kind_unavailable'; end if;
 if p.kind<>'paid_content' and (ends is null or not isfinite(ends))
 then raise exception 'sandbox_finite_resource_term_required'; end if;
 ends:=least(ends,r.expires_at);
 if ends is not null and (not isfinite(ends) or ends<=starts) then raise exception 'sandbox_purchase_outside_resource_terms'; end if;
 insert into sandbox_commerce_v1.resource_grants(buyer_id,product_id,product_revision,receipt_id,starts_at,expires_at)
 values(i.buyer_id,p.resource_id,p.revision,r.id,starts,ends) returning * into g;
 if a.lot_id is not null then
   insert into sandbox_commerce_v1.auction_claims(lot_id,grant_id,receipt_id,buyer_id,product_id,product_revision,target_id,target_revision,generation,consumed_at,deadline)
   values(a.lot_id,g.id,r.id,i.buyer_id,p.resource_id,p.revision,a.target_id,a.target_revision,a.target_generation,consumed,a.claim_deadline);
 end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('status','settled','grantId',g.id,'grantsAccess',false);
end; $$;

-- Refund/revocation frees only a confirmed reservation, never dispatches shipping.
create function sandbox_commerce_v1.release_resource_order(p_receipt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r sandbox_commerce_v1.receipts; o sandbox_commerce_v1.merch_orders;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 if not pg_try_advisory_xact_lock(hashtextextended('sandbox-resource-receipt:'||p_receipt_id,683)) then raise exception 'sandbox_resource_receipt_busy' using errcode='55P03'; end if;
 select * into strict r from sandbox_commerce_v1.receipts where id=p_receipt_id for share nowait;
 select * into strict o from sandbox_commerce_v1.merch_orders where receipt_id=r.id for update nowait;
 if r.state not in ('refunded','revoked') then raise exception 'sandbox_confirmed_terminal_receipt_required'; end if;
 if o.state='reserved' then
   perform 1 from sandbox_commerce_v1.merch_variants where id=o.variant_id for update nowait;
   update sandbox_commerce_v1.merch_variants set reserved=reserved-o.quantity where id=o.variant_id;
   update sandbox_commerce_v1.merch_orders set state='released' where id=o.id;
 elsif o.state<>'released' then raise exception 'sandbox_order_requires_review'; end if;
 return jsonb_build_object('status','released','orderId',o.id,'shipmentDispatched',false);
end; $$;

create function sandbox_commerce_v1.authorize_resource_delivery(p_user uuid,p_session uuid,p_product uuid,p_product_revision bigint,
 p_target uuid,p_target_revision bigint,p_action text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare authority jsonb; p sandbox_commerce_v1.resource_versions; t sandbox_commerce_v1.resource_versions;
 g sandbox_commerce_v1.resource_grants; receipt sandbox_commerce_v1.receipts; product_state text; target_state text;
 video sandbox_commerce_v1.video_terms; asset sandbox_commerce_v1.delivery_assets; inc sandbox_commerce_v1.membership_inclusions;
 room sandbox_commerce_v1.room_terms; admission sandbox_commerce_v1.room_admissions; entry sandbox_commerce_v1.room_admissions;
 seat_terms sandbox_commerce_v1.room_seat_terms; seat sandbox_commerce_v1.room_seats;
 event sandbox_commerce_v1.event_terms; output sandbox_commerce_v1.event_outputs;
 auction sandbox_commerce_v1.auction_terms; claim sandbox_commerce_v1.auction_claims;
 ord sandbox_commerce_v1.merch_orders; issuer text; details jsonb:='{}'; deadline timestamptz; entry_until timestamptz; count_active integer;
begin
 if p_user is null or p_session is null or p_product is null or p_target is null
 or p_product_revision is null or p_product_revision<=0 or p_target_revision is null or p_target_revision<=0
 or p_action is null or p_action not in ('read_test_order','read_membership','play_video','watch_event','request_seat','join_room')
 then raise exception 'sandbox_delivery_request_invalid' using errcode='22023'; end if;
 perform sandbox_commerce_v1.assert_generation(false);
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 -- Freeze own revocation/hold graph, including absent holds. Never call providers
 -- while these locks are held. A future router must write holds here before ack.
 lock table sandbox_commerce_v1.resource_delivery_holds in share mode nowait;
 select * into strict p from sandbox_commerce_v1.resource_versions where resource_id=p_product and revision=p_product_revision for share nowait;
 select * into strict t from sandbox_commerce_v1.resource_versions where resource_id=p_target and revision=p_target_revision for share nowait;
 if p.creator_id<>t.creator_id then raise exception 'sandbox_exact_target_owner_required' using errcode='42501'; end if;
 deadline:=(authority->>'valid_until')::timestamptz;
 if p.kind='physical_merch' then
   if p_action is distinct from 'read_test_order' or row(p_product,p_product_revision) is distinct from row(p_target,p_target_revision) then raise exception 'sandbox_merch_has_no_digital_access'; end if;
   select o.* into strict ord from sandbox_commerce_v1.merch_orders o join sandbox_commerce_v1.receipts r on r.id=o.receipt_id
   join sandbox_commerce_v1.intents i on i.id=r.intent_id where o.buyer_id=p_user and i.buyer_id=p_user
   and o.product_id=p_product and o.product_revision=p_product_revision order by o.id limit 1 for share of o,r,i nowait;
   select * into strict receipt from sandbox_commerce_v1.receipts where id=ord.receipt_id;
   issuer:='order_reader'; details:=jsonb_build_object('orderId',ord.id,'state',ord.state,'receiptStatus',receipt.state,'fulfillmentMode','test_only','shipmentDispatched',false);
 else
   deadline:=least(deadline,sandbox_commerce_v1.resource_owner_delivery_deadline(p.creator_id,p_user));
   select status into strict product_state from sandbox_commerce_v1.resources where id=p_product and creator_id=p.creator_id and kind=p.kind for share nowait;
   select status into strict target_state from sandbox_commerce_v1.resources where id=p_target and creator_id=t.creator_id and kind=t.kind for share nowait;
   if product_state not in ('published','retired') or target_state not in ('published','retired') then raise exception 'sandbox_resource_safety_required' using errcode='42501'; end if;
   g:=sandbox_commerce_v1.current_resource_grant(p_user,p_product,p_product_revision);
   if g.expires_at is not null then deadline:=least(deadline,g.expires_at); end if;
   if p.kind in ('channel_subscription','vip_pass') and p_action='read_membership' then
     if row(p_product,p_product_revision) is distinct from row(p_target,p_target_revision) or g.expires_at is null then raise exception 'sandbox_exact_finite_membership_required'; end if;
     issuer:='membership_reader';
   elsif p.kind in ('paid_content','channel_subscription','vip_pass') then
     if p_action is distinct from 'play_video' or t.kind<>'paid_content' then raise exception 'sandbox_video_destination_required'; end if;
     select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p_target and revision=p_target_revision for share nowait;
     if p.kind='paid_content' then
       if row(p_product,p_product_revision) is distinct from row(p_target,p_target_revision) or video.audience<>'paid' then raise exception 'sandbox_exact_paid_video_required'; end if;
     else
       select * into strict inc from sandbox_commerce_v1.membership_inclusions where product_id=p_product and product_revision=p_product_revision
       and target_id=p_target and target_revision=p_target_revision for share nowait;
       if not inc.active or g.expires_at is null or inc.audience<>(case when p.kind='vip_pass' then 'vip' else 'subscriber' end)
       or (p.kind='vip_pass' and video.audience<>'vip') or (p.kind='channel_subscription' and video.audience not in ('paid','subscriber'))
       then raise exception 'sandbox_explicit_content_inclusion_required'; end if;
     end if;
     asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,p_target,p_target_revision,t.creator_id,'video'); issuer:='media_signer';
   else
     if p.kind in ('event_auction','room_seat_auction:party_admission','room_seat_auction:stage_reserved_seat') then
       select * into strict auction from sandbox_commerce_v1.auction_terms where resource_id=p_product and revision=p_product_revision for share nowait;
       select * into strict claim from sandbox_commerce_v1.auction_claims where grant_id=g.id for share nowait;
       if auction.state<>'awarded' or auction.winner_id<>p_user or row(auction.target_id,auction.target_revision) is distinct from row(p_target,p_target_revision)
       or row(claim.lot_id,claim.buyer_id,claim.receipt_id,claim.product_id,claim.product_revision,claim.target_id,claim.target_revision,claim.generation,claim.deadline)
       is distinct from row(auction.lot_id,p_user,g.receipt_id,p_product,p_product_revision,p_target,p_target_revision,auction.target_generation,auction.claim_deadline)
       or claim.consumed_at>claim.deadline then raise exception 'sandbox_settled_exact_award_required'; end if;
     elsif p.kind='live_watch_party_seat' then
       select * into strict seat_terms from sandbox_commerce_v1.room_seat_terms where resource_id=p_product and revision=p_product_revision;
       if row(seat_terms.room_id,seat_terms.room_revision) is distinct from row(p_target,p_target_revision) then raise exception 'sandbox_exact_seat_room_required'; end if;
     elsif row(p_product,p_product_revision) is distinct from row(p_target,p_target_revision) then raise exception 'sandbox_exact_resource_destination_required'; end if;
     if p.kind in ('event','event_auction') then
       if p_action is distinct from 'watch_event' or t.kind<>'event' then raise exception 'sandbox_event_destination_required'; end if;
       select * into strict event from sandbox_commerce_v1.event_terms where resource_id=p_target and revision=p_target_revision for share nowait;
       select * into strict output from sandbox_commerce_v1.event_outputs where resource_id=p_target and revision=p_target_revision for share nowait;
       if event.creator_id<>t.creator_id or output.generation<>event.generation or output.state<>'active'
       or (auction.lot_id is not null and auction.target_generation<>event.generation) then raise exception 'sandbox_exact_event_generation_required'; end if;
       if event.starts_at is null or event.ends_at is null or not isfinite(event.starts_at) or not isfinite(event.ends_at)
       or event.ends_at<=event.starts_at then raise exception 'sandbox_finite_event_window_required'; end if;
       if event.state='live' then
         if clock_timestamp()<event.starts_at or clock_timestamp()>=event.ends_at then raise exception 'sandbox_event_window_closed'; end if;
         deadline:=least(deadline,event.ends_at);
         details:=jsonb_build_object('outputId',output.output_id,'providerRoomName',output.provider_room_name,'generation',event.generation,'audience','spectator','fullRoomTokenAllowed',false,'rawHlsAllowed',false);
       elsif event.state='replay' and event.replay_allowed then
         if event.replay_starts_at is null or event.replay_ends_at is null
         or not isfinite(event.replay_starts_at) or not isfinite(event.replay_ends_at)
         or event.replay_ends_at<=event.replay_starts_at then raise exception 'sandbox_finite_replay_window_required'; end if;
         if clock_timestamp()<event.replay_starts_at or clock_timestamp()>=event.replay_ends_at then raise exception 'sandbox_replay_window_closed'; end if;
         asset:=sandbox_commerce_v1.clean_resource_asset(output.replay_asset_id,p_target,p_target_revision,t.creator_id,'event_replay');
         deadline:=least(deadline,event.replay_ends_at);
         details:=jsonb_build_object('generation',event.generation,'audience','spectator','fullRoomTokenAllowed',false,'rawHlsAllowed',false);
       else raise exception 'sandbox_purchased_event_replay_required'; end if;
       issuer:='event_spectator_proxy';
     elsif p.kind in ('watch_party_live','live_watch_party_access','live_watch_party_seat','room_seat_auction:party_admission','room_seat_auction:stage_reserved_seat') then
       if (p.kind in ('watch_party_live','room_seat_auction:party_admission') and t.kind<>'watch_party_live')
       or (p.kind in ('live_watch_party_access','live_watch_party_seat','room_seat_auction:stage_reserved_seat') and t.kind<>'live_watch_party_access') then raise exception 'sandbox_room_kind_required'; end if;
       select * into strict room from sandbox_commerce_v1.room_terms where resource_id=p_target and revision=p_target_revision for update nowait;
       if room.starts_at is null or room.ends_at is null or not isfinite(room.starts_at) or not isfinite(room.ends_at)
       or room.ends_at<=room.starts_at then raise exception 'sandbox_finite_room_window_required'; end if;
       if room.creator_id<>t.creator_id or room.state<>'open' or clock_timestamp()<room.starts_at or clock_timestamp()>=room.ends_at
       or (auction.lot_id is not null and auction.target_generation<>room.generation)
       or (seat_terms.resource_id is not null and seat_terms.room_generation<>room.generation) then raise exception 'sandbox_current_room_generation_required'; end if;
       if t.kind='watch_party_live' then
         perform 1 from sandbox_commerce_v1.resources where id=room.source_resource_id and creator_id=t.creator_id and kind='paid_content'
         and status in ('published','retired') for share nowait;
         if not found then raise exception 'sandbox_party_source_unavailable'; end if;
         select * into strict video from sandbox_commerce_v1.video_terms where resource_id=room.source_resource_id and revision=room.source_revision;
         perform sandbox_commerce_v1.clean_resource_asset(video.asset_id,room.source_resource_id,room.source_revision,t.creator_id,'video');
       end if;
       deadline:=least(deadline,room.ends_at);
       if p.kind in ('live_watch_party_seat','room_seat_auction:stage_reserved_seat') then
         if p_action is distinct from 'request_seat' then raise exception 'sandbox_seat_not_publish_authority'; end if;
         select a.* into entry from sandbox_commerce_v1.room_admissions a join sandbox_commerce_v1.resource_grants x on x.id=a.grant_id
         join sandbox_commerce_v1.receipts r on r.id=x.receipt_id where a.room_id=p_target and a.room_revision=p_target_revision and a.room_generation=room.generation
         and a.buyer_id=p_user and a.session_id=p_session and a.grant_id<>g.id and a.revoked_at is null and a.expires_at>clock_timestamp()
         and x.revoked_at is null and isfinite(x.starts_at) and x.starts_at<=clock_timestamp()
         and isfinite(x.expires_at) and x.expires_at>clock_timestamp() and r.state='verified'
         and isfinite(r.purchased_at) and r.purchased_at<=clock_timestamp()
         and (r.expires_at is null or (isfinite(r.expires_at) and r.expires_at>clock_timestamp()))
         and not exists(select 1 from sandbox_commerce_v1.resource_delivery_holds h where h.buyer_id=p_user and (h.receipt_id is null or h.receipt_id=r.id) and h.resolved_at is null)
         for share of a,x,r nowait;
         if not found then raise exception 'sandbox_separate_current_room_entry_required'; end if;
         select least(x.expires_at,r.expires_at) into entry_until from sandbox_commerce_v1.resource_grants x
         join sandbox_commerce_v1.receipts r on r.id=x.receipt_id where x.id=entry.grant_id;
         select * into seat from sandbox_commerce_v1.room_seats where room_id=p_target and room_generation=room.generation and buyer_id=p_user for share nowait;
         if found and (seat.grant_id<>g.id or seat.state<>'reserved' or seat.room_revision<>p_target_revision) then raise exception 'sandbox_seat_claim_conflict'; end if;
         if not found then
           select count(*) into count_active from sandbox_commerce_v1.room_seats s join sandbox_commerce_v1.resource_grants x on x.id=s.grant_id
           join sandbox_commerce_v1.receipts r on r.id=x.receipt_id where s.room_id=p_target and s.room_generation=room.generation and s.state='reserved'
           and x.revoked_at is null and x.expires_at>clock_timestamp() and r.state='verified';
           if count_active>=room.seat_capacity then raise exception 'sandbox_room_seat_capacity_reached'; end if;
           insert into sandbox_commerce_v1.room_seats(room_id,room_revision,room_generation,buyer_id,grant_id,state)
           values(p_target,p_target_revision,room.generation,p_user,g.id,'reserved') returning * into seat;
         end if;
         deadline:=least(deadline,entry.expires_at,entry_until); issuer:='seat_request';details:=jsonb_build_object('seatId',seat.id,'hostApproved',seat.host_approved);
       else
         if p_action is distinct from 'join_room' then raise exception 'sandbox_room_admission_only'; end if;
         select * into admission from sandbox_commerce_v1.room_admissions where room_id=p_target and room_generation=room.generation and buyer_id=p_user for update nowait;
         if found and (admission.revoked_at is not null or admission.grant_id<>g.id or admission.room_revision<>p_target_revision) then raise exception 'sandbox_room_admission_revoked'; end if;
         if not found then
           select count(*) into count_active from sandbox_commerce_v1.room_admissions a join sandbox_commerce_v1.resource_grants x on x.id=a.grant_id
           join sandbox_commerce_v1.receipts r on r.id=x.receipt_id where a.room_id=p_target and a.room_generation=room.generation and a.revoked_at is null
           and a.expires_at>clock_timestamp() and x.revoked_at is null and x.expires_at>clock_timestamp() and r.state='verified';
           if count_active>=room.capacity then raise exception 'sandbox_room_capacity_reached'; end if;
           insert into sandbox_commerce_v1.room_admissions(room_id,room_revision,room_generation,buyer_id,session_id,grant_id,expires_at)
           values(p_target,p_target_revision,room.generation,p_user,p_session,g.id,least(room.ends_at,g.expires_at)) returning * into admission;
         else update sandbox_commerce_v1.room_admissions set session_id=p_session where id=admission.id returning * into admission; end if;
         issuer:='room_admission'; details:=jsonb_build_object('admissionId',admission.id);
       end if;
       details:=details||jsonb_build_object('generation',room.generation,'providerRoomName','scv1-room-scv1_resource_'||p_target||'-'||room.generation,'providerIdentity',p_user,'sessionId',p_session,'publishAllowed',false);
     else raise exception 'sandbox_resource_delivery_kind_unavailable'; end if;
   end if;
 end if;
 if asset.id is not null then details:=details||jsonb_build_object('asset',jsonb_build_object('id',asset.id,'incarnation',asset.incarnation,
 'provider',asset.provider,'bucket',asset.bucket,'objectKey',asset.object_key,'objectVersion',asset.object_version,'sha256',asset.sha256,'byteLength',asset.byte_length)); end if;
 perform sandbox_commerce_v1.assert_fresh(authority);
 if clock_timestamp()>=deadline then raise exception 'sandbox_delivery_authority_expired'; end if;
 return jsonb_build_object('eligibleForIssuer',true,'authorizationProof',false,'grantsAccess',false,'publishAllowed',false,'issuer',issuer,
 'binding',jsonb_build_object('userId',p_user,'sessionId',p_session,'productId','scv1_resource_'||p_product,'productRevision',p_product_revision,
 'targetId','scv1_resource_'||p_target,'targetRevision',p_target_revision,'expiresAtMs',floor(extract(epoch from deadline)*1000)), 'details',details);
end; $$;
revoke all on function sandbox_commerce_v1.clean_resource_asset(uuid,uuid,bigint,uuid,text),
 sandbox_commerce_v1.current_resource_grant(uuid,uuid,bigint), sandbox_commerce_v1.settle_resource_receipt(uuid),
 sandbox_commerce_v1.release_resource_order(uuid), sandbox_commerce_v1.authorize_resource_delivery(uuid,uuid,uuid,bigint,uuid,bigint,text)
 from public,anon,authenticated,service_role;
reset role;
