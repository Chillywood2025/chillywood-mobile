begin;
-- Immutable sale terms remain references while their rows exist. These two
-- new public JSON-bearing tables must participate in the existing retirement
-- and Brand fences just like every other locator-bearing public table.
-- Reuse the canonical guards without exemptions, activation or policy changes.
create trigger zzz_deleted_media_reference_guard
before insert or update on public.creator_event_offer_revisions
for each row execute function private.guard_deleted_media_references();
create trigger zzz_platform_brand_retention_reference
before insert or update on public.creator_event_offer_revisions
for each row execute function private.guard_platform_brand_retention_references();

create trigger zzz_deleted_media_reference_guard
before insert or update on public.creator_money_purchase_quotes
for each row execute function private.guard_deleted_media_references();
create trigger zzz_platform_brand_retention_reference
before insert or update on public.creator_money_purchase_quotes
for each row execute function private.guard_platform_brand_retention_references();
commit;
