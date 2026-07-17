-- Keep device-readiness history while ensuring each platform/requirement has one
-- mutable open finding. Older duplicate rows remain as superseded evidence.

with ranked as (
  select id,
    row_number() over (
      partition by system_id, platform, device_requirement, blocker_classification
      order by updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.device_availability_findings
  where finding_status = 'open'
)
update public.device_availability_findings finding
set finding_status = 'superseded', updated_at = timezone('utc'::text, now())
from ranked
where finding.id = ranked.id and ranked.duplicate_rank > 1;

create unique index if not exists device_availability_one_open_condition_uidx
  on public.device_availability_findings (
    system_id, platform, device_requirement, blocker_classification
  )
  where finding_status = 'open';

comment on index public.device_availability_one_open_condition_uidx is
  'Prevents repeated scheduler runs from creating duplicate open device-readiness findings while retaining superseded history.';

with ranked as (
  select id,
    row_number() over (
      partition by system_id, platform, flag_type, coalesce(target_type, ''), coalesce(target_id, '')
      order by updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.qa_required_review_flags
  where review_status = 'open'
)
update public.qa_required_review_flags finding
set review_status = 'superseded', updated_at = timezone('utc'::text, now())
from ranked
where finding.id = ranked.id and ranked.duplicate_rank > 1;

create unique index if not exists qa_review_one_open_condition_uidx
  on public.qa_required_review_flags (
    system_id, platform, flag_type, coalesce(target_type, ''), coalesce(target_id, '')
  )
  where review_status = 'open';

comment on index public.qa_review_one_open_condition_uidx is
  'Prevents repeated manual/provider readiness recording from duplicating one open installed-QA review condition.';
