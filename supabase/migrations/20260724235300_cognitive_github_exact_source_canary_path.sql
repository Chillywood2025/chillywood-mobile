-- Forward-only exact positive path binding for the low-risk source canary.
--
-- Documentation and test-only canaries retain their reviewed, dedicated
-- directories. The source canary is restricted to the independently mapped
-- Home main-tab component and cannot use filename casing or compound names to
-- enter auth, money, rights, roles, or any other source category.

alter function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text
)
rename to cognitive_consume_github_draft_pr_pre_source;

revoke all on function
  public.cognitive_consume_github_draft_pr_pre_source(
    text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
    public.cognitive_environment,text,text,text,uuid,bigint,numeric,
    text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
    text,text,text,text,text,text
  )
from public,anon,authenticated,service_role;

create function public.cognitive_consume_github_draft_pr_capability(
  p_capability_id text,
  p_opaque_bearer text,
  p_opaque_nonce text,
  p_call_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_repository_full_name text,
  p_branch_name text,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_provider text,
  p_operation text,
  p_path text,
  p_resource_lease_id uuid,
  p_bytes bigint,
  p_cost numeric,
  p_approval_scope_hash text,
  p_plan_snapshot_hash text,
  p_request_hash text,
  p_preflight_receipt_id uuid,
  p_required_tests_hash text,
  p_source_state_hash text,
  p_base_commit text,
  p_prior_blob_sha text,
  p_content_hash text,
  p_title_hash text,
  p_commit_message_hash text,
  p_pr_body_hash text,
  p_path_hash text,
  p_base_branch_hash text,
  p_branch_hash text,
  p_repository_hash text,
  p_prior_state_hash text,
  p_plan_contract_hash text,
  p_runtime_public_fingerprint_hash text,
  p_runtime_scope_manifest_hash text,
  p_service_identity_token text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_path is null
     or not (
       p_path ~
         '^docs/intelligence/canaries/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.md$'
       or p_path ~
         '^scripts/cognitive-canaries/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.(mjs|ts)$'
       or p_path = 'components/haptic-tab.tsx'
     ) then
    raise exception 'github_draft_pr_exact_source_path_rejected'
      using errcode = 'P0001';
  end if;

  return
    public.cognitive_consume_github_draft_pr_pre_source(
      p_capability_id,p_opaque_bearer,p_opaque_nonce,p_call_id,p_task_id,
      p_project_id,p_repository_full_name,p_branch_name,p_platform,
      p_environment,p_provider,p_operation,p_path,p_resource_lease_id,
      p_bytes,p_cost,p_approval_scope_hash,p_plan_snapshot_hash,p_request_hash,
      p_preflight_receipt_id,p_required_tests_hash,p_source_state_hash,
      p_base_commit,p_prior_blob_sha,p_content_hash,p_title_hash,
      p_commit_message_hash,p_pr_body_hash,p_path_hash,p_base_branch_hash,
      p_branch_hash,p_repository_hash,p_prior_state_hash,p_plan_contract_hash,
      p_runtime_public_fingerprint_hash,p_runtime_scope_manifest_hash,
      p_service_identity_token
    );
end;
$$;

revoke all on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text
) from public,anon,authenticated;

grant execute on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text
) to service_role;

comment on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text
) is
  'Consumes one exact governed draft-PR capability; source canaries are positively bound to components/haptic-tab.tsx and retain no merge or release authority.';
