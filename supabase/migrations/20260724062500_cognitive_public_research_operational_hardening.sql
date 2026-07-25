-- Operational hardening for public/non-personal Cognitive Level 0/1 research.
-- This migration narrows retention to the reviewed 30-day public-research
-- policy, makes publication provenance mandatory at the broker boundary,
-- derives extractive claim support from stored source evidence, gives the
-- independent evaluator one closed database operation, and adds one-way,
-- audited expiry tombstones. It creates no schedule and enables no switch.

create function public.cognitive_normalize_public_research_text(p_value text)
returns text
language sql
immutable
strict
set search_path=''
as $$
  select trim(regexp_replace(lower(normalize(p_value, NFKC)), '[^[:alnum:]]+', ' ', 'g'))
$$;
revoke all on function public.cognitive_normalize_public_research_text(text)
  from public,anon,authenticated,service_role;

create function public.cognitive_public_research_runtime_ready(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    p_platform='shared'::public.cognitive_platform
    and p_environment='production'::public.cognitive_environment
    and exists (
      select 1
      from public.intelligence_tasks task
      where task.id=p_task_id
        and task.project_id=p_project_id
        and task.platform=p_platform
        and task.environment=p_environment
        and task.cancelled_at is null
        and task.quarantined_at is null
        and transaction_timestamp()<task.deadman_at
    )
    and exists (
      select 1
      from public.autonomous_system_emergency_states emergency
      where emergency.system_id='product_intelligence_operator'
        and emergency.status='active'
    )
    and (
      select count(*) filter (where switch.enabled)
      from public.cognitive_governance_switches switch
      where switch.task_id=p_task_id
        and switch.project_id=p_project_id
        and switch.platform=p_platform
        and switch.environment=p_environment
        and switch.switch_key in (
          'cognitive_research_enabled','cognitive_memory_enabled'
        )
    )=2
    and exists (
      select 1
      from public.cognitive_governance_switches switch
      where switch.task_id=p_task_id
        and switch.project_id=p_project_id
        and switch.platform=p_platform
        and switch.environment=p_environment
        and switch.switch_key='cognitive_user_derived_memory_enabled'
        and not switch.enabled
    )
    and exists (
      select 1
      from public.cognitive_retention_policy_states policy
      where policy.task_id=p_task_id
        and policy.project_id=p_project_id
        and policy.platform=p_platform
        and policy.environment=p_environment
        and policy.policy_state='owner_counsel_decision_required'
        and not policy.user_derived_memory_allowed
        and not policy.raw_user_reports_allowed
        and not policy.raw_private_messages_allowed
        and not policy.raw_private_media_allowed
        and not policy.raw_user_analytics_allowed
        and not policy.private_model_input_allowed
    )
$$;
revoke all on function public.cognitive_public_research_runtime_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;

create or replace function public.cognitive_record_public_research_source(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_authority_id text,
  p_canonical_host text,
  p_source_type text,
  p_publisher text,
  p_ownership_identity text,
  p_source_reference_hash text,
  p_canonical_url_hash text,
  p_content_hash text,
  p_publication_date timestamptz,
  p_retrieval_date timestamptz,
  p_freshness_deadline timestamptz,
  p_is_primary boolean,
  p_bounded_excerpt text,
  p_citation_metadata jsonb,
  p_resolved_address_hashes text[],
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare source_id_value uuid;
declare retrieval_id_value uuid;
declare now_at timestamptz:=transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  if not public.cognitive_public_research_runtime_ready(
       p_task_id,p_project_id,p_platform,p_environment
     )
     or p_source_reference_hash !~ '^[a-f0-9]{64}$'
     or p_canonical_url_hash !~ '^[a-f0-9]{64}$'
     or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_publication_date is null
     or p_publication_date>p_retrieval_date
     or p_retrieval_date>now_at+interval '5 minutes'
     or p_retrieval_date<now_at-interval '48 hours'
     or p_freshness_deadline<=p_retrieval_date
     or p_freshness_deadline>p_retrieval_date+interval '30 days'
     or length(p_bounded_excerpt) not between 1 and 2000
     or public.cognitive_text_has_secret(p_bounded_excerpt)
     or public.cognitive_text_has_private_identifier(p_bounded_excerpt)
     or p_citation_metadata is null
     or not public.cognitive_json_is_sanitized(p_citation_metadata)
     or jsonb_typeof(p_citation_metadata)<>'object'
     or p_citation_metadata-'title'-'locator'<>'{}'::jsonb
     or length(trim(p_citation_metadata->>'title')) not between 1 and 512
     or length(trim(p_citation_metadata->>'locator')) not between 1 and 512
     or encode(extensions.digest(
          convert_to(p_citation_metadata->>'locator','UTF8'),'sha256'
        ),'hex')<>p_canonical_url_hash
     or cardinality(p_resolved_address_hashes) not between 1 and 16
     or exists (
       select 1 from unnest(p_resolved_address_hashes) value
       where value !~ '^[a-f0-9]{64}$'
     )
     or not exists (
       select 1 from public.cognitive_research_authorities authority
       where authority.authority_id=p_authority_id
         and authority.canonical_host=p_canonical_host
         and authority.source_type=p_source_type
         and authority.publisher=p_publisher
         and authority.ownership_identity=p_ownership_identity
     ) then
    raise exception 'public_research_source_rejected' using errcode='P0001';
  end if;
  insert into public.research_sources(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,
    status,summary,evidence_metadata,data_class,retention_until,
    authority_id,canonical_host,ownership_identity,source_reference_hash,
    canonical_url_hash,content_hash,publisher,publication_date,retrieval_date,
    freshness_deadline,source_type,is_primary,bounded_excerpt,citation_metadata,
    trusted_for_tool_execution
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'research-source-broker',
    'public-source-'||substr(p_canonical_url_hash,1,32),'accepted',
    '{}'::jsonb,'{}'::jsonb,'research_cache',
    least(p_freshness_deadline,now_at+interval '30 days'),
    p_authority_id,p_canonical_host,p_ownership_identity,
    p_source_reference_hash,p_canonical_url_hash,p_content_hash,p_publisher,
    p_publication_date,p_retrieval_date,p_freshness_deadline,p_source_type,
    p_is_primary,p_bounded_excerpt,p_citation_metadata,false
  ) returning id into source_id_value;
  insert into public.research_retrieval_events(
    source_id,task_id,project_id,platform,environment,request_url_hash,
    resolved_address_hashes,response_hash,result
  ) values (
    source_id_value,p_task_id,p_project_id,p_platform,p_environment,
    p_canonical_url_hash,p_resolved_address_hashes,p_content_hash,'accepted'
  ) returning id into retrieval_id_value;
  return jsonb_build_object(
    'source_id',source_id_value,
    'retrieval_id',retrieval_id_value,
    'content_hash',p_content_hash,
    'retention_until',least(p_freshness_deadline,now_at+interval '30 days')
  );
end;
$$;
revoke all on function public.cognitive_record_public_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,
  boolean,text,jsonb,text[],text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_public_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,
  boolean,text,jsonb,text[],text
) to service_role;

create or replace function public.cognitive_record_public_research_claim_evidence(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_canary_key text,
  p_bounded_claim text,
  p_category text,
  p_confidence numeric,
  p_freshness_deadline timestamptz,
  p_contradiction_state text,
  p_source_ids uuid[],
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare claim_id_value uuid;
declare claim_hash_value text;
declare source_id_value uuid;
declare independent_source_count integer;
declare independent_url_count integer;
declare independent_content_count integer;
declare official_primary_count integer;
declare exact_source_count integer;
declare now_at timestamptz:=transaction_timestamp();
declare normalized_claim text;
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  normalized_claim:=public.cognitive_normalize_public_research_text(
    p_bounded_claim
  );
  if not public.cognitive_public_research_runtime_ready(
       p_task_id,p_project_id,p_platform,p_environment
     )
     or p_canary_key not in (
       'platform_policy_research','repository_architecture_ux',
       'dependency_security_research'
     )
     or p_category not in (
       'technical','platform_policy','consequential_news','product','security'
     )
     or p_confidence not between 0 and 1
     or p_freshness_deadline<=now_at
     or p_freshness_deadline>now_at+interval '30 days'
     or p_contradiction_state not in ('none','detected','unresolved','resolved')
     or cardinality(p_source_ids) not between 1 and 8
     or (
       select count(distinct source_id) from unnest(p_source_ids) source_id
     )<>cardinality(p_source_ids)
     or length(p_bounded_claim) not between 4 and 2000
     or length(normalized_claim)<4
     or public.cognitive_text_has_secret(p_bounded_claim)
     or public.cognitive_text_has_private_identifier(p_bounded_claim) then
    raise exception 'public_research_claim_evidence_rejected'
      using errcode='P0001';
  end if;
  select
    count(*)::integer,
    count(distinct source.ownership_identity)::integer,
    count(distinct source.canonical_url_hash)::integer,
    count(distinct source.content_hash)::integer,
    count(*) filter (
      where source.is_primary and source.source_type in (
        'official_documentation','security_advisory',
        'platform_policy','store_policy'
      )
    )::integer
  into exact_source_count,independent_source_count,independent_url_count,
    independent_content_count,official_primary_count
  from public.research_sources source
  where source.id=any(p_source_ids)
    and source.task_id=p_task_id and source.project_id=p_project_id
    and source.platform=p_platform and source.environment=p_environment
    and source.publication_date is not null
    and source.erased_at is null
    and source.retention_until>now_at
    and source.freshness_deadline>=p_freshness_deadline
    and position(
      normalized_claim in
      public.cognitive_normalize_public_research_text(source.bounded_excerpt)
    )>0
    and exists (
      select 1 from public.research_retrieval_events retrieval
      where retrieval.source_id=source.id
        and retrieval.task_id=source.task_id
        and retrieval.result='accepted'
        and retrieval.request_url_hash=source.canonical_url_hash
        and retrieval.response_hash=source.content_hash
    );
  if exact_source_count<>cardinality(p_source_ids)
     or (p_category in ('technical','platform_policy','security')
       and official_primary_count<1)
     or (
       p_category='consequential_news'
       and least(
         independent_source_count,independent_url_count,independent_content_count
       )<2
     ) then
    raise exception 'public_research_claim_provenance_rejected'
      using errcode='P0001';
  end if;
  claim_hash_value:=encode(extensions.digest(
    convert_to(p_bounded_claim,'UTF8'),'sha256'
  ),'hex');
  insert into public.research_claims(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,
    status,summary,evidence_metadata,data_class,retention_until,
    claim_hash,bounded_claim,confidence,category,freshness_deadline,
    contradiction_state,support_state
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'research-source-broker',
    'research-claim-'||p_canary_key,'pending','{}'::jsonb,'{}'::jsonb,
    'research_cache',least(p_freshness_deadline,now_at+interval '30 days'),
    claim_hash_value,p_bounded_claim,p_confidence,p_category,p_freshness_deadline,
    p_contradiction_state,
    case when p_contradiction_state in ('detected','unresolved')
      then 'contradicted' else 'supported' end
  ) returning id into claim_id_value;
  foreach source_id_value in array p_source_ids loop
    insert into public.research_claim_sources(
      claim_id,source_id,task_id,project_id,platform,environment,relationship
    ) values (
      claim_id_value,source_id_value,p_task_id,p_project_id,p_platform,
      p_environment,case when p_contradiction_state in ('detected','unresolved')
        then 'contradicts' else 'supports' end
    );
  end loop;
  update public.research_claims set
    status=case when p_contradiction_state in ('detected','unresolved')
      then 'contradicted' else 'supported' end
  where id=claim_id_value and status='pending';
  return claim_id_value;
end;
$$;
revoke all on function public.cognitive_record_public_research_claim_evidence(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,numeric,timestamptz,text,uuid[],text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_public_research_claim_evidence(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,numeric,timestamptz,text,uuid[],text
) to service_role;

create function public.cognitive_derive_public_research_evaluation(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_subject_type text,
  p_subject_id uuid,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare claim_value public.research_claims%rowtype;
declare fail_reasons text[]:='{}'::text[];
declare blocked_reasons text[]:='{}'::text[];
declare reasons text[];
declare derived_status public.cognitive_evaluation_status;
declare evidence_value jsonb;
declare evidence_hash_value text;
declare manifest_id uuid;
declare result_id uuid;
declare now_at timestamptz:=transaction_timestamp();
declare source_count integer;
declare relation_count integer;
declare official_count integer;
declare news_owner_count integer;
declare news_url_count integer;
declare news_content_count integer;
begin
  perform public.cognitive_verify_service_token(
    'independent_evaluation_judge',p_service_identity_token
  );
  if p_subject_type<>'research_claim'
     or not public.cognitive_public_research_runtime_ready(
       p_task_id,p_project_id,p_platform,p_environment
     ) then
    raise exception 'public_research_evaluation_rejected' using errcode='P0001';
  end if;
  select * into claim_value
  from public.research_claims claim
  where claim.id=p_subject_id
    and claim.task_id=p_task_id and claim.project_id=p_project_id
    and claim.platform=p_platform and claim.environment=p_environment
  for share;
  if claim_value.id is null then
    raise exception 'public_research_evaluation_rejected' using errcode='P0001';
  end if;
  if claim_value.claim_hash<>encode(extensions.digest(
       convert_to(claim_value.bounded_claim,'UTF8'),'sha256'
     ),'hex')
     or length(claim_value.bounded_claim) not between 4 and 2000
     or length(public.cognitive_normalize_public_research_text(
       claim_value.bounded_claim
     ))<4
     or public.cognitive_text_has_secret(claim_value.bounded_claim)
     or public.cognitive_text_has_private_identifier(claim_value.bounded_claim)
     or claim_value.data_class<>'research_cache'
     or claim_value.retention_until is null
     or claim_value.retention_until>
       claim_value.created_at+interval '30 days' then
    fail_reasons:=array_append(fail_reasons,'claim_contract_invalid');
  end if;
  if claim_value.status<>'supported'
     or claim_value.support_state<>'supported' then
    fail_reasons:=array_append(fail_reasons,'claim_not_supported');
  end if;
  if claim_value.freshness_deadline<=now_at then
    blocked_reasons:=array_append(blocked_reasons,'claim_expired');
  end if;
  if claim_value.retention_until is null
     or claim_value.retention_until<=now_at
     or claim_value.erased_at is not null then
    blocked_reasons:=array_append(
      blocked_reasons,'claim_retention_expired'
    );
  end if;
  if claim_value.contradiction_state not in ('none','resolved')
     or exists (
       select 1 from public.research_contradictions contradiction
       where contradiction.claim_id=claim_value.id
         and contradiction.resolution_state='open'
     ) then
    blocked_reasons:=array_append(
      blocked_reasons,'claim_contradiction_unresolved'
    );
  end if;
  select
    count(*)::integer,
    count(*) filter (where relation.relationship='supports')::integer,
    count(*) filter (
      where relation.relationship='supports'
        and source.is_primary
        and source.source_type in (
          'official_documentation','security_advisory',
          'platform_policy','store_policy'
        )
    )::integer,
    count(distinct source.ownership_identity) filter (
      where relation.relationship='supports' and source.source_type='news'
    )::integer,
    count(distinct source.canonical_url_hash) filter (
      where relation.relationship='supports' and source.source_type='news'
    )::integer,
    count(distinct source.content_hash) filter (
      where relation.relationship='supports' and source.source_type='news'
    )::integer
  into source_count,relation_count,official_count,news_owner_count,
    news_url_count,news_content_count
  from public.research_claim_sources relation
  join public.research_sources source
    on source.id=relation.source_id
   and source.task_id=relation.task_id
   and source.project_id=relation.project_id
   and source.platform=relation.platform
   and source.environment=relation.environment
  where relation.claim_id=claim_value.id
    and relation.task_id=claim_value.task_id
    and relation.project_id=claim_value.project_id
    and relation.platform=claim_value.platform
    and relation.environment=claim_value.environment;
  if source_count not between 1 and 8 or relation_count<>source_count then
    fail_reasons:=array_append(fail_reasons,'claim_source_relation_invalid');
  end if;
  if exists (
    select 1
    from public.research_claim_sources relation
    join public.research_sources source on source.id=relation.source_id
    where relation.claim_id=claim_value.id
      and (
        source.publication_date is null
        or source.publication_date>source.retrieval_date
        or source.retention_until is null
        or source.retention_until>source.retrieval_date+interval '30 days'
        or source.freshness_deadline<claim_value.freshness_deadline
        or source.content_hash<>encode(extensions.digest(
          convert_to(source.bounded_excerpt,'UTF8'),'sha256'
        ),'hex')
        or source.canonical_url_hash<>encode(extensions.digest(
          convert_to(source.citation_metadata->>'locator','UTF8'),'sha256'
        ),'hex')
        or position(
          public.cognitive_normalize_public_research_text(
            claim_value.bounded_claim
          ) in public.cognitive_normalize_public_research_text(
            source.bounded_excerpt
          )
        )=0
        or source.trusted_for_tool_execution
        or source.data_class<>'research_cache'
        or source.erased_at is not null
        or not exists (
          select 1
          from public.research_retrieval_events retrieval
          where retrieval.source_id=source.id
            and retrieval.task_id=source.task_id
            and retrieval.project_id=source.project_id
            and retrieval.platform=source.platform
            and retrieval.environment=source.environment
            and retrieval.result='accepted'
            and retrieval.request_url_hash=source.canonical_url_hash
            and retrieval.response_hash=source.content_hash
        )
      )
  ) then
    fail_reasons:=array_append(fail_reasons,'source_provenance_invalid');
  end if;
  if exists (
    select 1
    from public.research_claim_sources relation
    join public.research_sources source on source.id=relation.source_id
    where relation.claim_id=claim_value.id
      and (
        source.freshness_deadline<=now_at
        or source.retention_until<=now_at
      )
  ) then
    blocked_reasons:=array_append(blocked_reasons,'source_expired');
  end if;
  if claim_value.category in ('technical','platform_policy','security')
     and official_count<1 then
    fail_reasons:=array_append(
      fail_reasons,'official_primary_source_required'
    );
  end if;
  if claim_value.category='consequential_news'
     and least(news_owner_count,news_url_count,news_content_count)<2 then
    fail_reasons:=array_append(
      fail_reasons,'independent_news_corroboration_required'
    );
  end if;
  select coalesce(array_agg(reason order by reason),'{}'::text[])
  into reasons
  from (
    select distinct unnest(fail_reasons||blocked_reasons) as reason
  ) ordered_reasons;
  derived_status:=case
    when cardinality(fail_reasons)>0
      then 'fail'::public.cognitive_evaluation_status
    when cardinality(blocked_reasons)>0
      then 'blocked'::public.cognitive_evaluation_status
    else 'pass'::public.cognitive_evaluation_status
  end;
  evidence_value:=jsonb_build_object(
    'claimHash',claim_value.claim_hash,
    'supportState',claim_value.support_state,
    'contradictionState',claim_value.contradiction_state,
    'reasons',to_jsonb(reasons),
    'sourceEvidenceHashes',coalesce((
      select jsonb_agg(
        encode(extensions.digest(convert_to(concat_ws(
          '|',source.id::text,source.content_hash,source.canonical_url_hash,
          source.publication_date::text,retrieval.response_hash
        ),'UTF8'),'sha256'),'hex')
        order by source.id,retrieval.id
      )
      from public.research_claim_sources relation
      join public.research_sources source on source.id=relation.source_id
      join public.research_retrieval_events retrieval
        on retrieval.source_id=source.id and retrieval.result='accepted'
      where relation.claim_id=claim_value.id
    ),'[]'::jsonb)
  );
  evidence_hash_value:=encode(extensions.digest(
    convert_to(evidence_value::text,'UTF8'),'sha256'
  ),'hex');
  insert into public.cognitive_subject_evidence_manifests(
    task_id,project_id,platform,environment,subject_type,subject_id,
    derived_status,evidence_manifest,manifest_hash,expires_at
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'research_claim',
    p_subject_id,derived_status,evidence_value,evidence_hash_value,
    now_at+interval '24 hours'
  ) returning id into manifest_id;
  insert into public.cognitive_subject_evaluations(
    task_id,project_id,platform,environment,subject_type,subject_id,
    evaluation_status,evidence_hash,evaluator_identity_hash,
    evaluated_at,expires_at,evidence_manifest_id
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'research_claim',
    p_subject_id,derived_status,evidence_hash_value,
    encode(extensions.digest(convert_to(
      'independent_evaluation_judge','UTF8'
    ),'sha256'),'hex'),
    now_at,now_at+interval '24 hours',manifest_id
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_derive_public_research_evaluation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,uuid,text
) from public,anon,authenticated;
grant execute on function public.cognitive_derive_public_research_evaluation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,uuid,text
) to service_role;

create table public.cognitive_research_retention_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  target_table text not null check (
    target_table in ('research_sources','research_claims')
  ),
  target_id uuid not null,
  event_type text not null check (event_type='expired_tombstone'),
  prior_evidence_hash text not null check (
    prior_evidence_hash~'^[a-f0-9]{64}$'
  ),
  tombstone_hash text not null check (tombstone_hash~'^[a-f0-9]{64}$'),
  retention_policy_id text not null check (
    retention_policy_id='chillywood-cognitive-retention-v1'
  ),
  processor_identity_hash text not null check (
    processor_identity_hash~'^[a-f0-9]{64}$'
  ),
  expired_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default transaction_timestamp(),
  unique(target_table,target_id),
  foreign key (task_id,project_id,platform,environment)
    references public.intelligence_tasks(id,project_id,platform,environment)
);
alter table public.cognitive_research_retention_events enable row level security;
alter table public.cognitive_research_retention_events force row level security;
revoke all on table public.cognitive_research_retention_events
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_research_retention_events to service_role;
create trigger cognitive_research_retention_events_immutable
before update or delete on public.cognitive_research_retention_events
for each row execute function public.reject_cognitive_evidence_mutation();

drop trigger research_sources_immutable on public.research_sources;
create function public.cognitive_research_source_tombstone_only()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='DELETE'
     or old.erased_at is not null
     or old.legal_hold
     or old.retention_until is null
     or transaction_timestamp()<old.retention_until
     or new.erased_at is null
     or new.erased_at<old.retention_until
     or new.status<>'expired'
     or new.bounded_excerpt<>'[expired public research]'
     or new.citation_metadata<>jsonb_build_object(
       'title','Expired public research',
       'locator','retained-hash:'||old.canonical_url_hash
     )
     or (
       to_jsonb(new)-array[
         'status','bounded_excerpt','citation_metadata','erased_at'
       ]
     )<>(
       to_jsonb(old)-array[
         'status','bounded_excerpt','citation_metadata','erased_at'
       ]
     ) then
    raise exception 'immutable_cognitive_evidence' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.cognitive_research_source_tombstone_only()
  from public,anon,authenticated,service_role;
create trigger research_sources_tombstone_only
before update or delete on public.research_sources
for each row execute function public.cognitive_research_source_tombstone_only();

create trigger research_claims_delete_immutable
before delete on public.research_claims
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.cognitive_expire_public_research(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_limit integer,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare source_value public.research_sources%rowtype;
declare claim_value public.research_claims%rowtype;
declare source_count integer:=0;
declare claim_count integer:=0;
declare tombstone_hash_value text;
declare processor_hash constant text:=encode(extensions.digest(
  convert_to('research_source_broker:expire_public_research','UTF8'),
  'sha256'
),'hex');
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  if p_platform<>'shared' or p_environment<>'production'
     or p_limit not between 1 and 100
     or not exists (
       select 1
       from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
     )
     or not exists (
       select 1
       from public.autonomous_system_emergency_states emergency
       where emergency.system_id='product_intelligence_operator'
         and emergency.status='active'
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id=p_task_id and switch.project_id=p_project_id
         and switch.platform=p_platform and switch.environment=p_environment
         and switch.switch_key='cognitive_user_derived_memory_enabled'
         and not switch.enabled
     )
     or not exists (
       select 1
       from public.cognitive_retention_policy_states policy
       where policy.task_id=p_task_id and policy.project_id=p_project_id
         and policy.platform=p_platform and policy.environment=p_environment
         and policy.policy_state='owner_counsel_decision_required'
         and not policy.user_derived_memory_allowed
         and not policy.raw_user_reports_allowed
         and not policy.raw_private_messages_allowed
         and not policy.raw_private_media_allowed
         and not policy.raw_user_analytics_allowed
         and not policy.private_model_input_allowed
     ) then
    raise exception 'public_research_expiry_rejected' using errcode='P0001';
  end if;
  for source_value in
    select * from public.research_sources source
    where source.task_id=p_task_id and source.project_id=p_project_id
      and source.platform=p_platform and source.environment=p_environment
      and source.data_class='research_cache' and not source.legal_hold
      and source.erased_at is null
      and source.retention_until<=transaction_timestamp()
    order by source.retention_until,source.id
    limit p_limit
    for update skip locked
  loop
    tombstone_hash_value:=encode(extensions.digest(convert_to(concat_ws(
      '|','research_sources',source_value.id::text,source_value.content_hash,
      source_value.retention_until::text,'chillywood-cognitive-retention-v1'
    ),'UTF8'),'sha256'),'hex');
    update public.research_sources set
      status='expired',
      bounded_excerpt='[expired public research]',
      citation_metadata=jsonb_build_object(
        'title','Expired public research',
        'locator','retained-hash:'||source_value.canonical_url_hash
      ),
      erased_at=transaction_timestamp()
    where id=source_value.id;
    insert into public.cognitive_research_retention_events(
      task_id,project_id,platform,environment,target_table,target_id,
      event_type,prior_evidence_hash,tombstone_hash,retention_policy_id,
      processor_identity_hash
    ) values (
      source_value.task_id,source_value.project_id,source_value.platform,
      source_value.environment,'research_sources',source_value.id,
      'expired_tombstone',source_value.content_hash,tombstone_hash_value,
      'chillywood-cognitive-retention-v1',processor_hash
    );
    insert into public.cognitive_erasure_events(
      task_id,project_id,platform,environment,target_table,target_id,
      prior_data_class,tombstone_hash,legal_hold,erased_at,actor_identity
    ) values (
      source_value.task_id,source_value.project_id,source_value.platform,
      source_value.environment,'research_sources',source_value.id,
      source_value.data_class,tombstone_hash_value,false,
      transaction_timestamp(),'research_source_broker'
    );
    source_count:=source_count+1;
  end loop;
  for claim_value in
    select * from public.research_claims claim
    where claim.task_id=p_task_id and claim.project_id=p_project_id
      and claim.platform=p_platform and claim.environment=p_environment
      and claim.data_class='research_cache' and not claim.legal_hold
      and claim.erased_at is null
      and claim.retention_until<=transaction_timestamp()
    order by claim.retention_until,claim.id
    limit greatest(p_limit-source_count,0)
    for update skip locked
  loop
    tombstone_hash_value:=encode(extensions.digest(convert_to(concat_ws(
      '|','research_claims',claim_value.id::text,claim_value.claim_hash,
      claim_value.retention_until::text,'chillywood-cognitive-retention-v1'
    ),'UTF8'),'sha256'),'hex');
    update public.research_claims set
      status='stale',
      support_state='stale',
      bounded_claim='[expired research claim]',
      erased_at=transaction_timestamp()
    where id=claim_value.id;
    insert into public.cognitive_research_retention_events(
      task_id,project_id,platform,environment,target_table,target_id,
      event_type,prior_evidence_hash,tombstone_hash,retention_policy_id,
      processor_identity_hash
    ) values (
      claim_value.task_id,claim_value.project_id,claim_value.platform,
      claim_value.environment,'research_claims',claim_value.id,
      'expired_tombstone',claim_value.claim_hash,tombstone_hash_value,
      'chillywood-cognitive-retention-v1',processor_hash
    );
    insert into public.cognitive_erasure_events(
      task_id,project_id,platform,environment,target_table,target_id,
      prior_data_class,tombstone_hash,legal_hold,erased_at,actor_identity
    ) values (
      claim_value.task_id,claim_value.project_id,claim_value.platform,
      claim_value.environment,'research_claims',claim_value.id,
      claim_value.data_class,tombstone_hash_value,false,
      transaction_timestamp(),'research_source_broker'
    );
    claim_count:=claim_count+1;
  end loop;
  return jsonb_build_object(
    'source_count',source_count,
    'claim_count',claim_count,
    'total_count',source_count+claim_count,
    'retention_policy_id','chillywood-cognitive-retention-v1'
  );
end;
$$;
revoke all on function public.cognitive_expire_public_research(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text
) from public,anon,authenticated;
grant execute on function public.cognitive_expire_public_research(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text
) to service_role;

comment on table public.cognitive_research_retention_events is
  'Immutable non-personal audit of 30-day public-research expiry; original bounded text is replaced by a one-way tombstone while safe hashes remain.';
comment on function public.cognitive_derive_public_research_evaluation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,uuid,text
) is
  'Closed independent-evaluator operation. Status, reasons, and evidence hash are derived only from stored public research evidence.';
comment on function public.cognitive_expire_public_research(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text
) is
  'Bounded idempotent public-research expiry processor. No user-derived memory, deletion, or legal hold override is permitted.';
