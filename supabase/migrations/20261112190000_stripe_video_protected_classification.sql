-- Stripe offers share the existing protected-video classification without a
-- fabricated native catalog row. Pausing an offer must never make it free.
begin;
create function private.stripe_video_is_protected(p_video_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.stripe_paid_video_prices where video_id=p_video_id)
$$;
revoke all on function private.stripe_video_is_protected(uuid) from public,anon,authenticated,service_role;
do $$ declare d text; needle text; begin
 d:=pg_get_functiondef('public.can_read_creator_video_row(text,text,text,text,text,text,text,text)'::regprocedure);
 needle:='and (v_price."id" is null or not coalesce(v_price."is_paid",false))';
 if position(needle in d)=0 then raise exception 'stripe_video_row_classification_topology_mismatch'; end if;
 execute replace(d,needle,needle||' and not private.stripe_video_is_protected(v_video_ids[1])');
 d:=pg_get_functiondef('public.resolve_creator_video_visibility_access(text,text)'::regprocedure);
 needle:='v_paid_required:=coalesce(v_paid_required,false);';
 if position(needle in d)=0 then raise exception 'stripe_video_visibility_classification_topology_mismatch'; end if;
 execute replace(d,needle,'v_paid_required:=coalesce(v_paid_required,false) or private.stripe_video_is_protected(v_video_id);');
end $$;

create function private.guard_stripe_video_price_protection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('creator-video-commerce:'||new.video_id::text,0));
 if exists(select 1 from public.videos where id=new.video_id and
 (vip_access_required or nullif(btrim(playback_url),'') is not null))
 or public.creator_video_has_unsigned_public_rendition_internal(new.video_id)
 then raise exception 'stripe_video_requires_private_source_without_public_renditions'; end if;
 return new;
end $$;
create trigger guard_stripe_video_price_protection before insert or update on private.stripe_paid_video_prices
 for each row execute function private.guard_stripe_video_price_protection();
create function private.guard_stripe_video_source_protection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('creator-video-commerce:'||new.id::text,0));
 if private.stripe_video_is_protected(new.id) and (new.vip_access_required or nullif(btrim(new.playback_url),'') is not null)
 then raise exception 'stripe_video_requires_private_source_without_public_renditions'; end if;
 return new;
end $$;
create trigger guard_stripe_video_source_protection before update of vip_access_required,playback_url on public.videos
 for each row execute function private.guard_stripe_video_source_protection();
create function private.guard_stripe_video_rendition_protection() returns trigger
language plpgsql security definer set search_path='' as $$
declare video_id uuid;
begin
 if new.source_type<>'creator_video' or not new.is_ready or not new.is_public_playback_safe then return new; end if;
 begin video_id:=new.source_id::uuid; exception when invalid_text_representation then return new; end;
 perform pg_advisory_xact_lock(hashtextextended('creator-video-commerce:'||video_id::text,0));
 if private.stripe_video_is_protected(video_id) then raise exception 'protected_video_cannot_have_unsigned_public_rendition'; end if;
 return new;
end $$;
create trigger guard_stripe_video_rendition_protection before insert or update on public.media_renditions
 for each row execute function private.guard_stripe_video_rendition_protection();
revoke all on function private.guard_stripe_video_price_protection(),private.guard_stripe_video_source_protection(),
 private.guard_stripe_video_rendition_protection() from public,anon,authenticated,service_role;

create function public.classify_stripe_paid_video_ids(p_video_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if coalesce(cardinality(p_video_ids),0)>100 then raise exception 'classification_batch_too_large'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('videoId',p.video_id,'creatorId',p.creator_id))
 from private.stripe_paid_video_prices p join public.videos v on v.id=p.video_id and v.owner_id=p.creator_id
 where p.video_id=any(p_video_ids)),'[]'::jsonb);
end $$;
revoke all on function public.classify_stripe_paid_video_ids(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.classify_stripe_paid_video_ids(uuid[]) to service_role;
commit;
