# Chi'llywood App UI / UX Rules

Date: 2026-05-22

This document is app-wide implementation doctrine. It applies to every new or materially changed Chi'llywood route, tab, modal, sheet, panel, form, admin tool, room surface, public page, creator tool, and settings/support/legal workflow.

Feature-specific specs may add stricter rules for their own area, but they must not lower this standard.

## 1. Core Law

New UI must be modern, production-ready, touch-friendly, fast to scan, and faithful to the surface's purpose by default. The product owner should not need to ask for "modern UI" every time.

Every visible action must be honest:

- work immediately
- open the correct workflow
- be disabled with a clear exact reason
- or be hidden until it is backed

No dead buttons. No fake success. No fake proof. No raw debug panel as the main UI. No production-visible demo data.

## 2. Modern Chi'llywood Direction

Chi'llywood should feel like a premium 2026 mobile social/live streaming platform with serious production operations behind it.

Use:

- immersive streaming-platform UI
- layered visual hierarchy
- responsive grid layout
- modular layout systems
- adaptive participant grids when needed
- adaptive containers that respond to screen size, content, role, and state
- dashboard-style control grouping where management complexity requires it
- floating action surfaces instead of large boxed cards on live/social surfaces
- modern dropdown menus, action sheets, bottom sheets, side panels, drawers, and popovers
- consistent spacing rhythm
- native-feeling mobile interactions

Avoid:

- generic stacked-card layouts as the default answer
- outdated admin-panel appearance on consumer/product surfaces
- giant raw debug paragraphs
- giant boxed sections everywhere
- decorative layouts that reduce scan speed
- route drift or feature dumping into the nearest screen

## 3. Surface-Specific Visual Language

### Live, Room, Player, Chat, And Social Surfaces

These surfaces should be immersive, social-first, and media-first. The primary visual layer is the room, people, playback, conversation, presence, and current activity.

Required default patterns:

- top area for identity and status
- middle area for the primary experience
- bottom area for fast controls
- More sheet or action sheet for secondary actions
- grids for people and content collections
- rails and shelves for browsing/discovery
- floating or docked controls for frequent actions
- panels for chat, participants, queue, settings, and moderation only when needed

Rooms should not feel like forms, dashboards, or stacked cards. Use adaptive participant grids, spotlight/focus layouts, participant rails, and layered controls according to room state.

### Creator, Profile, Channel, Home, And Discovery Surfaces

These surfaces should feel like a premium social streaming product. They should use media-forward layouts, shelves, rails, grids, clean empty states, and clear public/owner distinctions.

Do not fake counts, creator content, social activity, search results, engagement, followers, Premium access, or monetization state. Do not show owner-only controls to public viewers.

### Owner, Admin, Legal, DMCA, Moderation, Security, And Operations Surfaces

These surfaces should feel like a compact command center: calm, dense, professional, and trustworthy.

Use:

- clear title and short subtitle
- compact summary cards
- search and filters that actually work
- compact request/case/evidence rows or cards
- detail screens or modals for full records
- grouped action sections
- real loading, empty, filtered-empty, error, permission-denied, success, and failed-action states
- disabled actions with exact backend/config/permission reason

Avoid:

- fake counts
- proof/demo records in production mode
- raw debug dumps as the primary UI
- duplicate top-level navigation
- copy that implies Owner normal work requires reason prompts or owner-sensitive audit rows

### Public Legal, Support, Settings, And Intake Forms

Forms must be production forms, not placeholder screens.

Use:

- one readable mobile-first column
- clear field groups
- real validation
- loading state on submit
- success receipt
- actionable failure state
- attachment state when supported
- exact disabled reason when a backend path is missing

Do not expose owner/admin tools or private fields on public forms.

## 4. Layout System Rules

Default to the layout system that matches the surface, not to a one-size-fits-all stack.

Use grids when:

- participants, rooms, content, channels, media, or repeated visual items need comparison or scanning
- a route benefits from spatial hierarchy instead of a vertical list
- tablet/desktop can show more structure without harming mobile

Use modular dashboards when:

- the user is managing multiple live signals, legal records, operations, evidence, moderation, payout, security, or system state
- grouped controls reduce cognitive load
- summary plus detail improves decision speed

Use responsive panels when:

- chat, participants, settings, queues, history, evidence, or secondary controls need depth
- mobile should use a bottom sheet or full-height sheet
- tablet/desktop should use a side panel or split layout

Use floating action surfaces when:

- the primary experience is media, people, live presence, playback, or social activity
- controls should be close to the action without turning the screen into a dashboard

## 5. Interaction And State Rules

Every new or changed surface must define:

- primary experience
- route owner
- top, middle, bottom, More sheet, panels, grids, rails, or dashboard zones
- signed-out state
- loading state
- empty state
- filtered-empty state when filters/search exist
- permission-denied state
- unsupported/missing-backend state
- action-in-progress state
- action-success state
- action-failure state
- mobile keyboard and safe-area behavior when inputs exist

Client hiding is never the security boundary for sensitive actions. Owner/admin/legal/moderation/billing/private workflows require server-side or backed permission checks.

## 6. Visual Polish Rules

Modern polish comes from hierarchy, rhythm, and honesty, not decoration.

Use:

- consistent spacing
- aligned labels and values
- readable typography
- status chips and badges
- subtle borders
- restrained shadows
- icon buttons for common tool actions
- tooltips or labels for unfamiliar icons
- stable dimensions for toolbars, grids, counters, tiles, and repeated controls
- responsive constraints so dynamic content does not shift or overlap the layout

Avoid:

- text that overlaps, clips, or spills outside controls
- viewport-width font scaling
- negative letter spacing
- card-inside-card layouts
- page sections styled as decorative floating cards
- one-note color palettes
- dominant purple/blue gradients, beige/sand, dark slate, brown/orange, or other single-family themes unless a feature-specific approved design requires them
- decorative gradient blobs, orbs, or bokeh backgrounds

Cards should be used intentionally for repeated items, modals, detail panels, or framed tools. They should not be the default structure for every section.

## 7. Proof Standard

A route or surface is not production-complete until proof shows:

- no dead visible buttons
- no fake data or fake green status
- no raw debug UI
- no clipped or overlapping text
- no controls hidden behind Android navigation, safe areas, keyboard, player controls, or composers
- no role leakage between viewer, creator, owner, admin, moderator, or signed-out states
- no route drift
- no weakened Premium, privacy, owner, admin, legal, or security gates

For mobile-facing work, physical Android proof or release-like screenshots should show the real UI state whenever the change is more than copy/docs.
