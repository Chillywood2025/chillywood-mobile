begin;
select plan(12);
select ok(private.deleted_media_reference_coverage_ready(),
  'all public references remain covered after adding immutable creator sale terms');
select ok(private.deleted_content_brand_guards_ready(),
  'Brand admission still includes immutable creator sale terms');
select is((select count(*)::integer from pg_trigger t
  where t.tgrelid=any(array['public.creator_event_offer_revisions'::regclass,
    'public.creator_money_purchase_quotes'::regclass])
    and t.tgfoid=any(array['private.guard_deleted_media_references()'::regprocedure,
      'private.guard_platform_brand_retention_references()'::regprocedure])
    and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23
    and t.tgqual is null and cardinality(t.tgattr::smallint[])=0),4,
  'both canonical guards cover every insert and update on both term tables');
select ok(not (select capture_enabled from private.deleted_content_retention_settings)
  and not (select expiry_enabled or batch_enabled from private.platform_brand_retention_settings),
  'guard integration does not activate retention or provider work');

-- Negative controls exercise the real coverage consumers. Losing either new
-- table's guard must block readiness; restoration must recover coverage. All
-- synthetic DDL rolls back, with no guard bypass during a source mutation.
alter table public.creator_event_offer_revisions disable trigger zzz_deleted_media_reference_guard;
select ok(not private.deleted_media_reference_coverage_ready(),
  'missing revision guard blocks retirement readiness');
alter table public.creator_event_offer_revisions enable trigger zzz_deleted_media_reference_guard;
select ok(private.deleted_media_reference_coverage_ready(),
  'restored revision guard recovers retirement coverage');
alter table public.creator_money_purchase_quotes disable trigger zzz_deleted_media_reference_guard;
select ok(not private.deleted_media_reference_coverage_ready(),
  'missing quote guard blocks retirement readiness');
alter table public.creator_money_purchase_quotes enable trigger zzz_deleted_media_reference_guard;
select ok(private.deleted_media_reference_coverage_ready(),
  'restored quote guard recovers retirement coverage');
alter table public.creator_event_offer_revisions disable trigger zzz_platform_brand_retention_reference;
select ok(not private.deleted_content_brand_guards_ready(),
  'missing revision guard blocks Brand admission');
alter table public.creator_event_offer_revisions enable trigger zzz_platform_brand_retention_reference;
select ok(private.deleted_content_brand_guards_ready(),
  'restored revision guard recovers Brand admission');
alter table public.creator_money_purchase_quotes disable trigger zzz_platform_brand_retention_reference;
select ok(not private.deleted_content_brand_guards_ready(),
  'missing quote guard blocks Brand admission');
alter table public.creator_money_purchase_quotes enable trigger zzz_platform_brand_retention_reference;
select ok(private.deleted_content_brand_guards_ready(),
  'restored quote guard recovers Brand admission');
select * from finish();
rollback;
