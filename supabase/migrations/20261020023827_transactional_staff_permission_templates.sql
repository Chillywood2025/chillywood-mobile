-- Forward-only source repair. No role creation, deployments or provider writes.
-- Templates add/renew only their own keys; revoke removes only those keys.
-- Grants and required application/Break Glass receipts commit together.
begin;
create schema if not exists private;

create or replace function private.staff_permission_template(p_key text)
returns jsonb language sql immutable set search_path = '' as $$
  select template from (values
    ('creator_support', '{"label":"Creator Support","permissions":["creator_support","support_inbox","user_lookup","admin.support.view","admin.user.view"]}'::jsonb),
    ('evidence_exporter', '{"label":"Evidence Exporter","permissions":["evidence_preview","evidence_export","legal_request_intake"]}'::jsonb),
    ('dmca_reviewer', '{"label":"DMCA Reviewer","permissions":["dmca_review","copyright_review","legal_review","admin.dmca.view","admin.dmca.manage"]}'::jsonb),
    ('legal_operator', '{"label":"Legal Admin Workflow","permissions":["legal_ops","legal_request_intake","evidence_preview","evidence_export","legal_hold","legal_review","admin.chat_evidence.view"]}'::jsonb),
    ('legal_reviewer', '{"label":"Legal Reviewer","permissions":["legal_review","evidence_preview","dmca_review","copyright_review","legal_request_intake","admin.dmca.view"]}'::jsonb),
    ('live_ops_operator', '{"label":"Live Ops Admin Workflow","permissions":["live_ops","admin.room.moderate","admin.live.force_end"]}'::jsonb),
    ('moderator', '{"label":"Moderator","permissions":["reports_review","content_moderation","admin.content.hide","admin.content.restore","admin.comment.moderate"]}'::jsonb),
    ('moderator_support', '{"label":"Moderator Support Workflow","permissions":["support_inbox","creator_support","billing_support_read","admin.support.view","admin.support.manage","admin.payment_status.view","admin.refund_status.record","admin.user.view"]}'::jsonb),
    ('senior_moderator', '{"label":"Senior Moderator","permissions":["reports_review","content_moderation","user_lookup","admin.user.search","admin.content.hide","admin.content.restore","admin.content.remove","admin.comment.moderate","admin.room.moderate"]}'::jsonb),
    ('support_agent', '{"label":"Support Workflow","permissions":["support_inbox","user_lookup","admin.support.view","admin.user.search","admin.user.view"]}'::jsonb)
  ) catalog(key,template) where key=p_key;
$$;

-- VOLATILE: each invocation takes a fresh READ COMMITTED snapshot after waits.
-- Existing exact-session/legal/restriction authority is retained, with explicit
-- wall-clock expiry checks because transaction now() can predate a lock wait.
create or replace function private.assert_staff_permission_template_authority(
  p_target_user_id uuid, p_target_email text, p_roles text[]
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_email text;
  v_break_glass uuid;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'staff_permission_template_requires_read_committed';
  end if;
  if v_actor is null or not public.platform_exact_current_session_authority_internal()
    or not exists (select 1 from auth.sessions s where s.user_id=v_actor
      and s.id::text=auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after>clock_timestamp())) then
    raise exception 'staff_permission_template_auth_required' using errcode='42501';
  end if;
  select m.role into v_role from public.platform_role_memberships m
  where m.user_id=v_actor::text and m.status='active'
    and m.role in ('owner','operator','moderator')
    and (m.expires_at is null or m.expires_at>clock_timestamp())
  order by case m.role when 'owner' then 1 when 'operator' then 2 else 3 end limit 1;
  if v_role is null or public.is_account_access_restricted(v_actor::text) or
    (v_role<>'owner' and not exists (
      select 1 from public.platform_staff_permission_grants g
      where g.target_user_id=v_actor::text and g.status='active'
        and g.permission_key in ('staff_permission_templates','admin_grants')
        and (g.expires_at is null or g.expires_at>clock_timestamp())
    )) then
    raise exception 'staff_permission_templates_required' using errcode='42501';
  end if;
  if p_target_user_id is null or
    public.platform_resolve_exact_confirmed_subject_by_email_internal(p_target_email)
      is distinct from p_target_user_id then
    raise exception 'staff_permission_template_subject_changed';
  end if;
  if not public.platform_subject_has_role_internal(p_target_user_id::text,p_roles)
    or not exists (select 1 from public.platform_role_memberships m
      where m.user_id=p_target_user_id::text and m.status='active' and m.role=any(p_roles)
        and (m.expires_at is null or m.expires_at>clock_timestamp())) then
    raise exception 'target_admin_required';
  end if;
  if v_role<>'owner' and p_target_user_id=v_actor then
    raise exception 'staff_permission_template_self_denied' using errcode='42501';
  end if;
  select lower(trim(u.email)) into v_email from auth.users u where u.id=v_actor;
  select s.id into v_break_glass from public.platform_break_glass_sessions s
  where s.actor_user_id=v_actor::text and s.status='active'
    and s.expires_at>clock_timestamp() and public.is_first_owner(v_actor::text,null)
  order by s.activated_at desc,s.id desc limit 1;
  return jsonb_build_object('role',v_role,'email',v_email,'breakGlassSessionId',v_break_glass);
end;
$$;

create or replace function public.admin_mutate_staff_permission_template(
  p_operation text,
  p_target_email text,
  p_target_user_id uuid,
  p_template_key text,
  p_reason text,
  p_expires_at timestamptz default null,
  p_security_context_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_operation text := lower(trim(coalesce(p_operation,'')));
  v_key text := lower(trim(coalesce(p_template_key,'')));
  v_email text := nullif(lower(trim(coalesce(p_target_email,''))),'');
  v_template jsonb;
  v_roles text[];
  v_keys text[];
  v_actor uuid := auth.uid();
  v_subject uuid;
  v_authority jsonb;
  v_role text;
  v_break_glass uuid;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_now timestamptz;
  v_permission text;
  v_grant public.platform_staff_permission_grants%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_metadata jsonb;
  v_security_metadata jsonb := jsonb_build_object('security_context_id',null,
    'security_context_capture_status','unavailable','security_context_network_proof_state','missing',
    'security_context_network_proof_verified',false,'security_context_source',null);
begin
  if v_operation not in ('apply','revoke') then raise exception 'template_operation_invalid'; end if;
  v_template := private.staff_permission_template(v_key);
  if v_template is null then raise exception 'template_not_found'; end if;
  if v_email is null then raise exception 'target_email_required'; end if;
  v_roles := case when v_key in ('moderator','senior_moderator','moderator_support')
    then array['operator','moderator']::text[] else array['operator']::text[] end;
  select array_agg(value) into v_keys from jsonb_array_elements_text(v_template->'permissions');

  -- Reject unauthorized calls before entering another subject's lock queue.
  perform private.assert_staff_permission_template_authority(p_target_user_id,v_email,v_roles);
  -- Also serialize changes to the actor's template-manager permission. Sorted
  -- subjects prevent reciprocal managers from taking advisory locks backwards.
  for v_subject in select distinct subject from unnest(array[v_actor,p_target_user_id]) subject order by subject loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'platform-staff-permission:'||v_subject::text,0));
  end loop;
  -- Hold existing identity/session/role/manager rows through commit, including
  -- their normal non-template revocation paths. These locks create no roles.
  perform u.id from auth.users u where u.id in (v_actor,p_target_user_id) order by u.id for share;
  perform s.id from auth.sessions s where s.user_id=v_actor
    and s.id::text=auth.jwt()->>'session_id' for share;
  perform m.id from public.platform_role_memberships m
    where m.user_id in (v_actor::text,p_target_user_id::text) and m.status='active'
    order by m.id for share;
  perform g.id from public.platform_staff_permission_grants g
    where g.target_user_id=v_actor::text and g.status='active'
      and g.permission_key in ('staff_permission_templates','admin_grants')
    order by g.id for share;
  perform s.id from public.platform_break_glass_sessions s
    where s.actor_user_id=v_actor::text and s.status='active' order by s.id for share;
  v_authority := private.assert_staff_permission_template_authority(p_target_user_id,v_email,v_roles);
  v_role := v_authority->>'role';
  v_break_glass := (v_authority->>'breakGlassSessionId')::uuid;
  if v_role='owner' and v_break_glass is null then
    v_reason := coalesce(v_reason,'Owner '||case when v_operation='apply' then 'applied ' else 'revoked ' end
      ||(v_template->>'label')||' permission template.');
  elsif v_reason is null or length(v_reason)<6 then raise exception 'reason_required';
  end if;
  if length(v_reason)>1000 then raise exception 'reason_invalid'; end if;
  if v_operation='apply' and p_expires_at is not null and p_expires_at<=clock_timestamp() then
    raise exception 'platform_staff_permission_expiry_invalid';
  end if;
  if p_security_context_id is not null then
    -- security_request_context.session_id is a peppered bearer hash, not the
    -- Auth session UUID. Caller session authority was independently checked.
    -- Bind only an existing server-captured context for this actor and route.
    select jsonb_build_object('security_context_id',c.id,'security_context_capture_status',c.capture_status,
      'security_context_network_proof_state',coalesce(c.metadata->>'network_proof_state','missing'),
      'security_context_network_proof_verified',c.network_proof_verified,'security_context_source',c.source)
    into v_security_metadata from public.security_request_context c where c.id=p_security_context_id
      and c.user_id=v_actor and c.source='admin-owner-controls:template_'||v_operation for share;
    if not found then raise exception 'security_context_subject_mismatch'; end if;
  end if;
  if exists (select 1 from public.platform_staff_permission_grants g
    where g.status='active' and lower(trim(g.target_email))=v_email
      and g.target_user_id is distinct from p_target_user_id::text) then
    raise exception 'platform_staff_permission_subject_conflict';
  end if;
  if exists (select 1 from public.platform_staff_permission_grants g
    where g.status='active' and g.target_user_id=p_target_user_id::text
      and g.permission_key=any(v_keys) group by g.permission_key having count(*)>1) then
    raise exception 'target_permission_ambiguous';
  end if;
  v_now := clock_timestamp();
  v_metadata := jsonb_build_object('audit_required',v_role<>'owner' or v_break_glass is not null,
    'break_glass_active',v_break_glass is not null,'break_glass_session_id',v_break_glass,
    'granted_actor_role',v_role,'template_key',v_key,'exact_subject',true);
  if v_operation='apply' then
    foreach v_permission in array v_keys loop
      select g.* into v_grant from public.platform_staff_permission_grants g
        where g.status='active' and g.target_user_id=p_target_user_id::text and g.permission_key=v_permission
        for update;
      if found then
        update public.platform_staff_permission_grants set target_email=v_email,expires_at=p_expires_at,
          granted_at=v_now,granted_by=v_actor::text,metadata=coalesce(metadata,'{}'::jsonb)||v_metadata,
          reason=v_reason,revoked_at=null,revoked_by=null,updated_at=v_now
        where id=v_grant.id and target_user_id=p_target_user_id::text returning * into v_grant;
      else
        insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,
          reason,granted_by,granted_at,expires_at,updated_at,metadata)
        values(p_target_user_id::text,v_email,v_permission,'active',v_reason,v_actor::text,v_now,p_expires_at,v_now,v_metadata)
        returning * into v_grant;
      end if;
      v_results := v_results||jsonb_build_array(jsonb_build_object('id',v_grant.id,'target_user_id',v_grant.target_user_id,
        'permission_key',v_grant.permission_key,'status',v_grant.status,'expires_at',v_grant.expires_at));
    end loop;
  else
    with revoked as (
      update public.platform_staff_permission_grants set status='revoked',reason=v_reason,
        revoked_at=v_now,revoked_by=v_actor::text,updated_at=v_now
      where status='active' and target_user_id=p_target_user_id::text and permission_key=any(v_keys)
      returning id,target_user_id,permission_key,status
    ) select coalesce(jsonb_agg(to_jsonb(revoked) order by permission_key),'[]'::jsonb) into v_results from revoked;
  end if;
  v_metadata := v_metadata||jsonb_build_object('permissions',v_keys,'expires_at',p_expires_at,
    'revoked_count',case when v_operation='revoke' then jsonb_array_length(v_results) else null end)||v_security_metadata;
  if v_role<>'owner' or v_break_glass is not null then
    insert into public.platform_admin_audit_logs(actor_user_id,actor_email,actor_role,action,action_category,
      target_type,target_id,target_user_id,reason,severity,metadata,security_context_id)
    values(v_actor::text,v_authority->>'email',v_role,'staff_permission_template_'||v_operation,'role',
      'staff_permission_template',p_target_user_id::text,p_target_user_id::text,v_reason,'notice',v_metadata,p_security_context_id);
  end if;
  if v_break_glass is not null then
    insert into public.platform_break_glass_audit(session_id,actor_user_id,actor_email,actor_role,action,
      reason,target_type,target_id,metadata)
    values(v_break_glass,v_actor::text,v_authority->>'email',v_role,
      case when v_role='owner' then 'owner_action' else 'admin_action' end,v_reason,
      'staff_permission_template',p_target_user_id::text,v_metadata);
  end if;
  -- Audit inserts can wait too. Reject expired authority or changed Owner/audit
  -- classification after any such wait; PostgreSQL rolls every write back.
  if private.assert_staff_permission_template_authority(p_target_user_id,v_email,v_roles) is distinct from v_authority then
    raise exception 'staff_permission_template_authority_changed';
  end if;
  if v_operation='apply' and p_expires_at is not null and p_expires_at<=clock_timestamp() then
    raise exception 'platform_staff_permission_expiry_invalid';
  end if;
  if v_operation='apply' then
    return jsonb_build_object('ok',true,'permissions',v_results,'template',v_template||jsonb_build_object('key',v_key));
  end if;
  return jsonb_build_object('ok',true,'revoked',v_results);
end;
$$;

revoke all on function private.staff_permission_template(text) from public,anon,authenticated,service_role;
revoke all on function private.assert_staff_permission_template_authority(uuid,text,text[]) from public,anon,authenticated,service_role;
revoke all on function public.admin_mutate_staff_permission_template(text,text,uuid,text,text,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_mutate_staff_permission_template(text,text,uuid,text,text,timestamptz,uuid) to authenticated;
commit;
