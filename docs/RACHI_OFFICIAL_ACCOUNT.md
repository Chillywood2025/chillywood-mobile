# Rachi Official Account

Status: repo-side implemented; Android runtime proof lives at `/tmp/chillywood-rachi-official-proof-20260526/`, Rachi Originals fixture proof lives at `/tmp/chillywood-rachi-originals-proof-20260526/`, and the Home identity cleanup proof lives at `/tmp/chillywood-home-profile-cleanup-proof-20260529/`.

## Product Truth

Rachi is Chi'llywood's official account:

- official Chi'llywood guide
- first pinned Chi'lly Circle official connection
- official updates voice
- Chi'llwood Originals publisher when real public-safe Rachi content exists

Rachi is not:

- a private chat monitor
- a fake normal user
- owner/admin authority
- proof of fake posts, fake Originals, fake followers, fake likes, fake comments, or fake activity

User-facing privacy copy should stay short:

- `Rachi does not read your private chats.`
- `Rachi Help only sees what you send in that help conversation.`

## Surfaces

- Chi'lly Circle shows Rachi first as a pinned official Chi'llywood connection.
- Rachi Profile shows official identity, recent public Rachi posts, public-safe Rachi uploads, Rachi Platform, and Rachi Help.
- Rachi public Platform shows official branding and public-safe published Rachi content only.
- Home shows real public Rachi posts in `Rachi Official Updates`.
- Home shows real public-safe Rachi-owned creator videos in `Chi'llwood Originals`.
- Home Rachi Official Updates show Rachi identity: backed avatar when active, safe `R` fallback when missing, `Rachi`, `Official Chi'llwood`, and timestamp where backed.
- Home/public Rachi Originals cards must not expose internal proof/fixture wording in normal user-facing title or description copy.
- Chi'lly Chat keeps Rachi Help opt-in and does not imply Rachi reads other chats.
- Admin Rachi tab is owner/admin-only and manages official Rachi posts plus official-content visibility.

## Admin Posting

Remote-applied migration `202605260008_rachi_official_posts.sql` adds `admin_create_official_rachi_post`.

Rules:

- requires authenticated owner/operator access through `admin_content_assert_operator()`
- inserts the post as `platform_rachi_official`
- supports `public` and `draft`
- writes immutable admin content audit through `admin_content_write_audit`
- returns the created post id and visibility only
- grants execute to authenticated users, but the function itself blocks non-operators

Normal users cannot post as Rachi or edit Rachi Platform/Studio.

## Profile Picture

Remote-applied migrations:

- `202605260009_rachi_official_profile_image.sql`
- `202605260010_rachi_official_profile_media_storage.sql`

Rules:

- Admin Rachi tab uses `Choose from Gallery` for Rachi's Profile/Platform picture.
- The visible UI does not ask operators to paste an image URL.
- The selected photo uploads to the official `profile-media/official/rachi/...` prefix.
- Only owner/operator roles can upload or delete official Rachi profile-media objects.
- The save/clear RPC writes admin audit through `admin_content_write_audit`.
- Public Rachi Profile and Platform read the backed avatar when active, then fall back to the default `R`.
- Do not use screenshots or gallery photos that expose private user data.

## Originals

Chi'llwood Originals uses real Rachi-owned creator videos only:

- Home reads Rachi creator videos with `includeDrafts: false`
- drafts, private uploads, hidden content, rejected content, and raw storage paths stay out of Home
- empty states are honest when no official content exists
- remote-applied migration `202605260011_rachi_originals_public_video_fixture.sql` adds `official_rachi_original_videos`, an owner/operator-managed link table for public-safe official Rachi Originals
- remote-applied migration `202605260012_rachi_originals_fixture_playback_mp4.sql` keeps the proof fixture on direct `video/mp4` playback
- remote-applied migration `202605260013_rachi_originals_public_link_select_hardening.sql` makes public link reads require a published official link and a linked public clean/reported video
- proof fixture: `6e1c3405-7db8-4cb2-98f3-5a7642e82126`, `Chi'llwood Originals Proof Fixture`
- fixture attribution: `Big Buck Bunny by Blender Foundation, CC BY 3.0.`
- `public-creator-video-cards` reads official Rachi Originals through the link table and still requires published official links plus public, moderation-safe `videos` rows
- public card responses use `ownerId=platform_rachi_official` and do not return raw playback URLs, raw storage paths, storage object keys, drafts, private rows, hidden rows, or admin controls
- normal public cards may mask internal proof/fixture title and description wording as `Chi'llwood Original` and `Official Chi'llwood Original from Rachi.` while preserving the real backed row and resolver result
- Admin shows `Upload Original` as an honest disabled action until a backend-safe upload-as-Rachi Studio path exists

Do not create placeholder Originals or fake production claims.

## Safety

Rachi does not replace:

- Terms
- Community Guidelines
- report flows
- Copyright/DMCA policy
- moderation/admin removal
- repeat-infringer handling

Rachi does not change:

- LiveKit token issuance
- Watch-Party Live behavior
- Live Watch-Party behavior
- Premium gates
- creator upload/publish/delete rules
- normal Chi'lly Chat privacy
- normal Chi'lly Circle request/accept/remove behavior

## Validation

Run for this lane:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:rachi-official-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- payment/provider/creator/Clip/Brand policy guards
- Supabase migration list/lint/dry-run/typegen proof when schema changes
- targeted greps for no private-chat surveillance copy, no fake Rachi stats, owner/admin-only Rachi posting, public-safe Originals, no user-facing `Mini Platform`, and no LiveKit/watch-party changes
- `git diff --check`
- `git diff --cached --check`

## Android Proof

Proof path: `/tmp/chillywood-rachi-official-proof-20260526/`.

Captured on `R5CR120QCBF`:

- Chi'lly Circle with pinned Rachi official connection
- Rachi Profile
- Rachi Platform
- Rachi Help opt-in privacy copy
- normal user cannot access Rachi admin/studio controls
- owner/operator Admin Rachi tab Overview
- Admin Rachi Profile Picture section with `Choose from Gallery` and `Clear Picture`
- real official Rachi post created through the Admin Rachi tab
- real official Rachi post visible on Rachi Profile
- real official Rachi post visible on Home under `Rachi Official Updates`
- Home `Chi'llwood Originals` honest empty state before the fixture pass

Proof path: `/tmp/chillywood-rachi-originals-proof-20260526/`.

Captured on `R5CR120QCBF`:

- Home `Rachi Official Updates` still present
- Home `Chi'llwood Originals` with the Rachi video fixture
- Rachi video card with public/Media Ready state and no fake engagement
- Rachi public Platform showing `1 Videos`, Featured, and Latest Uploads for the fixture
- public Platform actions are Follow, Share, Report, and View Profile, with no app owner/admin controls in public preview
- Player/public content route opens the fixture title

Proof path: `/tmp/chillywood-home-profile-cleanup-proof-20260529/`.

Captured on `R5CR120QCBF`:

- Home `Rachi Official Updates` with Rachi avatar/fallback, `Rachi`, `Official Chi'llwood`, and backed timestamp text
- Home `Chi'llwood Originals` with the real Rachi-owned fixture row and public copy that no longer exposes `Proof Fixture` or `Proof-scoped` wording
- Home no longer shows Top Picks, Browse, or Favorites sections

Backend proof:

- public card resolver returns the fixture for `platform_rachi_official`
- public card response does not include raw playback URL, raw storage path, or storage object key
- `resolve_video_playback` reports playable legacy source state for the fixture

Not claimed yet:

- visible moving Player frame for the Rachi fixture. The route opens and the resolver reports playable source state, but the Android screenshots captured a black player area after launch/wait.
- Rachi Profile Picture actual save/clear mutation with a selected safe image. The Admin UI is gallery-based and audited, but the proof pass did not select a private device photo.

Do not fake Rachi posts, Originals, comments, likes, followers, or engagement for screenshots.
