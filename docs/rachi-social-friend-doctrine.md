# Chi'llywood Rachi + Social Friend Doctrine

## 1. Purpose And Scope
This document locks the current owner/admin/Rachi/social-friend truth before broader behavior or polish work continues.

It exists to:
- separate current truth from desired later social truth
- keep owner/admin/Rachi authority boundaries intact
- define what `Rachi as your first friend` can and cannot mean today
- define what a native Chi'llywood friend list should mean when it becomes real

This document does not:
- change route truth
- change schema
- implement UI behavior
- let Rachi outrank owner authority
- rename followers or subscribers into friends

## 2. Current Doctrine That Must Be Preserved
- `/profile/[userId]` remains the canonical public profile/channel route.
- `/channel-settings` remains the creator-side control center.
- `/admin` remains the bounded internal/admin owner.
- owner remains above Rachi.
- Rachi is internal AI operations/system truth and official platform identity, not owner authority.
- creator/channel subscriber truth remains distinct from account-tier Premium truth.
- no route proliferation, no schema drift, and no fake social metrics are allowed in this doctrine pass.

## 3. Current Rachi Truth

### 3.1 What Is Already Real
Current repo truth already supports:
- Rachi as the protected official platform account in `_lib/officialAccounts.ts`
- Rachi on the canonical `/profile/[userId]` route and canonical Chi'lly Chat routes
- Rachi as an official starter/contact presence through the inbox starter card and direct-thread handoff
- Rachi as a distinct `official_platform` moderation actor with an audit owner key
- bounded `/admin` visibility that keeps owner authority above Rachi and explicitly marks Rachi as observe-only today

### 3.2 What Is Not Yet Real
Current repo truth does not yet support:
- Rachi as a native friend-graph primitive
- Rachi as an automatically seeded mutual friend relationship for every account
- Rachi as owner authority or a hidden admin override
- Rachi automation queues, domain pause/resume controls, or approval-control state
- a public claim that Rachi already behaves like a full social assistant or community CRM

## 4. Current Native Social Truth

### 4.1 What Already Exists
The current repo has real social/audience relationship truth for:
- `channel_followers`
- `channel_subscribers`
- `channel_audience_requests`
- `channel_audience_blocks`
- public activity visibility and follower/subscriber surface visibility on `user_profiles`
- direct Chi'lly Chat threads between users and official accounts

### 4.2 What Does Not Exist Yet
The current repo does not have:
- a native friend relationship table or friend helper
- a friend-list read model
- friend visibility rules
- a public or private profile friend-list surface
- a doctrine-backed mutual-friend concept under another name

Followers and subscribers are not a hidden friend system:
- followers are one-way creator/channel audience relationships
- subscribers are creator/channel member relationships
- neither one expresses a mutual person-to-person friendship

## 5. Doctrine Decisions

### 5.1 `RACHI_SOCIAL_TRUTH = PARTIALLY_REAL`
Why:
- the embedded official starter/contact presence is already real on canonical profile and Chi'lly Chat surfaces
- the repo already protects Rachi as official platform identity and moderation actor truth
- but `everyone's embedded first friend` is not fully real because there is no backed friend relationship, no universal seeded friend row, and no current doctrine that turns Rachi into a mutual social-graph node

### 5.2 `FRIEND_LIST_TRUTH = MISSING_BUT_NEXT`
Why:
- the repo has zero native friend-list truth today
- broader behavior/polish work should not continue while the product still lacks a locked definition for what `friend` means inside Chi'llywood
- the next lane should define the native friend system cleanly before any broader UI behavior starts speaking as if that graph already exists

This does not mean:
- friends are already a Public v1 shipped capability
- followers or subscribers should be renamed into friends
- schema should be changed in this doctrine pass

## 6. What A Native Chi'llywood Friend List Should Mean
When the friend system is intentionally opened, `friend` should mean:
- a mutual person-to-person Chi'llywood relationship
- distinct from one-way creator/channel follow
- distinct from creator/channel subscriber membership
- distinct from account-tier Premium entitlement
- privacy-aware by default

Recommended visibility doctrine:
- raw friend relationship truth should be private to the two people plus bounded platform/admin access where policy allows
- any later profile friend surface should be public-safe and visibility-aware instead of exposing the full private friend graph by default
- `/profile/[userId]` may later show public-safe friend context, mutual-friend context, or a friend-list module only when that truth is actually backed

## 7. Public Vs Internal Meaning

### 7.1 Public Product Meaning Now
Publicly, Rachi currently means:
- official Chi'llywood concierge
- trusted getting-started and account-help presence
- canonical official profile and thread continuity

Publicly, the current social graph currently means:
- creator/channel audience posture
- follower/subscriber visibility posture where backed
- direct-thread continuity through Chi'lly Chat

### 7.2 Internal/Admin Meaning Now
Internally, Rachi currently means:
- protected official-platform identity
- `official_platform` moderation actor truth
- audit-minded official presence
- future AI operations lane that still stays below owner authority

Internally, current admin truth does not mean:
- Rachi has final approval power
- Rachi can self-authorize sensitive actions
- Rachi is the same thing as a social friend system

## 8. Exact Next Lane Before Broader Polish
Before any broad whole-app behavior or polish pass continues, the next exact lane should be:

`native friend graph implementation-spec pass`

That next lane should:
- define the canonical meaning of a Chi'llywood friend relationship
- define how friend truth differs from followers, subscribers, requests, and blocked audience
- define private-vs-public friend visibility rules
- define how Rachi can remain the official first-contact presence without being mistaken for owner authority or a fake already-shipped friend graph
- map the future friend system onto `/profile/[userId]`, Chi'lly Chat continuity, and any needed helper/read-model owners without changing route truth

Out of scope for that next lane:
- broad UI implementation
- schema migration work unless a later spec proves a tiny foundation change is safely required
- fake friend counts, fake mutuals, or fake social affordances
