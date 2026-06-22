# Creator Content Circle Visibility Plan

## Current Audit

Creator videos currently support `draft | public` visibility only.

- `draft` is owner-only and appears in owner Studio/Content surfaces.
- `public` can appear on the creator's public Platform and public discovery reads when moderation, playability, and rights filters allow it.
- Public discovery reads are filtered through public-safe helpers and `discovery_feed_items` public checks.
- Chi'lly Circle membership exists for profile/social access, but creator-video Circle-only read/write access is not backed.
- No backed follower-feed or Chi'lly Circle member-feed write path for creator-video visibility changes was found in this lane.

## Required Backed Work

Before showing `Make Private for Chi'lly Circle` as a working creator-video action:

1. Extend creator-video visibility with a backed `circle_only` value without treating it as owner-only draft.
2. Add owner-scoped write validation for `draft`, `circle_only`, and `public`.
3. Add read resolvers that allow `circle_only` playback/cards only for the owner, platform staff where appropriate, and active Chi'lly Circle members.
4. Add locked/private link state for non-authorized viewers without exposing playback URLs.
5. Keep public Explore/Home reads restricted to `public`, safe moderation state, playable media, and rights-safe content.
6. Add backed Circle feed/read-model support before distributing Circle-only content to Circle surfaces.
7. Ensure Save as Draft removes public, follower, Circle, Home, and Explore eligibility.
8. Ensure Make Public restores only eligible public Platform/discovery/follower/Circle distribution where those read models are backed.

Until this is implemented, owner-only behavior must stay labeled `Save as Draft`.
