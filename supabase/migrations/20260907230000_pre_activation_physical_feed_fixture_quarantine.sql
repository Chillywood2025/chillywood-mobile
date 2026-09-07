-- The final installed iOS replay exposed one April storage-runtime proof video
-- in the ordinary "From Creators You Follow" rail. The row is positively
-- identified by the repository media-readiness inventory. Preserve the video,
-- comments, storage attribution, and any audit history; retire only its
-- customer-facing publication authority.

update public."videos"
set "visibility" = 'draft',
    "moderation_status" = 'hidden',
    "moderation_reason" = 'pre_activation_physical_proof_fixture_quarantine_v1',
    "moderated_at" = coalesce("moderated_at", timezone('utc'::text, now())),
    "quarantined_at" = coalesce("quarantined_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now())
where "id" = '4a75de25-b1c9-48b3-b45c-90ccbffc7449'::uuid
  and "title" = 'Supabase Fallback Runtime Proof 2026-04-30T21-47-33-462Z';

-- The canonical video trigger retires these rows as well. Keep the explicit
-- idempotent projection cleanup so a partially historical database cannot
-- continue serving an already-materialized relationship card.
update public."creator_feed_items"
set "status" = 'hidden',
    "updated_at" = timezone('utc'::text, now()),
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_physical_proof_fixture_quarantine_v1',
      'release_quarantine_reason', 'positively_identified_runtime_proof_fixture',
      'canonical_projection_active', false
    )
where "source_type" = 'creator_video'
  and "source_id" = '4a75de25-b1c9-48b3-b45c-90ccbffc7449';
