-- Trusted Network Proof contract.
-- Adds signed-proxy proof state to security_request_context without storing raw IP
-- or trusting direct client-supplied proxy headers.

alter table public."security_request_context"
  add column if not exists "network_proof_verified" boolean not null default false,
  add column if not exists "network_proof_source" text,
  add column if not exists "network_proof_version" text,
  add column if not exists "network_proof_error" text,
  add column if not exists "network_proof_timestamp" timestamptz,
  add column if not exists "trusted_header_source" text;

create index if not exists "security_request_context_network_proof_idx"
  on public."security_request_context" ("network_proof_verified", "created_at" desc);

create index if not exists "security_request_context_network_proof_source_idx"
  on public."security_request_context" ("network_proof_source", "created_at" desc);

comment on column public."security_request_context"."network_proof_verified" is
  'True only when a server-side trusted proxy signed x-chillywood-network-proof and the Edge helper verified the HMAC/timestamp/payload.';

comment on column public."security_request_context"."network_proof_source" is
  'Verified proof source, for example signed_chillywood_proxy. Direct x-forwarded-for/x-real-ip/forwarded/cf-connecting-ip headers are not trusted.';

comment on column public."security_request_context"."network_proof_error" is
  'Fail-closed proof state such as missing, invalid, expired, or malformed when signed trusted network proof is unavailable.';

comment on column public."security_request_context"."trusted_header_source" is
  'Set to signed_chillywood_proxy only after signed proof verification. Spoofable direct proxy headers must not populate this field.';

create or replace function public."get_security_request_context_summary"(p_context_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public."security_request_context"%rowtype;
begin
  if auth.role() <> 'service_role'
    and not public.has_platform_role(array['owner'::text, 'operator'::text])
    and not public.has_platform_permission('audit_review')
    and not public.has_platform_permission('security_review')
  then
    raise exception 'security_context_admin_required';
  end if;

  select *
    into v_row
  from public."security_request_context"
  where "id" = p_context_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row."id",
    'userId', v_row."user_id",
    'sessionIdHashShort', case when v_row."session_id" is null then null else left(v_row."session_id", 12) || '...' || right(v_row."session_id", 6) end,
    'deviceHashShort', case when v_row."device_hash" is null then null else left(v_row."device_hash", 12) || '...' || right(v_row."device_hash", 6) end,
    'ipHashShort', left(v_row."ip_hash", 12) || '...' || right(v_row."ip_hash", 6),
    'maskedIp', v_row."ip_prefix_or_masked_ip",
    'country', v_row."country",
    'region', v_row."region",
    'cityApprox', v_row."city_approx",
    'asnOrIsp', v_row."asn_or_isp",
    'userAgentHashShort', case when v_row."user_agent_hash" is null then null else left(v_row."user_agent_hash", 12) || '...' || right(v_row."user_agent_hash", 6) end,
    'requestId', v_row."request_id",
    'source', v_row."source",
    'captureStatus', v_row."capture_status",
    'networkProofVerified', v_row."network_proof_verified",
    'networkProofSource', v_row."network_proof_source",
    'networkProofVersion', v_row."network_proof_version",
    'networkProofError', v_row."network_proof_error",
    'networkProofTimestamp', v_row."network_proof_timestamp",
    'trustedHeaderSource', v_row."trusted_header_source",
    'createdAt', v_row."created_at",
    'retentionExpiresAt', v_row."retention_expires_at"
  );
end;
$$;

revoke all on function public."get_security_request_context_summary"(uuid) from public;
grant execute on function public."get_security_request_context_summary"(uuid) to authenticated, service_role;

comment on table public."security_request_context" is
  'Restricted backend-only request context evidence. Stores hashed/masked signed proxy proof for audit linkage; direct client proxy headers are not trusted and raw IP is not stored.';
