# Room entry and live discovery

The Party Room (`/watch-party/[partyId]`), Live Room and Live Stage
(`/watch-party/live-stage/[partyId]`) use the same **Privacy & discovery**
editor. The waiting room shows the selected starting audience before Start.
Existing private rooms are not made public automatically.

## Supported meanings

- **Discovery Off** pauses listing without changing the selected audience.
  A Circle room remains Circle-only even with a saved link/code. Historical
  `private` rooms remain unlisted; no historical audience is inferred or changed.
- **Public audience** permits eligible people outside the Circle to enter under
  existing room-entry rules. Listing it additionally requires **Discovery On**.
  Neither option grants content,
  Premium, ticket, speaking, camera, microphone or moderation access.
- **Chi'lly Circle** limits admission and, when On, discovery to the current Circle;
  followers are not automatically Circle members.
- **Entry Open / Locked** is separate. Locked stops new members; it does not
  hide a listing or eject existing members.
- Event-prepared broadcast rooms remain event-managed, private and locked.

Only the exact current `host_user_id` can edit. A displayed cohost badge or
speaker role is not host-settings authority. Draft controls do not mutate the
room. Audience expansion/unlocking requires an explicit confirmation.

Owner sessions additionally require an unchecked, explicit **Allow this room
to be discoverable** selection and confirmation. This is a session-, room
generation-, revision- and audience-bound exception, not a global owner privacy
change. A room title is required. Only the selected room's live card/title and
room display name are exposed; owner profiles, administrative activity and other
sessions stay hidden. Circle opt-in is unavailable without actual eligible Circle
members. Off clears consent; resume requires a new explicit opt-in.
Existing/historical rooms gain none automatically.

## Server boundary

`set_watch_party_room_host_settings` checks the current account session, exact
room/source generation and expected settings revision. Preparation/autosave uses
`p_publish=false`; explicit in-room Save and joined-host Start use `true`.
`p_allow_owner_discovery` is never inferred from Public selection or persisted as
a local preference. Strict server acknowledgements, not optimistic toggles,
drive visible saved/published status. Live Stage publication separately confirms
the actual connected provider participant against the same room version.

The additive `discovery_paused` column defaults false, preserving existing row
behavior. New clients always send an explicit `p_discovery_paused`; omitted
legacy arguments preserve the current pause. A legacy `private`/Off request for
an existing Circle/Public room becomes pause, not an audience change. Pause is
included in CAS revisions and acknowledgements, so Off/On/Off ABA cannot reuse
an old save or Start. Waiting drafts retain the originally read room generation
and revision through autosave and Start; a fresh read cannot silently rebase an
older On draft over a newer pause. Explicit Reload discards stale edits. Audience
edits while Off never transiently publish. Party
admission uses the actual joined host's current room/source/session proof, not
the existence of a listing; pausing is not an admission revocation.

Concurrent writes remain single-flight until actual transport settlement,
including after Back, backgrounding or unmount. Uncertain writes require a
fresh read; they are not automatically retried. Read deadlines and room/account
changes discard stale drafts and responses. The Stage overlay does not auto-hide
an open editor. Unavailable current room authority clears old controls, room
metadata, media contracts, channels and heartbeat rather than retaining access.

This client requires the paired host-settings and listing-pause SQL/Edge authority cutover.
Without generation/revision fields the editor is unavailable; it never falls
back to unversioned writes. Exact-code lookup uses a scoped current-session RPC,
not a broad private-room directory query.

## Verification scope

Mounted React tests exercise the production editor and actual client helper:
private defaults; explicit confirmation; current host vs nonhost; owner consent;
title requirements; empty Circle errors; busy/timeout/readback; rapid taps;
Back/cancel; changed accounts/sessions/generations; ended rooms; stale responses;
no-op publication acknowledgements; and real Stage bootstrap resource retirement.
Pause/resume cases also cover preserved Circle admission settings, legacy
private defaults, explicit owner re-consent, audience changes while unlisted,
strict pause acknowledgement, and stale-revision/ABA rejection.
Existing Player creation/preparation/recovery and room/navigation/monetization
regressions remain part of Required Validation.

Native modules/providers remain LiveKit, camera/microphone and Supabase; no
native dependency or commerce/provider configuration is changed. Mounted/source
checks do not prove Android/iOS installed behavior or notification delivery.
Installed golden cases remain separate per platform: host changes audience while
connected; outsider sees/hides the current card; existing/new viewers obey locks
and Circle changes; owner opts into only one room; Back/foreground preserve the
correct room; ended rooms disappear. No deployment, release or OTA is performed
by this source change.
