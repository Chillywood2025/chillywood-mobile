# Chi'llywood Native Friend Graph Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's native friend-graph doctrine before any friend implementation work begins.

It exists to:
- lock the exact meaning of a Chi'llywood friend relationship
- separate friend truth from current creator/channel audience truth
- define what profiles may show publicly vs privately when friend truth lands
- define how friend truth relates to Chi'lly Chat, live/watch-party surfaces, and Rachi's official presence
- define the exact phased implementation order for the native friend graph

This spec does not:
- change route truth
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
`/profile/[userId]` is already the canonical public profile/channel route.

Current public-safe social truth on that route is limited to:
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
- an official starter/contact presence on canonical profile and Chi'lly Chat surfaces
- a distinct `official_platform` moderation actor with an audit owner key

Rachi is not yet:
- a native friend-graph primitive
- an automatically accepted mutual friend for every user
- owner authority

### 2.5 What Does Not Exist Yet
The current repo does not have:
- a native friend relationship table
- a friend-request helper or read model
- a friend-list module on `/profile/[userId]`
- private mutual-friend context
- public friend visibility controls
- any person-to-person friendship truth under another name

## 3. Why Friend Truth Must Not Be Faked
If friend truth were faked now, the product would become structurally confusing:
- followers would be misrepresented as mutual friendship even though they are creator/channel audience relationships
- subscribers would be misrepresented as social closeness even though they are creator/channel member/access relationships
- direct threads would look like proof of friendship even though Chi'lly Chat is intentionally direct-message-first
- Rachi's official starter presence would be misread as a real shipped mutual friend system
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
When friend truth is implemented later, the native lifecycle should support:
- `pending`
- `active`
- `declined`
- `canceled`
- `removed`

Meaning:
- `pending`: one side has requested friendship and the other side has not accepted yet
- `active`: mutual friendship exists
- `declined`: the invite was rejected
- `canceled`: the sender withdrew the invite before acceptance
- `removed`: an active friendship was ended

This pass does not add schema for those states. It only locks the doctrine.

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

`friends-only` room access is later-phase only and must not be implied by this spec pass.

## 10. Rachi Relationship To Friend Truth
Rachi remains outside the normal native friend graph in current truth.

Current doctrine:
- Rachi is the official first-contact presence
- Rachi stays discoverable through canonical profile and Chi'lly Chat routes
- Rachi is not auto-accepted into every user's friend list
- Rachi is not the proof that a native friend graph already ships

If later product language wants a more social-feeling Rachi experience, it must still preserve:
- owner-above-Rachi authority
- explicit official identity markers
- the distinction between official contact presence and ordinary friendship

The safest later direction is:
- treat Rachi as an official contact/pinned starter presence first
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
   This file.
2. Schema + helper foundation pass.
   Add the canonical person-to-person friend relationship foundation, request lifecycle, and helper layer without public UI adoption yet.
3. Private read-model pass.
   Add self-only friend summary truth, pending request truth, and mutual-friend derivation where actually backed.
4. Narrow profile/chat adoption pass.
   Add friend entry points or self-only friend surfaces on existing canonical routes without route proliferation.
5. Public-safe profile adoption pass, only if visibility doctrine is backed.
6. Later live/watch-party/social-presence integrations, only when separately justified and backed.

## 13. Exact Next Lane
The next exact lane after this spec pass should be:

`native friend graph schema + helper foundation pass`

That next lane should:
- establish the canonical friend relationship foundation
- keep friendship person-to-person and mutual
- keep Rachi outside default friend-count and auto-friend truth
- avoid public profile adoption until private/read-model truth exists
- avoid fake UI or fake social counts
