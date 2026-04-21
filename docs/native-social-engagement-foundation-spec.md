# Chi'llywood Native Social Engagement Foundation Spec

## 1. Purpose And Scope
This document locks the current repo truth for Chi'llywood's first native social-graph and content-engagement foundation pass.

It exists to:
- separate already-backed social truth from missing social truth
- define what is currently real for friendship, likes, comments, and sharing
- prevent broader polish or UI rollout from faking a shipped social network
- define the narrowest safe implementation order for the current lane

This spec does not:
- implement broad UI rollout
- add schema beyond the minimum current-lane foundation
- rename creator/channel audience systems into friendship
- pretend room comments already equal a universal content comment system

## 2. Current Truth Already In Repo

### 2.1 Native Friend Doctrine Exists, And Native Friend Foundation Is Now Real
Current friend doctrine is already locked in `docs/native-friend-graph-implementation-spec.md`.

That doctrine already defines:
- friendship is mutual
- friendship is person-to-person
- friendship is private-first
- friendship is separate from followers, subscribers, requests, blocked audience, direct threads, and Rachi's official presence

Current repo truth now also includes:
- `user_friendships`
- `request_friendship(...)`
- `respond_to_friendship(...)`
- `_lib/friendGraph.ts`

What does not exist yet:
- self-only friend UI adoption
- public friend visibility controls
- mutual-friend context

### 2.2 Native Likes Already Have Real Schema Truth For Titles
Current repo schema already supports title-level native like truth through:
- `public.user_content_relationships`
- `relationship_type = 'like'`
- `user_profiles.likes_visibility`
- `_lib/contentEngagement.ts`

That means:
- likes are already a real stored content relationship for titles
- like visibility doctrine already exists at the profile level

What is still missing:
- any route adoption that consumes the stored relationship honestly
- any later public metric policy beyond the current stored relationship truth

### 2.3 Native Shares Already Have Real Schema Truth For Titles
Current repo schema already supports title-level native share truth through:
- `public.user_content_relationships`
- `relationship_type = 'share'`
- `user_profiles.shares_visibility`
- `_lib/contentEngagement.ts`

That means:
- shares are already a real stored content relationship for titles
- share visibility doctrine already exists at the profile level

What is still missing:
- route adoption that treats share truth as a stored relationship instead of only a system share-sheet affordance
- any broader repost/feed behavior

### 2.4 Comments Are Real Only In Room / Live Contexts Today
Current repo already supports bounded comments through:
- `watch_party_room_messages`
- Party Room
- Live Stage
- player-linked room comment entry

This means:
- comments are already real on room-owned surfaces
- watch-party/live social interaction is already backed where the owning surface is the room

This does not mean:
- titles already have a native content comment system
- profiles already have a native comment system
- Chi'lly Chat threads equal content comments

### 2.5 Native Share Sheet Invites Are Not The Same As Native Share Graph Truth
Current repo also uses `Share.share(...)` on watch-party/live invite flows.

That system-share behavior is real, but it is not the same thing as:
- a stored content share relationship
- a public repost graph
- a universal share ledger across all entity types

## 3. Hard Distinctions That Must Stay Intact
- `friends` are person-to-person and mutual
- `followers` are creator/channel audience relationships
- `subscribers` are creator/channel member/access relationships
- `comments` are currently room-owned interaction truth only
- `likes` and `shares` are currently title-content relationships only
- `shares` are not automatically the same thing as native system-share-sheet behavior
- `Rachi` remains official platform contact presence, not default friendship truth

## 4. Readiness Decisions For The Current Lane

### 4.1 Friend Graph
- current truth: doctrine locked, schema/helper foundation now real
- readiness decision: `FRIEND_GRAPH_FOUNDATION_READY = YES`
- why: the repo already has the narrow pair-based friend foundation and can now move into later private/adoption audits without faking public friendship

### 4.2 Likes
- current truth: title-level like schema and helper foundation exist
- readiness decision: `CONTENT_LIKES_FOUNDATION_READY = YES`
- why: the underlying table, visibility truth, and viewer-state helper are now real without inventing broad UI

### 4.3 Comments
- current truth: room/live comments already exist, but no universal title/profile comment system exists
- readiness decision: `CONTENT_COMMENTS_FOUNDATION_READY = NO`
- why: creating a new content-comment system in this lane would invent broader product truth instead of finishing the current narrow foundation

### 4.4 Shares
- current truth: title-level share schema and helper foundation exist
- readiness decision: `CONTENT_SHARES_FOUNDATION_READY = YES`
- why: the stored relationship and helper foundation are now real for titles without claiming a full public repost graph

## 5. Exact Current-Lane Implementation Order
1. Land the native friend graph schema + helper foundation.
   Landed April 21, 2026.
2. Land the title-content engagement helper foundation for likes and shares only.
   Landed April 21, 2026.
3. Keep comments limited to existing room/live truth in this lane.
4. Stop short of broad route adoption unless one tiny proof surface is clearly justified and honest.

## 6. Hard Not-Yet Boundaries
Not current truth:
- public friend counts
- public friend lists by default
- fake mutual-friend context
- universal content comments
- profile comments
- public like/share counts presented as if total engagement truth already ships everywhere
- fake repost feeds
- auto-friending Rachi
- treating followers or subscribers as friendship

## 7. Exact Next Lane Inside This Chapter
The current foundation chapter should now proceed in this order:
- Stage 2: native friend graph schema + helper foundation
- Stage 3: title-content engagement helper foundation for likes and shares only
- later: narrow native social adoption audit on existing canonical routes, starting with self-only friend read surfaces and title/player like-share read surfaces only where those adoptions stay honest
