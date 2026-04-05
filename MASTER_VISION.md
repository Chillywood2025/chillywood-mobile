# MASTER VISION

## Product Identity
Chi'llywood is one premium social streaming platform.

It blends:
- streaming and playback
- title discovery
- creator channels and profiles
- Party Rooms
- Live Rooms
- watch-together experiences
- native messaging, calling, and social presence
- reusable likes, shares, save/download, and cast actions

The correct stylized product name is:
**Chi'llywood**

Chi'llywood's communication layer is also native to Chi'llywood.
It must not be described or framed as another player brand, another messenger brand, or a third-party communication system.

## One-Platform Rule
Chi'llywood is one product, not a bundle of unrelated mini-products.

Do:
- keep surface relationships clear
- keep labels intentional and stable
- make navigation feel like one ecosystem
- let playback, rooms, chat, and profiles feel connected

Do not:
- create duplicate room concepts
- create ghost destinations
- solve architecture drift by inventing extra user-facing layers unless explicitly approved

## Product Glossary
- `Chi'lly Chat`: Chi'llywood's native messenger layer across inbox, direct threads, room-linked conversations, voice/video calls, and creator/fan/community coordination.
- `Party Room`: the canonical watch-party room on `/watch-party/[partyId]`.
- `Live Room` / `Live Stage`: the canonical live room on `/watch-party/live-stage/[partyId]`.
- `Party Waiting Room`: the waiting-room surface that leads into Party Room.
- `Live Waiting Room`: the waiting-room surface that leads into Live Room.
- `Live First`: creator/live-room style live mode inside Live Room.
- `Live Watch-Party`: the home-screen product-flow label and the social live-viewing mode inside Live Room.
- `Watch-Party Live`: the title/player-driven watch-together flow label.
- `Profile`: Chi'llywood's social identity hub for creator identity, community activity, and public/private content relationships.
- `Rachi`: Chi'llywood's official platform-owned seeded account, concierge presence, and moderation-ready official persona inside the same canonical profile/channel and Chi'lly Chat system.
- `Like`: a first-class content relationship showing affinity for a title or creator surface when policy allows it.
- `Share / Repost`: a first-class content relationship for redistributing or signaling content when policy allows it.
- `Download / Save`: a rights-aware content relationship that only appears when entitlement and policy allow the title to be saved or downloaded.
- `Cast / TV Handoff`: a rights-aware standalone-player handoff from the device player to an external screen.

## Locked Product Semantics
- `Live First` means just-live creator/live-room behavior.
- `Live Watch-Party` means a live social viewing room where host sees viewers, viewers see host, and viewers see viewers.
- `Watch-Party Live` means watch content together while viewers can see each other.
- Party flow is `Player -> Watch-Party Live -> Party Waiting Room -> Party Room -> shared watch-party player`.
- Live Stage belongs only to the separate Live flow.
- Party Room must not hand off to Live Stage.

These meanings are intentionally distinct and must not be blurred together.

## Approved UI Wording
- title/player CTA = `Watch-Party Live`
- home-screen product-flow label = `Live Watch-Party`
- profile/channel communication entry = `Chi'lly Chat`

## Surface Ownership
- Home owns `Live Watch-Party`
- Player and title-driven playback surfaces own `Watch-Party Live`
- Party Room owns the shared watch-party player and room-native controls
- Live Room owns `Live First` and `Live Watch-Party`
- `/chat` owns standalone Chi'lly Chat inbox, direct threads, and thread-based calls
- Party Room and Live Room own embedded room-linked Chi'lly Chat behavior
- Profile owns social identity, public/private relationship visibility, and creator/community presentation
- Title and player own reusable rights-aware content actions

## Communication Direction
Room-native communication and standalone Chi'lly Chat are both valid Chi'llywood surfaces, but they are not the same thing.

Room-native communication:
- lives inside Party Room and Live Room
- strengthens the canonical room surfaces
- must not become a separate competing communication-room destination

Standalone Chi'lly Chat:
- lives on `/chat`
- is Chi'llywood's native inbox and direct-thread communication product
- must remain distinct from Party Room and Live Room semantics

Chi'lly Chat is an MVP-first messenger layer.

That means:
- embedded room chat is a Chi'lly Chat surface, not the definition of Chi'lly Chat
- embedded room chat is not the final reference UX for standalone messenger evolution
- direct threads, inbox, room-linked conversations, and live coordination must share one communication system
- future messenger improvements must not collapse Chi'lly Chat back into a room-only widget

## Chi'lly Chat MVP Truth
Chi'lly Chat is Chi'llywood's built-in messenger layer.

It is not:
- just an in-room side panel
- a separate second app

MVP truth:
- standalone inbox lives on `/chat`
- direct thread lives on `/chat/[threadId]`
- direct-thread MVP includes a header, messages, composer, timestamps, optimistic sending, realtime updates, and mark-read on open/focus
- the MVP data model is `chat_threads`, `chat_thread_members`, and `chat_messages`
- profile-to-profile communication should open or create a direct Chi'lly Chat thread
- thread-based voice/video calling should reuse shared communication-room primitives inside Chi'llywood
- Chi'lly Chat is direct-messaging-first in MVP and expands later into broader social/community communication

## Profile / Channel MVP Truth
Profiles are not just simple account pages.

They are Chi'llywood's social identity hubs and should evolve into each user's mini streaming platform / creator channel.

MVP truth:
- the authenticated user's own profile opens their own channel/profile surface
- viewing another user's profile should support opening or creating a direct Chi'lly Chat thread
- profile surfaces should naturally connect with Chi'lly Chat, watch-party coordination, live communication, and broader social identity
- photos/videos, likes, saved movies/videos, creator/channel identity, and community interaction are approved profile/channel depth
- future profile/channel depth must extend the same native Chi'llywood profile system instead of inventing a disconnected second app or parallel creator identity

## Official Platform Account Truth
Rachi is Chi'llywood's official platform-owned seeded account.

MVP truth:
- Rachi is not a normal user profile with ordinary self-claim or self-edit semantics
- Rachi must use the canonical `/profile/[userId]` and Chi'lly Chat thread architecture instead of a disconnected special route
- Rachi must be visually identifiable as official/platform-owned
- Rachi should act as the default official starter presence for welcome/help messaging
- future moderation, announcement, and platform-help behavior must extend the same protected official identity foundation instead of inventing a second persona system

## Profile And Content Direction
Profiles are social identity hubs, not static account cards.

MVP truth:
- liked content is a first-class profile relationship
- shared or reposted content is a first-class profile relationship
- saved or public-facing activity belongs in the same profile identity system where product rules allow it
- creator-channel identity, fan/community activity, uploads/clips, and public lists are approved follow-on profile depth

Content actions are reusable platform primitives, not one-off buttons.

MVP truth:
- like, share/repost, download/save, and cast eligibility must be reusable across title, player, profile, and later room-linked surfaces
- these actions must remain rights-aware and entitlement-aware
- blocked or restricted content must not expose disallowed share, download, or cast actions
- standalone-player cast / TV handoff is approved MVP direction and must not change current player semantics

## Execution Principle
Build toward the full platform vision without losing structural clarity.

Every change should:
- preserve canonical room routes
- keep labels and semantics stable
- strengthen real product behavior instead of temporary illusions
- leave enough repo truth behind that future sessions do not rediscover the product
