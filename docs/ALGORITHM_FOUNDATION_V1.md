# Algorithm Foundation V1

Date: June 18, 2026

## Doctrine

Algorithm Foundation V1 is a free, rules-based ranking foundation. It is not ML, not a black-box recommender, and not connected to a paid recommendation vendor. The source of truth is explicit code-owned scoring weights, eligibility rules, penalties, and score explanations in `_lib/algorithmRanking.ts`.

No paid recommendation vendor, vector database, external ML dependency, or hosted personalization service is part of V1. V1 must remain explainable and tunable: every score returns `finalScore`, `componentScores`, `penalties`, `explanation`, and `version`.

V1 is active for public discovery ordering on Home and Explore through `_lib/discoveryFeed.ts`. It remains deterministic and rules-based: public discovery rows are first constrained by RLS/query eligibility, then ranked with live, followed creator, Chi'lly Circle, upload recency, upcoming event, replay-ready, category, editorial/manual score, and freshness signals. `algorithmRankingV1Enabled` defaults to `true`; emergency fallback must be incident-only and must not become a normal disabled-by-default rollout flag.

Admin should eventually be able to inspect why an item ranked: the current explanation array is the first readback contract for that future admin/debug surface.

## Separate Ranking Surfaces

V1 keeps surfaces separate instead of creating one global feed score:

- Home video ranking: `scoreVideoForHome`
- Creator Platform ranking: `scoreCreatorPlatform`
- Live/Watch-Party discovery ranking: `scoreLiveDiscoveryItem`
- Search ranking: `scoreSearchResult`
- Similar content ranking: planned as a separate V1 follow-up, not production-wired
- Paid creator offer ranking: `scorePaidCreatorOffer`
- Safety/trust scoring: represented through `safetyScore`, `creatorTrustScore`, exclusions, and penalties

## Scoring Components

Default component model:

- `freshnessScore`
- `engagementScore`
- `completionScore`
- `creatorTrustScore`
- `safetyScore`
- `liveActivityBoost`
- `personalizationPlaceholder`
- `newCreatorBoost`
- `searchRelevanceScore`

Default penalties:

- `alreadySeenPenalty`
- `reportPenalty`
- `spamPenalty`
- `diversityPenalty`
- `accessPenalty`
- `exclusionPenalty`

Default weights:

- `freshnessWeight`: `0.16`
- `engagementWeight`: `0.20`
- `completionWeight`: `0.14`
- `creatorTrustWeight`: `0.14`
- `liveBoostWeight`: `0.12`
- `safetyPenaltyWeight`: `1.00`
- `alreadySeenPenaltyWeight`: `0.20`
- `reportPenaltyWeight`: `0.38`
- `spamPenaltyWeight`: `0.28`
- `newCreatorBoostWeight`: `0.08`
- `diversityPenaltyWeight`: `0.20`
- `personalizationPlaceholderWeight`: `0.00`

Weights are typed, bounded to `0..1`, and fail safe to static defaults. Firebase Remote Config keys exist as optional future overrides, but missing or bad config does not crash and does not replace production feeds.

## Safety And Fairness Rules

Enforced in V1 scoring:

- Draft, private, hidden, deleted, removed, unpublished, locked-without-access, and subscriber-only-without-access content is excluded from public ranking.
- Banned, blocked, hidden, removed, takedown, and active takedown content is excluded.
- Reported, under-review, or pending-review content is strongly penalized and must not rank above comparable safe content.
- Paid content can be ranked only in scoped contexts and receives a small scope penalty outside paid-offer ranking.
- New or small creators receive a bounded discovery boost.
- Repeated content from the same creator is capped through `diversityPenalty`.
- Already watched content drops outside explicit Continue Watching behavior.
- Repeat/spam-like content is penalized when repeat signals are available.
- Raw private viewer data must not be logged or printed; dry-run fixtures use public-safe mock ids only.

Blocked creator/user exclusion should be applied by the read layer where relationship data exists, before scoring or by passing access-denied flags into scoring.

## Dry-Run

Dry-run script:

```sh
node scripts/qa/algorithm-ranking-dry-run.mjs
```

The script uses fixed safe fixtures, computes ranked readback, prints item id/score/explanation, writes `artifacts/algorithm-ranking-dry-run.json`, does not require service-role, does not mutate production data, and does not print private user information.

## Data Status

V1 intentionally uses existing signals where available:

- videos / creator videos
- discovery feed items
- likes/favorites/shares/comments where backed
- reports and moderation status
- watch progress/completion where already tracked
- creator/profile data
- event/live status where already tracked
- creator monetization offer scope where already backed

No migration is required for this foundation pass. Future tables may be useful only after readback requirements are proved:

- `content_ranking_events`
- `content_ranking_scores`
- `creator_trust_scores`

Those future tables must not weaken RLS and must not expose private viewer data.

## Production Behavior

Home and Explore use ranked public discovery rows now. Public discovery remains limited to public, clean, rights-safe content; Circle-private and draft creator videos are not inserted into public discovery rows. V1 dry-run/readback remains useful for static score inspection, but it is no longer the only algorithm behavior.

## Closeout Status

Algorithm Foundation V1 is closed as an active production-safe deterministic discovery lane when the guard and typecheck pass. `algorithmRankingV1Enabled` defaults to `true`; `algorithmRankingV1EmergencyFallbackEnabled` is reserved for incident fallback only.

The seven-flow app-side money proof is closed separately. Algorithm V1 does not reopen money proof, does not unlock paid content, and does not change Premium, creator monetization, LiveKit, Watch-Party, Chi'lly Chat, or RLS.

Future production expansion beyond public Home/Explore discovery requires a separate proof lane with privacy review, server/RLS readback review, no paid content gate bypass, no private viewer-data logging, before/after ranking evidence, installed-device proof, and BrowserStack/App Live proof if used.
