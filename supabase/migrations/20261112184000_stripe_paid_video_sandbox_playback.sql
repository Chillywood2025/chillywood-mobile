-- Stripe sandbox access uses verified orders, never redirect parameters or a
-- native purchase dispatch. Existing immutable source evidence is reused; no
-- proof, provider setting, deployment flag or grant is created here.
create function private.stripe_video_delivery_proof(p_video uuid) returns uuid
language plpgsql volatile set search_path='' as $$
declare selected_version uuid; proof private.native_production_source_proofs;
begin
 select v.id into selected_version from private.native_production_video_versions v
 join public.videos video on video.id=v.source_id and video.owner_id=v.creator_id
 where v.source_id=p_video and video.mime_type='video/mp4'
 and private.stripe_video_source_current(video.id,video.owner_id)
 order by v.revision desc limit 1;
 select * into proof from private.native_production_source_proofs p
 where p.version_id=selected_version order by p.verified_at desc,p.id desc limit 1;
 if proof.id is null or proof.origin_provider not in ('s3','cloudflare_r2')
 or proof.origin_generation !~ '^"[0-9a-f]{32}(-[1-9][0-9]*)?"$'
 or private.native_production_source_current(selected_version,proof.id) is distinct from true then return null; end if;
 return proof.id;
end $$;
create function private.stripe_video_delivery_ready(p_video uuid) returns boolean
language sql volatile set search_path='' as $$
 select private.stripe_video_delivery_proof(p_video) is not null;
$$;
-- Scope to this exact grant, not merely another valid purchase of the video.
create function private.stripe_video_playback_grant_current(p_buyer uuid,p_video uuid,p_grant uuid) returns boolean
language sql volatile set search_path='' as $$
 select private.stripe_video_access_current(p_buyer,p_video) and exists(
 select 1 from private.stripe_paid_video_orders o join public.access_grants g on g.id=o.access_grant_id
 where o.buyer_id=p_buyer and o.video_id=p_video and o.status='paid' and o.environment='sandbox'
 and private.stripe_video_source_current(o.video_id,o.creator_id)
 and g.id=p_grant and g.user_id=p_buyer and g.source_id=p_video and g.provider='stripe_connect'
 and g.grant_type='paid_content_access' and g.environment='sandbox' and g.status='sandbox_only'
 and g.revoked_at is null and g.refunded_at is null and g.starts_at<=clock_timestamp()
 and (g.expires_at is null or g.expires_at>clock_timestamp()));
$$;
revoke all on function private.stripe_video_delivery_proof(uuid),private.stripe_video_delivery_ready(uuid),
 private.stripe_video_playback_grant_current(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_stripe_sandbox_paid_video_playback(p_video_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare grant_id uuid; proof private.native_production_source_proofs;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'current_session_required'; end if;
 select o.access_grant_id into grant_id from private.stripe_paid_video_orders o
 where o.buyer_id=auth.uid() and o.video_id=p_video_id
 and private.stripe_video_playback_grant_current(auth.uid(),p_video_id,o.access_grant_id)
 order by o.created_at desc,o.id desc limit 1;
 select * into proof from private.native_production_source_proofs where id=private.stripe_video_delivery_proof(p_video_id);
 if grant_id is null or proof.id is null then return null; end if;
 return jsonb_build_object('protocol','stripe-sandbox-playback-v1','status','READY','videoId',p_video_id,
 'grantId',grant_id,'sourceVersionId',proof.version_id,'assetSha256',proof.asset_sha256,
 'byteLength',proof.byte_length,'adapter','stripe-sandbox-etag-range-v1');
end $$;
revoke all on function public.get_stripe_sandbox_paid_video_playback(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_stripe_sandbox_paid_video_playback(uuid) to authenticated;

create function public.resolve_stripe_sandbox_paid_video_origin(p_video_id uuid,p_grant_id uuid,p_buyer_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare proof private.native_production_source_proofs; until_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id) is distinct from true
 or private.stripe_video_playback_grant_current(p_buyer_id,p_video_id,p_grant_id) is distinct from true then return null; end if;
 select * into proof from private.native_production_source_proofs where id=private.stripe_video_delivery_proof(p_video_id);
 if proof.id is null then return null; end if;
 until_at:=least(clock_timestamp()+interval '5 seconds',proof.expires_at,
 (select not_after from auth.sessions where id=p_session_id and user_id=p_buyer_id));
 if until_at<=clock_timestamp() then return null; end if;
 return jsonb_build_object('protocol','stripe-sandbox-origin-v1','videoId',p_video_id,'grantId',p_grant_id,
 'buyerId',p_buyer_id,'sessionId',p_session_id,'sourceVersionId',proof.version_id,
 'provider',proof.origin_provider,'bucket',proof.origin_bucket,'objectKey',proof.origin_object,'generation',proof.origin_generation,
 'assetSha256',proof.asset_sha256,'byteLength',proof.byte_length,'validUntilMs',floor(extract(epoch from until_at)*1000)::bigint);
end $$;
revoke all on function public.resolve_stripe_sandbox_paid_video_origin(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_stripe_sandbox_paid_video_origin(uuid,uuid,uuid,uuid) to service_role;
