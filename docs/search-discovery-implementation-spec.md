# Chi'llywood Search / Discovery / Recommendation Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's search / discovery / recommendation chapter.

It is implementation doctrine, not UI code.

It exists to:
- preserve current route truth while Chi'llywood deepens discovery
- define MVP discovery only
- separate current public discovery truth from missing or later recommendation systems
- define how discovery truth should relate to Home, creator-owned public profile/channel discovery, title/player, and public live/event surfaces
- define the phased implementation order for this chapter

This spec does not:
- change route truth
- create a fake recommendation engine
- invent advanced personalization
- add schema directly
- create separate discovery-route sprawl beyond current doctrine

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/` / Home tab | `app/(tabs)/index.tsx` | Canonical current discovery/home owner. |
| `/explore` tab | `app/(tabs)/explore.tsx` | Current browse/explore surface. |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel surface and creator/channel discovery node. |
| `/title/[id]` | `app/title/[id].tsx` | Canonical title detail surface. |
| `/player/[id]` | `app/player/[id].tsx` | Canonical standalone playback surface, not the main discovery owner. |
| current live/event public surfaces | `/profile/[userId]`, current Home/live entry points | Canonical public live/event discovery surfaces until broader discovery depth is justified. |

Do not create route proliferation in this chapter.

### 2.2 Product Rules To Preserve
- Home remains the main discovery surface.
- `/profile/[userId]` remains a creator/channel discovery surface, not a generic creator marketplace.
- Title and player surfaces remain canonical consumption routes, not new discovery hubs.
- Public live/event discovery must stay honest to the live/event model already landed.
- Discovery must stay MVP-first and curated before it becomes algorithmic.
- Advanced personalization remains later unless current truth explicitly supports more.

### 2.3 Current Discovery Boundary
Current doctrine is intentionally narrow:
- curated discovery is real
- hero/rail ordering is real
- public creator/channel discovery is real
- public live/event discovery is real where backed
- recommendation systems are not yet real

That means:
- do not imply personalized ranking
- do not imply collaborative filtering
- do not imply full-text/global search unless a real search owner exists
- do not present static or local fallback content as if it were a recommendation engine

## 3. Exact Discovery Buckets And Meanings

### 3.1 Home Discovery
Home discovery means curated global entry into titles, progress, favorites, and public live signals.

Examples:
- hero spotlight
- top picks
- browse rail
- continue watching
- favorites

Current doctrine:
- backed and current

### 3.2 Creator / Channel Discovery
Creator/channel discovery means finding people, identities, and public channel surfaces through existing public routes.

Examples:
- public profile/channel spotlight
- creator/channel home emphasis
- channel live state
- creator event presence

Current doctrine:
- backed in public profile/channel surfaces
- not yet a broad marketplace or ranking engine

### 3.3 Content Discovery
Content discovery means title and programming visibility across platform surfaces such as Home, Explore, dedicated Chi'llywood Originals surfaces, and title entry points.

Examples:
- featured titles
- hero titles
- trending/top-row emphasis
- public programming groupings
- replay-ready content hints when real

Current doctrine:
- partly backed
- curated emphasis is real
- creator-facing performance or recommendation ranking is not
- user/creator Channels are not platform title shelves and must not use Chi'llywood Originals as filler; Profile/Channel discovery for creators is creator-owned videos, creator events, live/watch-party context, and backed creator shelves only

### 3.4 Live / Event Discovery
Live discovery means finding live-now, upcoming, and replay-ready public event truth.

Examples:
- live now
- upcoming events
- replay available
- reminder-ready public event visibility

Current doctrine:
- public event truth is real
- discovery can expose those states honestly
- deeper ranking/personalization is not yet real

### 3.5 Recommendation
Recommendation means ranked, personalized, or inferred discovery.

Examples:
- “recommended for you”
- personalization by behavior or cohort
- collaborative filtering
- conversion-aware ranking

Current doctrine:
- later unless explicitly backed

## 4. Exact Surfaces Where Discovery Truth Must Apply Now

### 4.1 Home
Home must remain the primary discovery owner for:
- curated hero
- curated rails
- continue watching
- favorites
- public live/title handoff

### 4.2 Public Profile / Channel
`/profile/[userId]` may expose discovery truth through:
- creator/channel spotlight
- content preview
- live preview
- public community/about framing

It must not become:
- a general search hub
- a recommendation dashboard

### 4.3 Title / Player
Title/player surfaces may support discovery by:
- clean title resolution
- honest related live/watch-party handoff
- honest access and replay context

They must not become broad discovery owners.

### 4.4 Explore
Explore may remain a lightweight browse surface while discovery deepens.

If Explore grows:
- it should stay curated/MVP-first
- it must not overclaim search sophistication

## 5. Current Source-Of-Truth Already In Repo

### 5.1 Home Discovery Truth
Current Home discovery truth already exists in:
- `app/(tabs)/index.tsx`
- `_lib/appConfig.ts`

Current backed Home discovery inputs include:
- `home.heroMode`
- `home.manualHeroTitleId`
- `home.railOrder`
- `home.enabledRails`
- `home.topPicksSource`
- `home.browseCategoryLabel`
- `home.browseCategoryQuery`

### 5.2 Public Creator / Channel Discovery Truth
Current creator/channel discovery truth already exists in:
- `app/profile/[userId].tsx`
- `_lib/userData.ts`

Current backed inputs include:
- public identity/channel presentation
- hero-programming selection
- featured/trending/top-row programming groupings
- public live/event presence
- public-safe audience visibility cues

### 5.3 Content Programming Discovery Truth
Current content discovery inputs already exist in:
- `titles`
- title programming flags such as `featured`, `is_hero`, `is_trending`, `pin_to_top_row`, and `sort_order`
- title surfaces and public programming consumers

### 5.4 Live / Event Discovery Truth
Current live/event discovery truth already exists in:
- `creator_events`
- `_lib/liveEvents.ts`
- public event surfaces on `/profile/[userId]`
- Home/live entry points where current truth already points into live/party routes

### 5.5 Explore Truth
Current Explore truth exists in:
- `app/(tabs)/explore.tsx`

It is currently a lightweight browse surface, not a full discovery engine.

## 6. Missing Truth That Still Needs To Be Built
- broader creator discovery curation
- live-now global discovery blocks if not already surfaced
- replay-specific discovery emphasis
- premium/restricted discovery posture where honest
- global search truth if later justified
- recommendation ranking or personalization infrastructure

## 7. Exact Helper / Model Layer Needed

### 7.1 Keep Current Ownership
- `_lib/appConfig.ts` remains the current owner for global Home discovery config
- profile/public route owners remain public discovery owners for creator/channel discovery
- live/event helpers remain the source of public live-event truth

### 7.2 Likely Next Discovery Layer
The next narrow implementation lanes in this chapter, if justified by audit truth, should stay within:
- current Home owner
- current public profile/channel owner
- current live/event public read helpers

Do not invent a broad recommendation helper layer unless real backing truth exists.

## 8. Exact Phased Implementation Order

1. Search / discovery / recommendation doctrine-spec pass.
2. Current discovery truth audit.
3. Minimum discovery implementation only if current truth supports a narrow MVP slice.
4. Chapter closeout audit.
5. One final narrow discovery batch only if clearly justified.
6. Chapter closeout / next chapter handoff.

## 9. What Not To Do
- do not fake recommendations
- do not fake search sophistication
- do not invent personalization
- do not create route drift
- do not build a discovery surface that ignores access/live/channel doctrine
- do not blur `Watch-Party Live`, `Live Watch-Party`, and `Live First`

## 10. Current Doctrine Vs Later-Phase Ideas

### 10.1 Current Doctrine
Current doctrine supports:
- curated Home discovery
- public creator/channel discovery through `/profile/[userId]`
- title/programming discovery through current title flags
- public live-event discovery where backed

### 10.2 Later-Phase Ideas
Later only, unless explicitly backed by future work:
- personalized recommendations
- broad search index/ranking
- advanced cohort or behavior ranking
- recommendation-based conversion optimization
- broader creator marketplace discovery
