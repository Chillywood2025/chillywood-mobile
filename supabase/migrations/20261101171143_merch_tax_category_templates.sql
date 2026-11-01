-- Reusable HUMAN category review is deliberately separate from independently
-- qualified provider/account/liability evidence. No classifications or evidence
-- are seeded. A category selection is not a tax registration or legal consent.
create table private.merch_tax_code_catalog(code text primary key check(code ~ '^txcd_[0-9]+$'),name text not null,description text not null,supported boolean not null,observed_at timestamptz not null);
alter table private.merch_tax_code_catalog enable row level security;
alter table private.merch_tax_code_catalog force row level security;
revoke all on private.merch_tax_code_catalog from public,anon,authenticated,service_role;
create table private.merch_tax_categories (
 id uuid primary key default extensions.gen_random_uuid(), category_key text not null check(category_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
 revision integer not null check(revision>0), label text not null check(length(btrim(label)) between 1 and 160),
 scope_description text not null check(length(btrim(scope_description)) between 10 and 4000),
 tax_code text not null check(tax_code ~ '^txcd_[0-9]+$'), tax_behavior text not null check(tax_behavior='inclusive'),
 professional_basis_reference text not null check(length(btrim(professional_basis_reference)) between 3 and 2000),
 coverage_evidence_reference text not null check(length(btrim(coverage_evidence_reference)) between 3 and 2000),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, revoked_at timestamptz, unique(category_key,revision), check(expires_at>reviewed_at)
);
create table private.merch_tax_category_contexts (
 id uuid primary key default extensions.gen_random_uuid(),category_id uuid not null references private.merch_tax_categories(id),
 creator_id uuid not null references auth.users(id), payout_account_id uuid not null references public.creator_payout_accounts(id),
 recipient_account_id text not null, platform_account_id text not null,
 evidence_policy_id uuid not null references private.commerce_tax_qualifications(id),
 -- The provider reviewer must establish that the evidence applies to inline
 -- product_data tax_code for this category, NOT copy a different SKU's proof.
 inline_category_evidence_reference text not null check(length(btrim(inline_category_evidence_reference)) between 3 and 2000),
 verified_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,revoked_at timestamptz,
 check(expires_at>verified_at)
);
create table private.merch_tax_category_requests (
 id uuid primary key default extensions.gen_random_uuid(),product_id uuid not null references public.merch_products(id),
 creator_id uuid not null references auth.users(id),category_id uuid references private.merch_tax_categories(id),
 product_snapshot jsonb not null,note text not null check(length(note)<=4000),created_at timestamptz not null default clock_timestamp()
);
create table private.merch_tax_category_decisions (
 request_id uuid primary key references private.merch_tax_category_requests(id),category_id uuid not null references private.merch_tax_categories(id),
 reviewed_by uuid not null references auth.users(id),note text not null check(length(btrim(note)) between 3 and 4000),created_at timestamptz not null default clock_timestamp()
);
create table private.merch_tax_category_policy_links (
 policy_id uuid primary key references private.commerce_tax_qualifications(id),product_id uuid not null references public.merch_products(id),
 category_id uuid not null references private.merch_tax_categories(id),context_id uuid not null references private.merch_tax_category_contexts(id),
 request_id uuid not null references private.merch_tax_category_requests(id),product_snapshot jsonb not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin
 foreach t in array array['merch_tax_categories','merch_tax_category_contexts','merch_tax_category_requests','merch_tax_category_decisions','merch_tax_category_policy_links'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  if t in ('merch_tax_categories','merch_tax_category_contexts') then
   execute format('create trigger immutable_update before update on private.%I for each row execute function private.guard_creator_external_payment_evidence()',t);
   execute format('create trigger immutable_delete before delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t);
  else
   execute format('create trigger immutable before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t);
  end if;
 end loop;
end $$;

create function private.merch_tax_owner() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  or public.has_platform_role(array['owner']) is distinct from true then raise exception 'owner_current_session_required';end if;
 return auth.uid();
end $$;
create function private.merch_tax_product_snapshot(p public.merch_products) returns jsonb language sql volatile set search_path='' as $$
 select jsonb_build_object('creatorId',p.creator_id,'title',p.title,'description',p.description,'provider',p.provider,
  'physical',p.is_physical_good,'digitalAccess',p.creates_digital_access,'variantMode',p.variant_mode,
  'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'size',v.size,'color',v.color) order by v.id)
    from public.merch_product_variants v where v.product_id=p.id),'[]'::jsonb));
$$;
create function private.merch_tax_category_current(p_id uuid) returns boolean language sql volatile set search_path='' as $$
 select exists(select 1 from private.merch_tax_categories c where c.id=p_id and c.revoked_at is null
  and c.reviewed_at<=clock_timestamp() and c.expires_at>clock_timestamp()
  and exists(select 1 from private.merch_tax_code_catalog t where t.code=c.tax_code and t.supported and t.observed_at>clock_timestamp()-interval '7 days')
  and not exists(select 1 from private.merch_tax_categories n where n.category_key=c.category_key and n.revision>c.revision));
$$;
create function private.merch_tax_evidence_policy_current(p_id uuid) returns boolean language sql volatile set search_path='' as $$
 select exists(select 1 from private.commerce_tax_qualifications q where q.id=p_id and q.feature='physical_merch'
  and q.environment='production' and q.enabled and q.revoked_at is null and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
  and q.tax_behavior='inclusive' and q.full_permitted_scope_reviewed and q.permitted_scope='US_all_destinations'
  and nullif(btrim(q.professional_basis_reference),'') is not null and nullif(btrim(q.coverage_evidence_reference),'') is not null
  and q.collection_mode in('automatic','verified_no_collection') and q.liability_type in('self','account') and q.tax_code is not null
  and nullif(btrim(q.provider_settings_evidence_reference),'') is not null and nullif(btrim(q.provider_product_evidence_reference),'') is not null
  and q.provider_verified_at<=clock_timestamp() and q.provider_expires_at>clock_timestamp()
  and (q.collection_mode<>'automatic' or nullif(btrim(q.registration_evidence_reference),'') is not null)
  and (q.collection_mode<>'verified_no_collection' or nullif(btrim(q.no_collection_basis_reference),'') is not null)
  and not exists(select 1 from private.commerce_tax_qualifications n where n.feature=q.feature and n.product_id=q.product_id
   and n.account_id=q.account_id and n.environment=q.environment and (n.verified_at,n.id)>(q.verified_at,q.id)
   -- A derived listing policy is a consumer of this independently verified
   -- evidence, not a replacement provider observation. This also permits the
   -- original evidenced listing to select the reusable category safely.
   and not exists(select 1 from private.merch_tax_category_policy_links l join private.merch_tax_category_contexts x on x.id=l.context_id
    where l.policy_id=n.id and x.evidence_policy_id=q.id)));
$$;
create function private.merch_tax_context_current(p_id uuid) returns boolean language sql volatile set search_path='' as $$
 select exists(select 1 from private.merch_tax_category_contexts x
  join private.merch_tax_categories c on c.id=x.category_id join private.commerce_tax_qualifications q on q.id=x.evidence_policy_id
  join public.creator_payout_accounts a on a.id=x.payout_account_id
  where x.id=p_id and x.revoked_at is null and x.verified_at<=clock_timestamp() and x.expires_at>clock_timestamp()
   and not exists(select 1 from private.merch_tax_category_contexts n where n.category_id=x.category_id and n.creator_id=x.creator_id
    and (n.verified_at,n.id)>(x.verified_at,x.id))
   and private.merch_tax_category_current(c.id) and private.merch_tax_evidence_policy_current(q.id)
   and q.tax_code=c.tax_code and q.tax_behavior=c.tax_behavior and q.account_id=x.platform_account_id
   and (q.liability_type='self' or q.liability_account_id=x.recipient_account_id)
   and a.creator_user_id=x.creator_id::text and a.provider='stripe_connect' and a.provider_environment='live'
   and a.provider_account_id=x.recipient_account_id and a.provider_configuration_account_id=a.provider_account_id
   and a.provider_configuration_status='match' and a.provider_configuration_observed_at<=clock_timestamp()
   and a.provider_configuration_observed_at>clock_timestamp()-interval '15 minutes'
   and a.provider_live_observation->>'platformAccountId'=x.platform_account_id);
$$;
create function private.merch_tax_category_policy_current(p_policy_id uuid) returns boolean language sql volatile set search_path='' as $$
 select (not exists(select 1 from private.merch_tax_category_policy_links where policy_id=p_policy_id)
  and not exists(select 1 from private.commerce_tax_qualifications q join private.merch_tax_category_requests r on r.product_id::text=q.product_id
   where q.id=p_policy_id and q.feature='physical_merch'))
 or exists(select 1 from private.merch_tax_category_policy_links l join public.merch_products p on p.id=l.product_id
  where l.policy_id=p_policy_id and private.merch_tax_context_current(l.context_id)
   and l.product_snapshot=private.merch_tax_product_snapshot(p)
   and l.request_id=(select r.id from private.merch_tax_category_requests r where r.product_id=p.id order by r.created_at desc,r.id desc limit 1));
$$;

create function public.review_owner_merch_tax_category(p_category_key text,p_label text,p_scope_description text,p_tax_code text,
 p_tax_behavior text,p_professional_basis_reference text,p_coverage_evidence_reference text,p_expires_at timestamptz,p_expected_revision integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.merch_tax_owner();current_revision integer;c private.merch_tax_categories;
begin
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-category:'||p_category_key,0));
 perform private.merch_tax_owner();
 if not exists(select 1 from private.merch_tax_code_catalog where code=p_tax_code and supported and observed_at>clock_timestamp()-interval '7 days')
 then raise exception 'tax_code_catalog_refresh_required';end if;
 select coalesce(max(revision),0) into current_revision from private.merch_tax_categories where category_key=p_category_key;
 if p_expected_revision is distinct from current_revision then raise exception 'tax_category_revision_changed';end if;
 insert into private.merch_tax_categories(category_key,revision,label,scope_description,tax_code,tax_behavior,professional_basis_reference,coverage_evidence_reference,reviewed_by,expires_at)
 values(p_category_key,current_revision+1,p_label,p_scope_description,p_tax_code,p_tax_behavior,p_professional_basis_reference,p_coverage_evidence_reference,actor,p_expires_at) returning * into c;
 return jsonb_build_object('id',c.id,'categoryKey',c.category_key,'label',c.label,'revision',c.revision,'providerReady',false);
end $$;

create function public.list_creator_merch_tax_categories(p_product_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.merch_products;r private.merch_tax_category_requests;l private.merch_tax_category_policy_links;d private.merch_tax_category_decisions;status text;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_current_session_required';end if;
 select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid();
 if p.id is null then raise exception 'merch_product_not_found';end if;
 select * into r from private.merch_tax_category_requests where product_id=p.id order by created_at desc,id desc limit 1;
 select * into l from private.merch_tax_category_policy_links where request_id=r.id;
 select * into d from private.merch_tax_category_decisions where request_id=r.id;
 status:=case when l.policy_id is not null and private.merch_tax_category_policy_current(l.policy_id) then 'ready'
  when r.category_id is null then 'review_required' else 'provider_evidence_required' end;
 return jsonb_build_object('categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'categoryKey',category_key,'label',label,
  'revision',revision,'scopeDescription',scope_description) order by label) from private.merch_tax_categories where private.merch_tax_category_current(id)),'[]'::jsonb),
  'selection',case when r.id is null then null else jsonb_build_object('status',status,'categoryId',r.category_id,'requestId',r.id,
   'suggestedCategoryId',d.category_id,'reason',case when d.category_id is not null then 'Owner reviewed this request. Select the suggested category to continue.'
    when status='ready' then 'Category and provider evidence are current.' when status='review_required' then 'Owner category review is required.'
    else 'Current provider/account and category evidence is required; no tax classification or collection is assumed.' end) end);
end $$;

create function public.get_owner_merch_tax_review_queue(p_limit integer default 50,p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb;last_item jsonb;more boolean;
begin
 perform private.merch_tax_owner();
 if (p_before is null)<>(p_before_id is null) then raise exception 'tax_review_cursor_invalid';end if;
 select coalesce(jsonb_agg(v order by created_at desc,id desc),'[]'::jsonb) into items from (
  select r.created_at,r.id,jsonb_build_object('id',r.id,'productId',r.product_id,'creatorId',r.creator_id,'title',r.product_snapshot->>'title',
   'description',r.product_snapshot->>'description','variants',r.product_snapshot->'variants','note',r.note,
   'current',r.product_snapshot=(select private.merch_tax_product_snapshot(p) from public.merch_products p where p.id=r.product_id)
    and r.id=(select n.id from private.merch_tax_category_requests n where n.product_id=r.product_id order by n.created_at desc,n.id desc limit 1),
   'createdAt',r.created_at,'status',case when l.policy_id is not null and private.merch_tax_category_policy_current(l.policy_id) then 'ready'
    when d.request_id is not null then 'reviewed' when r.category_id is null then 'review_required' else 'provider_evidence_required' end,
   'classificationStatus',case when private.merch_tax_category_current(coalesce(d.category_id,r.category_id)) then 'current'
    when coalesce(d.category_id,r.category_id) is null then 'missing' else 'expired' end,
   'providerStatus',case when x.id is null then 'missing' when private.merch_tax_context_current(x.id) then 'current' else 'expired' end,
   'accountStatus',case when x.id is null then 'unknown' when private.merch_tax_context_current(x.id) then 'current' else 'expired' end,
   'jurisdictionStatus',case when x.id is null then 'unknown' when private.merch_tax_context_current(x.id) then 'current' else 'expired' end,
   'suggestedCategoryId',d.category_id) v from private.merch_tax_category_requests r left join private.merch_tax_category_decisions d on d.request_id=r.id
   left join private.merch_tax_category_policy_links l on l.request_id=r.id
   left join private.merch_tax_category_contexts x on x.id=l.context_id
   where p_before is null or (r.created_at,r.id)<(p_before,p_before_id)
   order by r.created_at desc,r.id desc limit greatest(1,least(coalesce(p_limit,50),100))) s;
 last_item:=items->(jsonb_array_length(items)-1);
 select exists(select 1 from private.merch_tax_category_requests where (created_at,id)<((last_item->>'createdAt')::timestamptz,(last_item->>'id')::uuid)) into more;
 return jsonb_build_object('requests',items,'nextCursor',case when more then jsonb_build_object('createdAt',last_item->>'createdAt','id',last_item->>'id') else null end,
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'categoryKey',c.category_key,'label',c.label,'revision',c.revision,
   'scopeDescription',c.scope_description,'taxCode',c.tax_code,'taxBehavior',c.tax_behavior,'professionalBasisReference',c.professional_basis_reference,
   'coverageEvidenceReference',c.coverage_evidence_reference,'expiresAt',c.expires_at,'revokedAt',c.revoked_at,'current',private.merch_tax_category_current(c.id)) order by c.category_key,c.revision desc)
   from private.merch_tax_categories c),'[]'::jsonb),'providerReady',false);
end $$;
create function public.resolve_owner_merch_tax_request(p_request_id uuid,p_category_id uuid,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.merch_tax_owner();r private.merch_tax_category_requests;p public.merch_products;prior private.merch_tax_category_decisions;
begin
 select * into r from private.merch_tax_category_requests where id=p_request_id;
 if r.id is null then raise exception 'tax_review_request_not_found';end if;
 perform private.platform_brand_retention_lock();
 perform pg_advisory_xact_lock(hashtextextended('merch_product:'||r.product_id,0));
 select * into p from public.merch_products where id=r.product_id for share;
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
 lock table private.merch_tax_categories in share mode;
 perform private.merch_tax_owner();
 if not private.merch_tax_category_current(p_category_id) then raise exception 'tax_category_review_expired';end if;
 if r.product_snapshot is distinct from private.merch_tax_product_snapshot(p)
  or r.id is distinct from (select id from private.merch_tax_category_requests where product_id=p.id order by created_at desc,id desc limit 1)
 then raise exception 'tax_review_product_changed';end if;
 select * into prior from private.merch_tax_category_decisions where request_id=r.id;
 if prior.request_id is not null then
  if prior.category_id is distinct from p_category_id or prior.note is distinct from p_note then raise exception 'tax_review_decision_immutable';end if;
 else insert into private.merch_tax_category_decisions(request_id,category_id,reviewed_by,note) values(r.id,p_category_id,actor,p_note);end if;
 return jsonb_build_object('status','reviewed','providerReady',false);
end $$;

-- These are provider catalog observations, not reviewed tax classifications.
create function public.record_merch_tax_code_catalog(p_codes jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes)>100 then raise exception 'tax_catalog_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
 for item in select value from jsonb_array_elements(p_codes) loop
  if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'name') is distinct from 'string'
   or jsonb_typeof(item->'description') is distinct from 'string' or length(item->>'name') not between 1 and 300
   or length(item->>'description')>10000 or jsonb_typeof(item->'supported') is distinct from 'boolean' then raise exception 'tax_catalog_invalid';end if;
  insert into private.merch_tax_code_catalog(code,name,description,supported,observed_at) values(item->>'id',item->>'name',item->>'description',(item->>'supported')::boolean,clock_timestamp())
   on conflict(code) do update set name=excluded.name,description=excluded.description,supported=excluded.supported,observed_at=excluded.observed_at;
 end loop;
 return true;
end $$;

-- Existing accepted order tax bindings stay immutable. New/retried checkout
-- must prove that the exact derived policy still has its original authority.
alter function public.bind_commerce_tax_checkout_policy(text,uuid,text,text,text,text) rename to bind_commerce_tax_checkout_policy_pre_categories;
revoke all on function public.bind_commerce_tax_checkout_policy_pre_categories(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
create function public.bind_commerce_tax_checkout_policy(p_feature text,p_identity_id uuid,p_product_id text,p_account_id text,p_environment text,p_permitted_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare policy uuid;result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_feature='physical_merch' then
  perform private.platform_brand_retention_lock();
  perform pg_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id,0));
  perform 1 from public.merch_products where id::text=p_product_id for share;
  perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
  lock table private.merch_tax_categories,private.merch_tax_category_contexts,public.creator_payout_accounts,private.commerce_tax_qualifications in share mode;
  select id into policy from private.commerce_tax_qualifications where feature=p_feature and product_id=p_product_id and account_id=p_account_id and environment=p_environment order by verified_at desc,id desc limit 1;
  if policy is not null and not private.merch_tax_category_policy_current(policy) then return jsonb_build_object('ready',false,'reason','tax_category_review_required');end if;
 end if;
 return public.bind_commerce_tax_checkout_policy_pre_categories(p_feature,p_identity_id,p_product_id,p_account_id,p_environment,p_permitted_scope);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in('merch_tax_owner','merch_tax_product_snapshot','merch_tax_category_current','merch_tax_evidence_policy_current','merch_tax_context_current','merch_tax_category_policy_current')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;
create function public.revoke_owner_merch_tax_category(p_category_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.merch_tax_owner();
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
 perform private.merch_tax_owner();
 if not exists(select 1 from private.merch_tax_categories c where c.id=p_category_id and not exists(
  select 1 from private.merch_tax_categories n where n.category_key=c.category_key and n.revision>c.revision)) then raise exception 'tax_category_revision_changed';end if;
 update private.merch_tax_categories set revoked_at=clock_timestamp() where id=p_category_id and revoked_at is null;
 return jsonb_build_object('status','revoked');
end $$;

-- Trusted ingestion boundary, not callable by the owner/client. The existing
-- exact policy must ALREADY have independently reviewed provider evidence. The
-- additional receipt explicitly qualifies its reuse for inline category data.
create function public.record_merch_tax_category_context(p_category_id uuid,p_creator_id uuid,p_evidence_policy_id uuid,
 p_inline_category_evidence_reference text,p_expires_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare c private.merch_tax_categories;q private.commerce_tax_qualifications;a public.creator_payout_accounts;result uuid;prior private.merch_tax_category_contexts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
 lock table private.merch_tax_categories,private.commerce_tax_qualifications,public.creator_payout_accounts in share mode;
 select * into c from private.merch_tax_categories where id=p_category_id;
 select * into q from private.commerce_tax_qualifications where id=p_evidence_policy_id;
 select * into a from public.creator_payout_accounts where creator_user_id=p_creator_id::text and provider='stripe_connect' and provider_environment='live';
 if not private.merch_tax_category_current(c.id) or not private.merch_tax_evidence_policy_current(q.id)
  or exists(select 1 from private.merch_tax_category_policy_links where policy_id=q.id)
  or q.tax_code is distinct from c.tax_code or q.tax_behavior is distinct from c.tax_behavior
  or a.id is null or a.provider_configuration_status is distinct from 'match'
  or a.provider_configuration_account_id is distinct from a.provider_account_id
  or a.provider_configuration_observed_at is null or a.provider_configuration_observed_at>clock_timestamp()
  or a.provider_configuration_observed_at<=clock_timestamp()-interval '15 minutes'
  or a.provider_live_observation->>'platformAccountId' is distinct from q.account_id
  or (q.liability_type='account' and q.liability_account_id is distinct from a.provider_account_id)
  or p_expires_at is null or p_expires_at<=clock_timestamp()
 then raise exception 'tax_category_provider_context_unqualified';end if;
 select * into prior from private.merch_tax_category_contexts where category_id=c.id and creator_id=p_creator_id
  and evidence_policy_id=q.id and inline_category_evidence_reference=p_inline_category_evidence_reference order by verified_at desc,id desc limit 1;
 if prior.id is not null then
  if prior.expires_at is distinct from least(p_expires_at,c.expires_at,q.expires_at,q.provider_expires_at)
   or prior.payout_account_id<>a.id or prior.recipient_account_id<>a.provider_account_id or prior.platform_account_id<>q.account_id
  then raise exception 'tax_category_context_evidence_conflict';end if;
  return prior.id; -- Retried receipt never renews expiry or reverses revocation.
 end if;
 insert into private.merch_tax_category_contexts(category_id,creator_id,payout_account_id,recipient_account_id,platform_account_id,evidence_policy_id,inline_category_evidence_reference,expires_at)
 values(c.id,p_creator_id,a.id,a.provider_account_id,q.account_id,q.id,p_inline_category_evidence_reference,least(p_expires_at,c.expires_at,q.expires_at,q.provider_expires_at)) returning id into result;
 return result;
end $$;

create function public.select_creator_merch_tax_category(p_product_id uuid,p_category_id uuid,p_expected_updated_at timestamptz,p_request_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.merch_products;c private.merch_tax_categories;x private.merch_tax_category_contexts;q private.commerce_tax_qualifications;
 r private.merch_tax_category_requests;new_policy uuid;status text;reason text;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_current_session_required';end if;
 perform public.wave1_assert_current_creator_money_authority_internal();
 perform private.platform_brand_retention_lock();
 perform pg_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id,0));
 select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid() for update;
 if p.id is null then raise exception 'merch_product_not_found';end if;
 if p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at then raise exception 'merch_product_changed_reload';end if;
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
 lock table private.merch_tax_categories,private.merch_tax_category_contexts,private.commerce_tax_qualifications,public.creator_payout_accounts in share mode;
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_current_session_required';end if;
 perform public.wave1_assert_current_creator_money_authority_internal();
 if p_category_id is null and length(btrim(coalesce(p_request_note,'')))<3 then raise exception 'tax_category_description_required';end if;
 if p_category_id is not null and not private.merch_tax_category_current(p_category_id) then raise exception 'tax_category_review_expired';end if;
 insert into private.merch_tax_category_requests(product_id,creator_id,category_id,product_snapshot,note)
 values(p.id,auth.uid(),p_category_id,private.merch_tax_product_snapshot(p),coalesce(p_request_note,'')) returning * into r;
 select * into c from private.merch_tax_categories where id=p_category_id;
 select * into x from private.merch_tax_category_contexts where category_id=p_category_id and creator_id=auth.uid()
  and private.merch_tax_context_current(id) order by verified_at desc,id desc limit 1;
 if c.id is null then status:='review_required';reason:='Describe this item so the owner can review its category. Sales remain blocked.';
 elsif x.id is null then status:='provider_evidence_required';reason:='Category selected. Independent account, liability and US tax coverage verification is still required.';
 else
  select * into q from private.commerce_tax_qualifications where id=x.evidence_policy_id;
  insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,liability_account_id,
   tax_code,tax_behavior,registration_evidence_reference,no_collection_basis_reference,provider_settings_evidence_reference,provider_product_evidence_reference,
   provider_verified_at,provider_expires_at,expires_at,enabled)
  values('physical_merch',p.id::text,q.account_id,'production',q.permitted_scope,q.platform_scope,c.professional_basis_reference,c.coverage_evidence_reference,true,
   q.collection_mode,q.liability_type,q.liability_account_id,c.tax_code,c.tax_behavior,q.registration_evidence_reference,q.no_collection_basis_reference,
   q.provider_settings_evidence_reference,x.inline_category_evidence_reference,q.provider_verified_at,least(q.provider_expires_at,x.expires_at),
   least(c.expires_at,x.expires_at,q.expires_at),true) returning id into new_policy;
  insert into private.merch_tax_category_policy_links(policy_id,product_id,category_id,context_id,request_id,product_snapshot)
  values(new_policy,p.id,c.id,x.id,r.id,r.product_snapshot);
  status:='ready';reason:='Category and provider evidence are current. Review publication separately before enabling real purchases.';
 end if;
 update public.merch_products set updated_at=clock_timestamp() where id=p.id returning * into p;
 return jsonb_build_object('status',status,'categoryId',c.id,'requestId',r.id,'reason',reason,'updatedAt',p.updated_at);
end $$;

revoke all on function public.review_owner_merch_tax_category(text,text,text,text,text,text,text,timestamptz,integer),public.revoke_owner_merch_tax_category(uuid),
 public.select_creator_merch_tax_category(uuid,uuid,timestamptz,text),public.list_creator_merch_tax_categories(uuid),public.get_owner_merch_tax_review_queue(integer,timestamptz,uuid),
 public.resolve_owner_merch_tax_request(uuid,uuid,text),public.record_merch_tax_category_context(uuid,uuid,uuid,text,timestamptz),public.record_merch_tax_code_catalog(jsonb),
 public.bind_commerce_tax_checkout_policy(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.review_owner_merch_tax_category(text,text,text,text,text,text,text,timestamptz,integer),public.revoke_owner_merch_tax_category(uuid),
 public.select_creator_merch_tax_category(uuid,uuid,timestamptz,text),public.list_creator_merch_tax_categories(uuid),public.get_owner_merch_tax_review_queue(integer,timestamptz,uuid),
 public.resolve_owner_merch_tax_request(uuid,uuid,text) to authenticated;
grant execute on function public.record_merch_tax_category_context(uuid,uuid,uuid,text,timestamptz),public.record_merch_tax_code_catalog(jsonb),
 public.bind_commerce_tax_checkout_policy(text,uuid,text,text,text,text) to service_role;

-- Compose with the independently reviewed first-live-publication path. Lock
-- order: retained brand latch -> product -> category authority -> table fences.
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.merch_live_publication_authority(public.merch_products)'::regprocedure);
 definition:=replace(definition,'lock table public.creator_payout_accounts',
  'perform pg_advisory_xact_lock(hashtextextended(''merch-tax-authority'',0)); lock table private.merch_tax_categories,private.merch_tax_category_contexts,public.creator_payout_accounts');
 definition:=replace(definition,'if q.id is null or a.provider_live_observation',
  'if q.id is null or not private.merch_tax_category_policy_current(q.id) or a.provider_live_observation');
 if position('not private.merch_tax_category_policy_current(q.id)' in definition)=0 then raise exception 'tax_publication_guard_anchor_missing';end if;
 execute definition;
end $$;
create trigger merch_publish_authority_changed after insert or update or delete on private.merch_tax_categories for each statement execute function private.merch_publish_authority_changed();
create trigger merch_publish_authority_changed after insert or update or delete on private.merch_tax_category_contexts for each statement execute function private.merch_publish_authority_changed();
create trigger merch_publish_authority_changed after insert or update or delete on private.merch_tax_code_catalog for each statement execute function private.merch_publish_authority_changed();
