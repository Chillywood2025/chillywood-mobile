-- Source only: creator-authored sandbox prices, not provider configuration.
begin;
create table private.stripe_paid_video_prices (
 id uuid primary key default gen_random_uuid(),
 video_id uuid not null unique,
 creator_id uuid not null,
 amount_minor integer not null check(amount_minor between 50 and 99999999),
 currency text not null check(currency='usd'),
 revision bigint not null default 1 check(revision>0),
 status text not null check(status in ('sandbox','paused')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table private.stripe_paid_video_prices enable row level security;
alter table private.stripe_paid_video_prices force row level security;
revoke all on private.stripe_paid_video_prices from public,anon,authenticated,service_role;

create function public.set_my_stripe_sandbox_video_price(p_video_id uuid,p_amount_minor integer,p_currency text default 'usd',p_is_paid boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_owner uuid; v_price private.stripe_paid_video_prices%rowtype; v_settings public.monetization_system_settings%rowtype;
begin
 perform private.assert_current_creator_for_mode('sandbox');
 if v_actor is null or p_is_paid is null then raise exception 'creator_pricing_auth_required'; end if;
 select owner_id into v_owner from public.videos where id=p_video_id for update;
 if v_owner is distinct from v_actor then raise exception 'creator_pricing_owner_required'; end if;
 if p_currency is distinct from 'usd' then raise exception 'creator_pricing_currency_invalid'; end if;
 select * into v_settings from public.monetization_system_settings where id=true;
 if p_is_paid and (p_amount_minor is null or p_amount_minor < greatest(50,coalesce(v_settings.min_price_cents,99))
   or p_amount_minor > least(99999999,coalesce(v_settings.max_price_cents,50000))) then
  raise exception 'creator_pricing_amount_out_of_range';
 end if;
 if p_is_paid then
  insert into private.stripe_paid_video_prices(video_id,creator_id,amount_minor,currency,status)
  values(p_video_id,v_actor,p_amount_minor,'usd','sandbox')
  on conflict(video_id) do update set amount_minor=excluded.amount_minor,currency=excluded.currency,status='sandbox',
   revision=stripe_paid_video_prices.revision+1,updated_at=now()
  where stripe_paid_video_prices.creator_id=v_actor returning * into v_price;
 else
  update private.stripe_paid_video_prices set status='paused',revision=revision+1,updated_at=now()
  where video_id=p_video_id and creator_id=v_actor returning * into v_price;
 end if;
 if v_price.id is null then return jsonb_build_object('status','blocked','reason','stripe_video_price_not_found'); end if;
 perform public.monetization_write_audit(v_actor,'stripe_sandbox_video_price_saved','creator_video',p_video_id::text);
 return jsonb_build_object('status','saved','id',v_price.id,'revision',v_price.revision);
end;
$$;
revoke all on function public.set_my_stripe_sandbox_video_price(uuid,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_my_stripe_sandbox_video_price(uuid,integer,text,boolean) to authenticated;

create function public.list_my_stripe_sandbox_video_prices()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_current_creator_for_mode('sandbox');
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'videoId',p.video_id,'creatorId',p.creator_id,
 'title',v.title,'priceCents',p.amount_minor,'currency',p.currency,'status',p.status,'isPaid',p.status='sandbox',
 'provider','stripe','providerProductId',null,'providerProductKey',null,'salesCount',null,'totalRevenueCents',null,
 'createdAt',p.created_at,'updatedAt',p.updated_at,'revision',p.revision) order by p.updated_at desc)
 from private.stripe_paid_video_prices p join public.videos v on v.id=p.video_id and v.owner_id=p.creator_id
 where p.creator_id=auth.uid()),'[]'::jsonb);
end;
$$;
revoke all on function public.list_my_stripe_sandbox_video_prices() from public,anon,authenticated,service_role;
grant execute on function public.list_my_stripe_sandbox_video_prices() to authenticated;
commit;
