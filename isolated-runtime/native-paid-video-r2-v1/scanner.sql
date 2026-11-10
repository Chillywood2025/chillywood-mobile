set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.r2_assert_scanner(p_profile uuid default null,p_worker uuid default null) returns void language plpgsql set search_path='' as $$
declare claims jsonb:=current_setting('request.jwt.claims',true)::jsonb;begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'sbx_v1_r2_scanner'
  or current_setting('role',true) is distinct from 'sbx_v1_r2_scanner'
  or coalesce(claims->>'profile_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(claims->>'worker_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or (p_profile is not null and claims->>'profile_id' is distinct from p_profile::text)
  or (p_worker is not null and claims->>'worker_id' is distinct from p_worker::text)
 then raise exception 'paid_video_r2_scanner_role_required' using errcode='42501';end if;
end $$;
create function sandbox_commerce_v1.r2_lease(p_upload uuid,p_worker uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;p sandbox_commerce_v1.r2_profiles;t sandbox_commerce_v1.paid_video_tickets;a jsonb;o jsonb;
begin
 perform sandbox_commerce_v1.r2_assert_scanner();perform sandbox_commerce_v1.assert_generation(true);
 if p_worker is null or not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-worker:'||p_worker,692))
 then raise exception 'paid_video_r2_worker_busy';end if;
 if exists(select 1 from sandbox_commerce_v1.paid_video_tickets tt join sandbox_commerce_v1.paid_video_uploads x on x.id=tt.upload_id
  where tt.worker_id=p_worker and tt.expires_at>clock_timestamp() and tt.positive_consumed_at is null and x.state='scan_pending')
 then raise exception 'paid_video_r2_worker_already_leased';end if;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for update nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where route_id=u.route_id and worker_id=p_worker for share nowait;
 perform sandbox_commerce_v1.r2_assert_scanner(p.id,p.worker_id);
 if not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id) or u.state<>'scan_pending'
  or u.moderation='removed' or u.expires_at<=clock_timestamp()
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=u.id and rr.identity=u.r2_identity)
  or exists(select 1 from sandbox_commerce_v1.paid_video_tickets where upload_id=u.id and expires_at>clock_timestamp())
 then raise exception 'paid_video_r2_scan_unavailable';end if;
 a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');o:=sandbox_commerce_v1.r2_object(u.id);
 insert into sandbox_commerce_v1.paid_video_tickets(upload_id,worker_id) values(u.id,p.worker_id) returning * into t;
 insert into sandbox_commerce_v1.r2_tickets values(t.id,p.id,o);
 perform sandbox_commerce_v1.assert_fresh(a);
 return jsonb_build_object('protocol','scpv-worker-ticket-r2-v1','ticketId',t.id,'uploadId','scpv_upload_'||u.id,
  'workerId',p.worker_id,'qualificationSha256',p.qualification_sha256,'profile','scpv-mp4-h264-aac-v1',
  'issuedAt',t.issued_at,'expiresAt',t.expires_at,'object',o);
end $$;
revoke all on function sandbox_commerce_v1.r2_assert_scanner(uuid,uuid),sandbox_commerce_v1.r2_lease(uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
create function sandbox_commerce_v1.r2_review_object(p_upload uuid) returns void
language plpgsql volatile set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;p sandbox_commerce_v1.r2_profiles;r sandbox_commerce_v1.r2_receipts;
 s sandbox_commerce_v1.paid_video_scan_results;w sandbox_commerce_v1.paid_video_workers;v sandbox_commerce_v1.paid_video_verifiers;a jsonb;
begin
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for share nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where route_id=u.route_id for share nowait;
 if not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id) or u.state<>'clean' or u.moderation='removed'
  or u.daily_definitions_at<clock_timestamp()-interval '48 hours' then raise exception 'paid_video_r2_review_unavailable';end if;
 a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
 select * into strict r from sandbox_commerce_v1.r2_receipts where upload_id=u.id and identity=u.r2_identity and verifier_id=p.verifier_id;
 select * into strict v from sandbox_commerce_v1.paid_video_verifiers where id=p.verifier_id;
 select * into strict w from sandbox_commerce_v1.paid_video_workers where id=p.worker_id;
 select * into strict s from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256 and accepted_positive;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(v.hmac_key,r.raw_body),r.signature)
  or not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(w.hmac_key,s.raw_body),s.signature)
  or s.raw_body::jsonb->'object' is distinct from sandbox_commerce_v1.r2_object(u.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_tickets rt join sandbox_commerce_v1.paid_video_tickets tt on tt.id=rt.ticket_id
   where rt.ticket_id=s.ticket_id and rt.profile_id=p.id and tt.worker_id=p.worker_id and tt.upload_id=u.id and rt.object=s.raw_body::jsonb->'object')
 then raise exception 'paid_video_r2_review_evidence_invalid';end if;
 perform sandbox_commerce_v1.assert_fresh(a);
end $$;
revoke all on function sandbox_commerce_v1.r2_review_object(uuid) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
reset role;
create function public.native_paid_video_r2_worker_v1(p_action text,p_upload_id uuid default null,p_worker_id uuid default null,p_raw_body text default null,p_signature text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 if p_action='lease' and p_upload_id is not null and p_worker_id is not null and p_raw_body is null and p_signature is null
 then return sandbox_commerce_v1.r2_lease(p_upload_id,p_worker_id);
 elsif p_action='complete' and p_upload_id is null and p_worker_id is null and p_raw_body is not null and p_signature is not null
 then
  perform sandbox_commerce_v1.r2_assert_scanner(
   (select rt.profile_id from sandbox_commerce_v1.r2_tickets rt where rt.ticket_id=(p_raw_body::jsonb->>'ticketId')::uuid),
   (p_raw_body::jsonb->>'workerId')::uuid);
  perform sandbox_commerce_v1.r2_scan_ingest(p_raw_body,p_signature);
  return jsonb_build_object('protocol','scpv-r2-worker-completion-v1','state','recorded',
   'resultSha256',encode(sha256(convert_to(p_raw_body,'UTF8')),'hex'));
 end if;
 raise exception 'paid_video_r2_worker_action_invalid';
end $$;
create function public.native_paid_video_r2_scan_admit_v1(p_upload_id uuid,p_ticket_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p sandbox_commerce_v1.r2_profiles;t sandbox_commerce_v1.paid_video_tickets;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 select x.* into strict t from sandbox_commerce_v1.paid_video_tickets x where x.id=p_ticket_id and x.upload_id=p_upload_id;
 select x.* into strict p from sandbox_commerce_v1.r2_profiles x join sandbox_commerce_v1.r2_tickets rt on rt.profile_id=x.id where rt.ticket_id=t.id;
 perform sandbox_commerce_v1.r2_assert_scanner(p.id,t.worker_id);
 return sandbox_commerce_v1.r2_admit('scan',t.worker_id,null,t.upload_id,t.id,p.configuration_digest,null,null);
end $$;
alter function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text) owner to sbx_v1_core_owner;
alter function public.native_paid_video_r2_scan_admit_v1(uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text),public.native_paid_video_r2_scan_admit_v1(uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant usage on schema public to sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text),public.native_paid_video_r2_scan_admit_v1(uuid,uuid) to sbx_v1_r2_scanner;
create function public.native_paid_video_r2_next_v1(p_worker_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare candidate record;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 perform sandbox_commerce_v1.r2_assert_scanner(null,p_worker_id);
 perform sandbox_commerce_v1.assert_generation(true);
 if p_worker_id is null or not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-worker:'||p_worker_id,692))
 then raise exception 'paid_video_r2_worker_busy';end if;
 if exists(select 1 from sandbox_commerce_v1.paid_video_tickets t join sandbox_commerce_v1.paid_video_uploads u on u.id=t.upload_id
  where t.worker_id=p_worker_id and t.expires_at>clock_timestamp() and t.positive_consumed_at is null and u.state='scan_pending')
 then return null;end if;
 for candidate in select u.id from sandbox_commerce_v1.paid_video_uploads u
  join sandbox_commerce_v1.r2_profiles p on p.route_id=u.route_id and p.worker_id=p_worker_id and p.enabled
   and p.id=(current_setting('request.jwt.claims',true)::jsonb->>'profile_id')::uuid
  join sandbox_commerce_v1.r2_receipts r on r.upload_id=u.id and r.identity=u.r2_identity
  join sandbox_commerce_v1.r2_commits c on c.upload_id=u.id and c.state='acknowledged' and c.identity=r.identity
  where u.state='scan_pending' and u.moderation<>'removed' and u.expires_at>clock_timestamp()
   and not exists(select 1 from sandbox_commerce_v1.paid_video_tickets t where t.upload_id=u.id and t.expires_at>clock_timestamp())
  order by u.created_at,u.id limit 20 for update of u skip locked
 loop
  begin return sandbox_commerce_v1.r2_lease(candidate.id,p_worker_id);
  exception when insufficient_privilege then null;end;
 end loop;
 return null;
end $$;
alter function public.native_paid_video_r2_next_v1(uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_next_v1(uuid) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_next_v1(uuid) to sbx_v1_r2_scanner;
