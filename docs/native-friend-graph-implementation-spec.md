# Chi'llywood Native Friend Graph Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's native friend-graph doctrine before any friend implementation work begins.

May 6, 2026 update:
- this file still governs the friend graph doctrine and hard boundaries
- the narrow schema + helper foundation is real in repo truth through `user_friendships`, request/respond helpers, and `_lib/friendGraph.ts`
- the shipped product name for this mutual relationship is `Chi'lly Circle`
- Chi'lly Circle V1 is pushed with request, accept, decline, cancel, remove, My Chi'lly Circle management, Follow separation, and channel-audience block override
- Chi'lly Circle profile privacy is pushed with Everyone, Chi'lly Circle Only, and Private

It exists to:
- lock the exact meaning of a Chi'llywood friend relationship
- separate friend truth from current creator/channel audience truth
- define what profiles may show publicly vs privately when friend truth lands
- define how friend truth relates to Chi'lly Chat, live/watch-party surfaces, and Rachi's official presence
- define the exact phased implementation order for the native friend graph

This spec does not:
- change current route truth beyond recording that Profile is `/profile/[userId]`, public Platform is `/channel/[userId]`, and owner Platform Studio is `/channel-studio`
- implement UI behavior
- add schema in this pass
- rename followers, subscribers, requests, or blocked audience into friends
- pretend a shipped friend system already exists

## 2. Current Truth Already In Repo

### 2.1 Creator / Channel Audience Truth Already Exists
Current repo truth already supports these creator/channel audience relationships:
- `channel_followers`
- `channel_subscribers`
- `channel_audience_requests`
- `channel_audience_blocks`
- public activity visibility and follower/subscriber surface visibility on `user_profiles`

These mean:
- followers are one-way creator/channel audience relationships
- subscribers are creator/channel member relationships
- requests are creator/channel audience review posture
- blocked audience is a creator/channel safety boundary

These are not person-to-person friendship truth.

### 2.2 Public Profile / Channel Truth Already Exists
`/profile/[userId]` is the personal/social Profile route. `/channel/[userId]` is the public Platform route. `/channel-studio` is the owner-only Platform Studio route, with `/channel-settings` kept as compatibility.

Current public-safe social truth on Profile and Channel routes is limited to:
- identity and official/profile state
- creator/channel audience posture
- public activity visibility posture
- follower/subscriber visibility posture when backed
- Chi'lly Chat handoff

Current profile truth does not include:
- friend list
- mutual-friend context
- private friend roster
- public friend count

### 2.3 Direct Message / Person-To-Person Chat Truth Already Exists
Chi'lly Chat already supports direct person-to-person threads through:
- `chat_threads`
- `chat_thread_members`
- `chat_messages`

Current direct-thread truth means:
- two identities can have a direct thread
- the thread can exist without any friend relationship
- official accounts can use the same canonical thread system

Current direct-thread truth does not mean:
- the participants are friends
- a chat thread is a friend request
- a chat thread is proof of mutual social consent

### 2.4 Rachi Truth Already Exists
Rachi already exists as:
- Chi'llywood's protected official platform account
- the first pinned Chi'lly Circle official connection
- an official guide/contact presence on canonical Profile, public Platform, Home, and the first Chi'lly Circle placement
- a distinct `official_platform` moderation actor with an audit owner key

Rachi is not yet:
- a native friend-graph primitive
- an automatically accepted mutual friend for every user
- owner authority
- a private-chat reader or monitor

### 2.5 What Does Not Exist Yet
The current repo now has Chi'lly Circle V1 mutual connection actions and privacy gates. It still does not have:
- a public friend-list module on `/profile/[userId]`
- broad public mutual-friend context
- a public friend count
- friend-powered room access

## 3. Why Friend Truth Must Not Be Faked
If friend truth were faked now, the product would become structurally confusing:
- followers would be misrepresented as mutual friendship even though they are creator/channel audience relationships
- subscribers would be misrepresented as social closeness even though they are creator/channel member/access relationships
- direct threads would look like proof of friendship even though Chi'lly Chat is intentionally direct-message-first
- Rachi's pinned official Chi'lly Circle presence would be misread as a real shipped mutual friend system
- `/profile/[userId]` would start implying private relationship truth that the repo cannot currently back

## 4. Exact Friend Definition
A Chi'llywood `friend` is:
- a person-to-person social relationship between two user identities
- mutual, not one-way
- separate from creator/channel audience relationships
- separate from account-tier Premium entitlement
- separate from direct-message existence

Canonical doctrine:
- friendship begins as a request/invite flow and becomes real only after explicit acceptance
- friendship is active only when both sides are in the accepted state
- self-friendship is invalid
- official-platform presence is not automatically friendship

## 5. Canonical Friend Lifecycle Doctrine
The native lifecycle supports or should preserve:
- `pending`
- `active`
- `declined`
- `canceled`
- `removed`

Meaning:
- `pending`: legacy/request-management state for previously created or imported request rows
- `active`: a Chi'lly Circle connection exists
- `declined`: the invite was rejected
- `canceled`: the sender withdrew the invite before acceptance
- `removed`: an active friendship was ended

Current Profile behavior treats `Add to Chi'lly Circle` as an immediate active connection for public profiles. Private and Chi'lly Circle-only target profiles still receive a pending incoming request for approval. Request, accept, decline, and cancel semantics remain supported for private-profile approval and legacy pending rows. Followers and subscribers must not be renamed into Chi'lly Circle connections.

## 6. Public Vs Private Visibility Doctrine

### 6.1 Default Visibility
Friend truth is private-first by default.

That means:
- the raw friend graph belongs first to the two people involved
- raw friendship rows should not be public profile content by default
- current public profiles should continue showing no friend list until the system is actually backed

### 6.2 Private / Self-Only Visibility
Later private surfaces may show:
- the signed-in user's full friend list
- incoming and outgoing pending friend requests
- friend-management actions
- mutual-friend context for the signed-in user

These later private surfaces must stay on existing route owners rather than inventing a new friend app by default.

### 6.3 Public-Safe Visibility Later
Public profile adoption is later and must stay opt-in and public-safe.

Public route doctrine:
- `/profile/[userId]` must not show a public friend list by default
- full raw friend rosters must not become public profile chrome by default
- mutual-friend context, if later shown, is signed-in/private-context truth rather than public-broadcast truth

Later public-safe options may include:
- no public friend visibility at all
- public friend count only
- limited public friend-list module only if explicit profile visibility doctrine and per-friend visibility truth both exist

Those options are later-phase and not current truth.

## 7. Distinction From Other Relationship Systems

### 7.1 Friends vs Followers
- friends are mutual person-to-person relationships
- followers are one-way creator/channel audience relationships
- following a channel must not silently create friendship
- following can happen from Profile, public Platform, creator-video Player, shared creator-video Player, Party Room participant sheets, and Live Stage participant sheets when a real creator/user id is available
- a Follow action means “show me more from this creator Platform”; it does not mean personal closeness, private Profile access, Chi'lly Chat permission, room access, Premium, paid ticket access, subscriber access, VIP, or host/speaker authority
- Chi'lly Circle remains the personal connection layer; public profiles can be added instantly, while private and Chi'lly Circle-only profiles receive an incoming request for approval

### 7.2 Friends vs Subscribers
- friends are social relationships
- subscribers are creator/channel membership relationships
- subscriber truth must stay distinct from account-tier Premium truth and from friendship

### 7.3 Friends vs Requests
- current `channel_audience_requests` are creator/channel audience review posture
- friend requests must be a separate person-to-person system later
- friend requests must not reuse creator/channel audience request meaning in UI copy

### 7.4 Friends vs Blocked
- current `channel_audience_blocks` are creator/channel audience boundaries
- they are not person-to-person friend-block truth
- future user-level friend suppression or block truth must remain separate from creator/channel blocked audience doctrine

### 7.5 Friends vs Rachi
- Rachi is official platform presence, not ordinary friendship truth
- Rachi must not be auto-counted as part of a user's native friend list
- Rachi must not inflate public friend counts or mutual-friend signals

## 8. Friend Graph Interaction With Chi'lly Chat
Friendship and Chi'lly Chat must stay related but distinct.

Locked doctrine:
- direct messaging does not require friendship
- friendship does not replace Chi'lly Chat route ownership
- `/chat` and `/chat/[threadId]` remain the canonical direct-thread owners
- a later friend action may hand off into a direct thread, but it must not create a second messaging system
- removing friendship must not silently delete existing direct-thread history

## 9. Friend Graph Interaction With Profile / Live / Watch-Party

### 9.1 Profile
- `/profile/[userId]` remains the canonical social identity route
- later friend truth may surface there only through public-safe or self-only modules
- the profile route must not turn into a fake always-public friend roster

### 9.2 Live / Watch-Party
Friendship is not an entitlement system.

That means:
- friendship must not bypass room join policy
- friendship must not bypass Premium, Party Pass, or later ticketing/access doctrine
- friendship may later inform social context, invites, or presence cues only when those flows are separately backed
- Live / Watch-Party participant sheets may expose Follow for creator identity discovery, but this is a one-way channel audience action and must not change room permissions or friendship state

`friends-only` room access is later-phase only and must not be implied by this spec pass.

## 10. Rachi Relationship To Friend Truth
Rachi remains outside the normal native friend graph in current truth.

Current doctrine:
- Rachi is the first pinned Chi'lly Circle official connection
- Rachi stays discoverable through canonical Profile, public Platform, Home, and the first Chi'lly Circle placement
- Rachi is not auto-accepted into every user's friend list
- Rachi is not the proof that a native friend graph already ships

If later product language wants a more social-feeling Rachi experience, it must still preserve:
- owner-above-Rachi authority
- explicit official identity markers
- the distinction between official contact presence and ordinary friendship

The safest later direction is:
- treat Rachi as an official contact and pinned Chi'lly Circle presence first
- do not treat Rachi as a normal mutual friend by default

## 11. Hard Not-Yet Boundaries
Not current truth:
- native friend counts
- mutual-friend badges
- public friend-list modules
- friend-powered room access
- friend-powered monetization or entitlement bypass
- auto-friending Rachi
- renaming followers or subscribers into friends
- a separate `/friends` route by default

## 12. Phased Implementation Order
1. Doctrine/spec pass.
   Closed.
2. Schema + helper foundation pass.
   Landed April 21, 2026 through `user_friendships`, `request_friendship(...)`, `respond_to_friendship(...)`, and `_lib/friendGraph.ts`. On June 15, 2026, `request_friendship(...)` was corrected for product behavior so public Profile adds become `active` immediately, private/Circle-only Profile adds become pending incoming requests, and block, self, and official-account guards remain in force.
3. Private read-model pass.
   Add self-only friend summary truth, pending request truth, and mutual-friend derivation where actually backed.
4. Narrow profile/chat adoption pass.
   Add friend entry points or self-only friend surfaces on existing canonical routes without route proliferation.
5. Public-safe profile adoption pass, only if visibility doctrine is backed.
6. Later live/watch-party/social-presence integrations, only when separately justified and backed.

## 13. Exact Next Lane
The next exact lane after this spec pass should be:

`native friend graph private/adoption audit on existing canonical routes`

That next lane should:
- keep the landed friend foundation distinct from followers, subscribers, direct threads, and Rachi's official presence
- determine the smallest honest self-only or route-owned adoption surface next
- avoid public profile adoption until private/read-model truth exists
- avoid fake UI or fake social counts
