# Chi'llywood Channel Design / Layout Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's channel design / layout chapter.

It is implementation doctrine, not UI code.

It exists to:
- preserve current route truth while Chi'llywood deepens creator-controlled channel presentation
- keep `/channel-settings` as the creator-side design/layout owner
- keep `/profile/[userId]` as the canonical public channel presentation surface
- define what design/layout truth already exists in global config, title programming, and current profile rendering
- define the structured design/layout system Chi'llywood should build next without drifting into freeform chaos
- define the phased implementation order for this chapter

This spec does not:
- change route truth
- create `/studio*` routes
- create a freeform page builder
- add schema directly
- turn `/profile/[userId]` into an arbitrary drag-and-drop canvas

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/channel-settings` | `app/channel-settings.tsx` | Canonical creator-side control center and future owner for channel design/layout controls. |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel route and public presentation surface. |
| `/title/[id]` | `app/title/[id].tsx` | Canonical title detail surface. Title programming flags may influence profile presentation, but title route truth does not move here. |
| `/watch-party/*` | current room owners | Live/party route truth remains separate from channel layout truth. |

Do not create route proliferation in this chapter.

### 2.2 Product Rules To Preserve
- `/channel-settings` stays the creator-side owner for design/layout controls.
- `/profile/[userId]` stays the public-facing channel surface.
- Global app theme truth stays in app config until per-channel design truth is honestly backed.
- Content programming truth and layout truth may interact, but they are not the same system.
- Live/event surfaces remain distinct from channel hero/layout choices.
- Design/layout should be structured, bounded, and explainable, not freeform.

### 2.3 Current Design/Layout Boundary
Current doctrine is intentionally narrow:
- global theme and home presentation truth already exist
- current profile/channel presentation already uses real title-programming and live/community blocks
- creator-facing design/layout control on `/channel-settings` is still mostly doctrinal/placeholder

That means:
- do not imply per-channel design customization where no persisted truth exists
- do not imply arbitrary block builders
- do not imply creator can freely rearrange every public block today

## 3. Exact Design / Layout Concepts And Meanings

### 3.1 Design
Design means the visual identity choices that affect the feel of a channel surface.

Examples:
- hero treatment
- avatar framing
- accent direction
- visible brand presence
- preset-based palette direction

Current doctrine:
- global app theme preset is real
- per-channel design customization is not yet real

### 3.2 Layout
Layout means the structured arrangement of major channel blocks on the public profile/channel route.

Examples:
- hero lead choice
- default tab emphasis
- featured shelf priority
- live module placement
- content shelf order

Current doctrine:
- public profile block order is real in the route owner
- home/config rail ordering is real globally
- per-channel public block ordering is not yet backed

### 3.3 Templates
Templates mean bounded presentation presets, not arbitrary page builders.

Examples:
- spotlight-first
- live-first
- library-first

Current doctrine:
- template systems are later unless a minimal structured version is explicitly backed

### 3.4 Shelves / Blocks
Shelves and blocks mean predefined presentation modules that can be enabled, ordered, or emphasized.

Examples:
- hero spotlight
- featured content shelf
- live module
- community preview
- about snapshot

Current doctrine:
- the route already renders a stable set of public blocks
- creator-facing control over those blocks is still limited

## 4. Exact Surfaces Where Design / Layout Truth Must Apply Now

### 4.1 Creator-Side Surface
`/channel-settings` must remain the owner for:
- future design settings
- future layout settings
- template or block-order controls if they become real
- summary/explainer copy about what this route will own

### 4.2 Public Surface
`/profile/[userId]` must remain the owner for:
- hero presentation
- profile/channel section order
- content/live/community/about rendering
- any future public-facing layout result from creator controls

### 4.3 Internal / Global Config Surface
Global config helpers may continue to own app-wide defaults for:
- theme preset
- background mode
- home hero mode
- home rail ordering

But:
- global config is not automatically per-channel layout truth
- per-channel design truth must not be faked by reusing global defaults without an honest ownership model

## 5. Current Source-Of-Truth Already In Repo

### 5.1 Global App Theme And Home Layout Truth
Current global design/layout truth already exists in:
- `_lib/appConfig.ts`
- `app_configurations`

Current backed global fields include:
- `theme.preset`
- `theme.backgroundMode`
- `home.heroMode`
- `home.manualHeroTitleId`
- `home.railOrder`
- `home.enabledRails`
- `home.topPicksSource`

This is global app/home truth, not channel-specific design truth.

### 5.2 Current Public Profile/Channel Presentation Truth
Current public channel presentation truth already exists in:
- `app/profile/[userId].tsx`

The route already uses real presentation inputs such as:
- hero state
- official/live/linked badges
- tab structure
- hero-programming selection based on current programming truth
- featured/trending/top-row programming grouping
- public-safe community and event modules

### 5.3 Current Content Programming Inputs
Current title/programming truth already exists in:
- `titles`
- `featured`
- `is_hero`
- `is_trending`
- `pin_to_top_row`
- `sort_order`

These already shape public channel presentation today, especially for:
- hero lead choice
- featured groupings
- public shelves and content emphasis

### 5.4 Current Creator-Side Design/Layout Ownership Signals
Current creator-side route ownership already exists in:
- `app/channel-settings.tsx`

That route already:
- labels `Design` as a near-term section
- labels `Layout` as a near-term section
- labels `Content` as a near-term section
- explicitly states these controls belong here under current route doctrine

This is route-ownership truth, not yet a fully backed design system.

## 6. Missing Truth That Still Needs To Be Built
- per-channel design settings persisted separately from global app theme defaults
- structured per-channel layout settings
- bounded template selection if templates become real
- bounded block/shelf ordering truth for the public route
- hero emphasis settings that belong to a channel, not just a title or global home config
- support-status discipline for design/layout settings where helpful

## 7. Exact Helper / Model Layer Needed

### 7.1 Keep Current Ownership
- `_lib/appConfig.ts` remains the owner for global theme/home defaults
- `app/profile/[userId].tsx` remains the public presentation owner
- `app/channel-settings.tsx` remains the creator control owner

### 7.2 Likely Next Helper / Model Need
The next narrow implementation lanes in this chapter, if justified by audit truth, should stay within:
- creator/channel presentation fields on the current profile/channel model
- a narrow channel-layout helper or normalized profile-design helper only if needed
- existing route owners before inventing a new freeform builder subsystem

Do not create a generic page-builder abstraction unless the product truth truly requires it.

## 8. Exact Phased Implementation Order

1. Channel design / layout doctrine-spec pass.
2. Current design/layout truth audit.
3. Minimum design/layout foundation and adoption only if current truth supports a narrow structured slice.
4. Chapter closeout audit.
5. One final narrow design/layout batch only if clearly justified.
6. Chapter closeout / next chapter handoff.

## 9. What Not To Do
- do not create `/studio/design` or `/studio/layout`
- do not build a freeform block builder
- do not fake per-channel themes when only global theme truth exists
- do not collapse content programming truth into arbitrary layout truth
- do not let `/profile/[userId]` drift from its canonical public-route role
- do not invent drag-and-drop layout persistence without backed data ownership
- do not treat title metadata alone as a complete channel design system

## 10. Current Doctrine Vs Later-Phase Ideas

### 10.1 Current Doctrine
Current doctrine supports:
- global app theme and home layout defaults
- public profile/channel hero and section structure
- title-driven hero/featured/trending/top-row programming emphasis
- creator-side ownership of future design/layout controls on `/channel-settings`

### 10.2 Later-Phase Ideas
Later only, unless explicitly backed by future chapter work:
- per-channel theme presets
- bounded layout templates
- per-channel block ordering
- creator-controlled hero layouts
- richer branded shelves
- advanced layout experimentation or recommendation
