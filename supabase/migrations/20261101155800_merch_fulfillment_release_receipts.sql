-- Record the existing creator fulfillment action; do not invent carrier proof
-- or change the tracked/untracked return-window start rule.
alter table public.merch_orders add column fulfillment_revision bigint not null default 0 check(fulfillment_revision>=0);
create function private.stamp_merch_fulfillment_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.fulfillment_revision:=0;
 elsif new.fulfillment_status is distinct from old.fulfillment_status then new.fulfillment_revision:=old.fulfillment_revision+1;
 elsif new.fulfillment_revision is distinct from old.fulfillment_revision then raise exception 'merch_fulfillment_revision_immutable'; end if;
 return new;
end; $$;
revoke all on function private.stamp_merch_fulfillment_revision() from public,anon,authenticated,service_role;
create trigger merch_fulfillment_revision before insert or update on public.merch_orders for each row execute function private.stamp_merch_fulfillment_revision();
create table private.merch_fulfillment_receipts (
 id bigint generated always as identity primary key,order_id uuid not null references public.merch_orders(id),
 creator_id uuid not null,actor_session_id uuid not null,fulfillment_revision bigint not null,
 previous_status text not null,status text not null check(status in ('processing','shipped','delivered','blocked')),
 recorded_at timestamptz not null default clock_timestamp(),unique(order_id,fulfillment_revision)
);
alter table private.merch_fulfillment_receipts enable row level security;
alter table private.merch_fulfillment_receipts force row level security;
revoke all on private.merch_fulfillment_receipts from public,anon,authenticated,service_role;
revoke all on sequence private.merch_fulfillment_receipts_id_seq from public,anon,authenticated,service_role;
create trigger merch_fulfillment_receipt_immutable before update or delete on private.merch_fulfillment_receipts for each row execute function private.guard_event_ticket_terms_immutable();
alter function public.update_creator_merch_fulfillment(uuid,text,text) rename to update_creator_merch_fulfillment_before_release_receipt;
revoke all on function public.update_creator_merch_fulfillment_before_release_receipt(uuid,text,text) from public,anon,authenticated,service_role;
create function public.update_creator_merch_fulfillment(p_order_id uuid,p_status text,p_expected_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;o public.merch_orders;
begin
 -- The original exact-session, creator, payment, reservation and transition
 -- predicates execute first, and retain the order lock for the receipt.
 result:=public.update_creator_merch_fulfillment_before_release_receipt(p_order_id,p_status,p_expected_status);
 select * into strict o from public.merch_orders where id=p_order_id and creator_id=auth.uid();
 if o.fulfillment_status is distinct from p_status then raise exception 'merch_fulfillment_receipt_state_changed'; end if;
 insert into private.merch_fulfillment_receipts(order_id,creator_id,actor_session_id,fulfillment_revision,previous_status,status)
 values(o.id,o.creator_id,(auth.jwt()->>'session_id')::uuid,o.fulfillment_revision,p_expected_status,p_status);
 return result;
end; $$;
revoke all on function public.update_creator_merch_fulfillment(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.update_creator_merch_fulfillment(uuid,text,text) to authenticated;

do $$ declare definition text; needle text:='result:=private.merch_return_hold_state(o,clock_timestamp());'; begin
 definition:=pg_get_functiondef('private.commerce_positive_release_ready(private.commerce_known_cost_snapshots)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'merch_release_return_source_changed'; end if;
 execute replace(definition,needle,$guard$
  if not exists(select 1 from private.merch_fulfillment_receipts receipt where receipt.order_id=o.id and receipt.creator_id=o.creator_id
   and receipt.fulfillment_revision=o.fulfillment_revision and receipt.status=o.fulfillment_status and receipt.status in ('shipped','delivered'))
  then return false; end if;
$guard$||needle);
end $$;
