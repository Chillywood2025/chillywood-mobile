-- Close the remaining public-research provenance, contradiction, and
-- retention-maintenance gaps. This migration enables no switch or schedule.

alter table public.research_sources
  add column publication_provenance jsonb not null default jsonb_build_object(
    'mode','legacy_reviewed_metadata',
    'machineValue','legacy-reviewed-source-v1',
    'semanticIdentity','legacy-reviewed-source-v1',
    'evidenceHash',encode(extensions.digest(
      convert_to('legacy-reviewed-source-v1','UTF8'),'sha256'
    ),'hex')
  );

alter table public.research_sources
  add constraint research_sources_publication_provenance_check check (
    jsonb_typeof(publication_provenance)='object'
    and publication_provenance
      -'mode'-'machineValue'-'semanticIdentity'-'evidenceHash'='{}'::jsonb
    and publication_provenance->>'mode' in (
      'legacy_reviewed_metadata','published_metadata','github_commit_metadata'
    )
    and length(publication_provenance->>'machineValue') between 4 and 128
    and length(publication_provenance->>'semanticIdentity') between 4 and 160
    and publication_provenance->>'evidenceHash'~'^[a-f0-9]{64}$'
    and public.cognitive_json_is_sanitized(publication_provenance)
  );

create function public.cognitive_record_public_research_source_v2(
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
  p_publication_provenance jsonb,
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
declare expected_provenance_hash text;
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  expected_provenance_hash:=encode(extensions.digest(convert_to(concat_ws(
    '|',p_publication_provenance->>'mode',
    p_publication_provenance->>'machineValue',
    p_publication_provenance->>'semanticIdentity'
  ),'UTF8'),'sha256'),'hex');
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
     or p_publication_provenance is null
     or jsonb_typeof(p_publication_provenance)<>'object'
     or p_publication_provenance
       -'mode'-'machineValue'-'semanticIdentity'-'evidenceHash'<>'{}'::jsonb
     or p_publication_provenance->>'mode' not in (
       'published_metadata','github_commit_metadata'
     )
     or (p_publication_provenance->>'machineValue')::timestamptz
       is distinct from p_publication_date
     or p_publication_provenance->>'evidenceHash'
       is distinct from expected_provenance_hash
     or (
       p_authority_id='chillywood-public-repository'
       and (
         p_canonical_host<>'github.com'
         or p_source_type<>'engineering_practice'
         or p_publication_provenance->>'mode'<>'github_commit_metadata'
         or p_publication_provenance->>'semanticIdentity'
           !~ '^github-commit:[a-f0-9]{40}$'
       )
     )
     or (
       p_authority_id<>'chillywood-public-repository'
       and p_publication_provenance->>'mode'<>'published_metadata'
     )
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
    raise exception 'public_research_source_v2_rejected' using errcode='P0001';
  end if;
  insert into public.research_sources(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,
    status,summary,evidence_metadata,data_class,retention_until,
    authority_id,canonical_host,ownership_identity,source_reference_hash,
    canonical_url_hash,content_hash,publisher,publication_date,
    publication_provenance,retrieval_date,freshness_deadline,source_type,
    is_primary,bounded_excerpt,citation_metadata,trusted_for_tool_execution
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'research-source-broker',
    'public-source-v2-'||substr(p_canonical_url_hash,1,29),'accepted',
    '{}'::jsonb,'{}'::jsonb,'research_cache',
    least(p_freshness_deadline,now_at+interval '30 days'),
    p_authority_id,p_canonical_host,p_ownership_identity,
    p_source_reference_hash,p_canonical_url_hash,p_content_hash,p_publisher,
    p_publication_date,p_publication_provenance,p_retrieval_date,
    p_freshness_deadline,p_source_type,p_is_primary,p_bounded_excerpt,
    p_citation_metadata,false
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
    'provenance_hash',expected_provenance_hash,
    'retention_until',least(p_freshness_deadline,now_at+interval '30 days')
  );
end;
$$;
revoke all on function public.cognitive_record_public_research_source_v2(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,jsonb,timestamptz,
  timestamptz,boolean,text,jsonb,text[],text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_public_research_source_v2(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,jsonb,timestamptz,
  timestamptz,boolean,text,jsonb,text[],text
) to service_role;

-- The broker claim writer no longer accepts caller-declared contradiction
-- state. Detection and resolution use the closed writers below.
alter function public.cognitive_record_public_research_claim_evidence(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,numeric,timestamptz,text,uuid[],text
) rename to cognitive_record_public_research_claim_evidence_internal;
revoke all on function
  public.cognitive_record_public_research_claim_evidence_internal(
    uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    text,text,text,numeric,timestamptz,text,uuid[],text
  ) from public,anon,authenticated,service_role;

create function public.cognitive_record_public_research_claim_evidence(
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
begin
  if p_contradiction_state<>'none' then
    raise exception 'caller_contradiction_state_rejected' using errcode='P0001';
  end if;
  return public.cognitive_record_public_research_claim_evidence_internal(
    p_task_id,p_project_id,p_platform,p_environment,p_canary_key,
    p_bounded_claim,p_category,p_confidence,p_freshness_deadline,'none',
    p_source_ids,p_service_identity_token
  );
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

create table public.cognitive_research_contradiction_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  contradiction_id uuid not null,
  claim_id uuid not null,
  source_id uuid not null,
  event_type text not null check (event_type in ('detected','resolved')),
  evidence_hash text not null check (evidence_hash~'^[a-f0-9]{64}$'),
  prior_event_hash text check (
    prior_event_hash is null or prior_event_hash~'^[a-f0-9]{64}$'
  ),
  proof_hash text check (proof_hash is null or proof_hash~'^[a-f0-9]{64}$'),
  proof_manifest jsonb check (
    proof_manifest is null
    or (
      pg_column_size(proof_manifest)<=8192
      and public.cognitive_json_is_sanitized(proof_manifest)
    )
  ),
  actor_identity_hash text not null check (
    actor_identity_hash~'^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique(contradiction_id,event_type),
  foreign key (contradiction_id) references public.research_contradictions(id),
  foreign key (claim_id,task_id,project_id,platform,environment)
    references public.research_claims(
      id,task_id,project_id,platform,environment
    ),
  foreign key (source_id,task_id,project_id,platform,environment)
    references public.research_sources(
      id,task_id,project_id,platform,environment
    ),
  check (
    (
      event_type='detected' and prior_event_hash is null
      and proof_hash is null and proof_manifest is null
    )
    or (
      event_type='resolved' and prior_event_hash is not null
      and proof_hash is not null and jsonb_typeof(proof_manifest)='object'
      and proof_manifest
        -'detectionEvidenceHash'-'resolutionEvidenceHash'
        -'resolutionSourceContentHash'-'evaluatorIdentityHash'='{}'::jsonb
    )
  )
);
alter table public.cognitive_research_contradiction_events
  enable row level security;
alter table public.cognitive_research_contradiction_events
  force row level security;
revoke all on table public.cognitive_research_contradiction_events
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_research_contradiction_events
  to service_role;
create trigger cognitive_research_contradiction_events_immutable
before update or delete on public.cognitive_research_contradiction_events
for each row execute function public.reject_cognitive_evidence_mutation();

drop trigger research_contradictions_immutable
  on public.research_contradictions;
create function public.cognitive_research_contradiction_resolution_only()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='DELETE'
     or old.resolution_state<>'open'
     or new.resolution_state<>'resolved'
     or (to_jsonb(new)-'resolution_state')
       is distinct from (to_jsonb(old)-'resolution_state')
     or not exists (
       select 1
       from public.cognitive_research_contradiction_events event
       where event.contradiction_id=old.id
         and event.claim_id=old.claim_id
         and event.event_type='resolved'
         and event.prior_event_hash=old.evidence_hash
         and event.proof_hash is not null
     ) then
    raise exception 'immutable_cognitive_evidence' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function
  public.cognitive_research_contradiction_resolution_only()
  from public,anon,authenticated,service_role;
create trigger research_contradictions_resolution_only
before update or delete on public.research_contradictions
for each row execute function
  public.cognitive_research_contradiction_resolution_only();

create function public.cognitive_record_public_research_contradiction_detection(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_claim_id uuid,
  p_source_id uuid,
  p_bounded_evidence text,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare claim_value public.research_claims%rowtype;
declare source_value public.research_sources%rowtype;
declare contradiction_id_value uuid;
declare event_id_value uuid;
declare evidence_hash_value text;
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  select * into claim_value from public.research_claims claim
  where claim.id=p_claim_id and claim.task_id=p_task_id
    and claim.project_id=p_project_id and claim.platform=p_platform
    and claim.environment=p_environment for update;
  select * into source_value from public.research_sources source
  where source.id=p_source_id and source.task_id=p_task_id
    and source.project_id=p_project_id and source.platform=p_platform
    and source.environment=p_environment;
  if not public.cognitive_public_research_runtime_ready(
       p_task_id,p_project_id,p_platform,p_environment
     )
     or claim_value.id is null or source_value.id is null
     or claim_value.erased_at is not null
     or claim_value.contradiction_state not in ('none','resolved')
     or source_value.erased_at is not null
     or source_value.retention_until<=transaction_timestamp()
     or source_value.freshness_deadline<=transaction_timestamp()
     or length(p_bounded_evidence) not between 4 and 2000
     or public.cognitive_text_has_secret(p_bounded_evidence)
     or public.cognitive_text_has_private_identifier(p_bounded_evidence)
     or position(
       public.cognitive_normalize_public_research_text(p_bounded_evidence)
       in public.cognitive_normalize_public_research_text(
         source_value.bounded_excerpt
       )
     )=0
     or not exists (
       select 1 from public.research_retrieval_events retrieval
       where retrieval.source_id=source_value.id
         and retrieval.task_id=p_task_id
         and retrieval.result='accepted'
         and retrieval.request_url_hash=source_value.canonical_url_hash
         and retrieval.response_hash=source_value.content_hash
     ) then
    raise exception 'research_contradiction_detection_rejected'
      using errcode='P0001';
  end if;
  evidence_hash_value:=encode(extensions.digest(
    convert_to(p_bounded_evidence,'UTF8'),'sha256'
  ),'hex');
  insert into public.research_contradictions(
    claim_id,source_id,task_id,project_id,platform,environment,
    evidence_hash,resolution_state
  ) values (
    p_claim_id,p_source_id,p_task_id,p_project_id,p_platform,p_environment,
    evidence_hash_value,'open'
  ) returning id into contradiction_id_value;
  insert into public.cognitive_research_contradiction_events(
    task_id,project_id,platform,environment,contradiction_id,claim_id,
    source_id,event_type,evidence_hash,actor_identity_hash
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,contradiction_id_value,
    p_claim_id,p_source_id,'detected',evidence_hash_value,
    encode(extensions.digest(
      convert_to('research_source_broker','UTF8'),'sha256'
    ),'hex')
  ) returning id into event_id_value;
  update public.research_claims set
    status='contradicted',support_state='contradicted',
    contradiction_state='detected'
  where id=p_claim_id;
  return jsonb_build_object(
    'contradiction_id',contradiction_id_value,
    'event_id',event_id_value,
    'evidence_hash',evidence_hash_value
  );
end;
$$;
revoke all on function
  public.cognitive_record_public_research_contradiction_detection(
    uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    uuid,uuid,text,text
  ) from public,anon,authenticated;
grant execute on function
  public.cognitive_record_public_research_contradiction_detection(
    uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    uuid,uuid,text,text
  ) to service_role;

create function public.cognitive_resolve_public_research_contradiction(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_contradiction_id uuid,
  p_resolution_source_id uuid,
  p_bounded_evidence text,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare contradiction_value public.research_contradictions%rowtype;
declare source_value public.research_sources%rowtype;
declare detection_event public.cognitive_research_contradiction_events%rowtype;
declare resolution_event_id uuid;
declare resolution_evidence_hash text;
declare proof_hash_value text;
declare proof_manifest_value jsonb;
begin
  perform public.cognitive_verify_service_token(
    'independent_evaluation_judge',p_service_identity_token
  );
  select * into contradiction_value
  from public.research_contradictions contradiction
  where contradiction.id=p_contradiction_id
    and contradiction.task_id=p_task_id
    and contradiction.project_id=p_project_id
    and contradiction.platform=p_platform
    and contradiction.environment=p_environment
    and contradiction.resolution_state='open'
  for update;
  select * into detection_event
  from public.cognitive_research_contradiction_events event
  where event.contradiction_id=p_contradiction_id
    and event.event_type='detected';
  select * into source_value from public.research_sources source
  where source.id=p_resolution_source_id and source.task_id=p_task_id
    and source.project_id=p_project_id and source.platform=p_platform
    and source.environment=p_environment;
  if not public.cognitive_public_research_runtime_ready(
       p_task_id,p_project_id,p_platform,p_environment
     )
     or contradiction_value.id is null or detection_event.id is null
     or source_value.id is null
     or source_value.id=contradiction_value.source_id
     or source_value.erased_at is not null
     or source_value.retention_until<=transaction_timestamp()
     or source_value.freshness_deadline<=transaction_timestamp()
     or length(p_bounded_evidence) not between 4 and 2000
     or public.cognitive_text_has_secret(p_bounded_evidence)
     or public.cognitive_text_has_private_identifier(p_bounded_evidence)
     or position(
       public.cognitive_normalize_public_research_text(p_bounded_evidence)
       in public.cognitive_normalize_public_research_text(
         source_value.bounded_excerpt
       )
     )=0
     or not exists (
       select 1 from public.research_retrieval_events retrieval
       where retrieval.source_id=source_value.id
         and retrieval.task_id=p_task_id
         and retrieval.result='accepted'
         and retrieval.request_url_hash=source_value.canonical_url_hash
         and retrieval.response_hash=source_value.content_hash
     ) then
    raise exception 'research_contradiction_resolution_rejected'
      using errcode='P0001';
  end if;
  resolution_evidence_hash:=encode(extensions.digest(
    convert_to(p_bounded_evidence,'UTF8'),'sha256'
  ),'hex');
  proof_manifest_value:=jsonb_build_object(
    'detectionEvidenceHash',detection_event.evidence_hash,
    'resolutionEvidenceHash',resolution_evidence_hash,
    'resolutionSourceContentHash',source_value.content_hash,
    'evaluatorIdentityHash',encode(extensions.digest(
      convert_to('independent_evaluation_judge','UTF8'),'sha256'
    ),'hex')
  );
  proof_hash_value:=encode(extensions.digest(
    convert_to(proof_manifest_value::text,'UTF8'),'sha256'
  ),'hex');
  insert into public.cognitive_research_contradiction_events(
    task_id,project_id,platform,environment,contradiction_id,claim_id,
    source_id,event_type,evidence_hash,prior_event_hash,proof_hash,
    proof_manifest,actor_identity_hash
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_contradiction_id,
    contradiction_value.claim_id,p_resolution_source_id,'resolved',
    resolution_evidence_hash,detection_event.evidence_hash,proof_hash_value,
    proof_manifest_value,encode(extensions.digest(
      convert_to('independent_evaluation_judge','UTF8'),'sha256'
    ),'hex')
  ) returning id into resolution_event_id;
  update public.research_contradictions
  set resolution_state='resolved'
  where id=p_contradiction_id;
  update public.research_claims claim set
    contradiction_state=case when exists (
      select 1 from public.research_contradictions remaining
      where remaining.claim_id=claim.id
        and remaining.resolution_state='open'
    ) then 'unresolved' else 'resolved' end,
    status=case when exists (
      select 1 from public.research_contradictions remaining
      where remaining.claim_id=claim.id
        and remaining.resolution_state='open'
    ) then 'contradicted' else 'supported' end,
    support_state=case when exists (
      select 1 from public.research_contradictions remaining
      where remaining.claim_id=claim.id
        and remaining.resolution_state='open'
    ) then 'contradicted' else 'supported' end
  where claim.id=contradiction_value.claim_id;
  return jsonb_build_object(
    'event_id',resolution_event_id,
    'evidence_hash',resolution_evidence_hash,
    'proof_hash',proof_hash_value
  );
end;
$$;
revoke all on function
  public.cognitive_resolve_public_research_contradiction(
    uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    uuid,uuid,text,text
  ) from public,anon,authenticated;
grant execute on function
  public.cognitive_resolve_public_research_contradiction(
    uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    uuid,uuid,text,text
  ) to service_role;

create table public.cognitive_research_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  requested_limit integer not null check (requested_limit between 1 and 100),
  source_count integer not null check (source_count between 0 and 100),
  claim_count integer not null check (claim_count between 0 and 100),
  total_count integer not null check (
    total_count=source_count+claim_count and total_count<=requested_limit
  ),
  retention_policy_id text not null check (
    retention_policy_id='chillywood-cognitive-retention-v1'
  ),
  processor_identity_hash text not null check (
    processor_identity_hash~'^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  foreign key (task_id,project_id,platform,environment)
    references public.intelligence_tasks(id,project_id,platform,environment)
);
alter table public.cognitive_research_maintenance_runs enable row level security;
alter table public.cognitive_research_maintenance_runs force row level security;
revoke all on table public.cognitive_research_maintenance_runs
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_research_maintenance_runs
  to service_role;
create trigger cognitive_research_maintenance_runs_immutable
before update or delete on public.cognitive_research_maintenance_runs
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.cognitive_expire_public_research_maintenance(
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
declare source_count_value integer:=0;
declare claim_count_value integer:=0;
declare tombstone_hash_value text;
declare processor_hash constant text:=encode(extensions.digest(
  convert_to('research_source_broker:expire_public_memory','UTF8'),'sha256'
),'hex');
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  if p_platform<>'shared' or p_environment<>'production'
     or p_limit not between 1 and 100
     or not exists (
       select 1 from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
     )
     or not exists (
       select 1 from public.cognitive_retention_policy_states policy
       where policy.task_id=p_task_id and policy.project_id=p_project_id
         and policy.platform=p_platform and policy.environment=p_environment
         and not policy.user_derived_memory_allowed
         and not policy.raw_user_reports_allowed
         and not policy.raw_private_messages_allowed
         and not policy.raw_private_media_allowed
         and not policy.raw_user_analytics_allowed
         and not policy.private_model_input_allowed
     ) then
    raise exception 'public_research_maintenance_rejected'
      using errcode='P0001';
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
    source_count_value:=source_count_value+1;
  end loop;
  for claim_value in
    select * from public.research_claims claim
    where claim.task_id=p_task_id and claim.project_id=p_project_id
      and claim.platform=p_platform and claim.environment=p_environment
      and claim.data_class='research_cache' and not claim.legal_hold
      and claim.erased_at is null
      and claim.retention_until<=transaction_timestamp()
    order by claim.retention_until,claim.id
    limit greatest(p_limit-source_count_value,0)
    for update skip locked
  loop
    tombstone_hash_value:=encode(extensions.digest(convert_to(concat_ws(
      '|','research_claims',claim_value.id::text,claim_value.claim_hash,
      claim_value.retention_until::text,'chillywood-cognitive-retention-v1'
    ),'UTF8'),'sha256'),'hex');
    update public.research_claims set
      status='stale',support_state='stale',
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
    claim_count_value:=claim_count_value+1;
  end loop;
  insert into public.cognitive_research_maintenance_runs(
    task_id,project_id,platform,environment,requested_limit,source_count,
    claim_count,total_count,retention_policy_id,processor_identity_hash
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_limit,
    source_count_value,claim_count_value,
    source_count_value+claim_count_value,
    'chillywood-cognitive-retention-v1',processor_hash
  );
  return jsonb_build_object(
    'source_count',source_count_value,
    'claim_count',claim_count_value,
    'total_count',source_count_value+claim_count_value,
    'retention_policy_id','chillywood-cognitive-retention-v1'
  );
end;
$$;
revoke all on function public.cognitive_expire_public_research_maintenance(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text
) from public,anon,authenticated;
grant execute on function public.cognitive_expire_public_research_maintenance(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text
) to service_role;

comment on function public.cognitive_record_public_research_source_v2(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,jsonb,timestamptz,
  timestamptz,boolean,text,jsonb,text[],text
) is
  'DNS-pinned broker writer with source-derived machine publication provenance and claim-local evidence.';
comment on table public.cognitive_research_contradiction_events is
  'Immutable contradiction detection and independently evaluated resolution evidence chain.';
comment on function public.cognitive_expire_public_research_maintenance(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,integer,text
) is
  'Closed audited public-only expiry action that remains runnable after task and research-switch expiry.';
