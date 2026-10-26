# Legacy rendition playback authority

`resolve_video_playback(uuid)` first checks canonical creator-content access,
including the existing commerce decision. Its internal
`resolve_video_playback_pre_paid_authority_closeout(uuid)` selector may return
legacy `video_renditions` paths only after
`video_rendition_playback_safe(uuid)` succeeds.

The same boolean safety predicate is used by the legacy Storage gate and direct
owner read policy. It requires a ready, non-original rendition, a usable path,
clean parent and rendition scan results, no parent or rendition quarantine,
allowed parent moderation, exact video/owner binding, and exact claims for both
the storage path and manifest path. Viewer ownership, commerce authorization,
and Premium tier access remain separate checks at their existing boundaries.
The helper returns no paths; the internal selector remains unavailable as a
direct client RPC.

The predicate covers allowed qualities, default quality, HD availability, and
the Premium-upgrade availability flag. A row cannot advertise an available
quality after its output loses authority. A surviving historical alias does
not gain the canonical row's claim when that row is archived or deleted.

## Retirement and fallback

All ready, non-original legacy rows still suppress original fallback, including
rows whose claims or safety state are invalid. Removing such a row from the
allowed quality list must not implicitly enable a different playback source.
When no non-original rendition is ready, an otherwise authorized parent's
existing original-fallback behavior remains unchanged. Archived, failed,
queued, and processing renditions are never offered as qualities.

Explicit video deletion withdraws publication and cascades to both rendition
tables. This is the established product decision. Transcode-job retirement is
independent: deleting a job sets the modern `media_renditions.job_id` reference
to null, and the legacy table has no job reference. Job cancellation/deletion
preserves publication under this contract. The modern rendition policy,
provider object lifecycle, cached media, and previously issued URLs are not
changed by the legacy predicate.

## Regression checks

Run the focused local test with:

```sh
node --test tests/legacy-rendition-playback-authority.test.mjs
```

This executes the real original resolver and public wrapper before applying
the forward migration, then checks the patched resolver, Storage gate, and
owner policy. The small fixture explicitly controls prerequisite commerce,
session, and Premium decisions. It is supplemented by the real-schema
`supabase/tests/legacy_rendition_playback_authority_test.sql` and the existing
rendition binding and Storage-authority pgTAP suites in `supabase test db`.
These checks do not fetch media or change provider objects.
