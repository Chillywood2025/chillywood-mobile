# Algorithm Foundation V1 Closeout

Date: June 20, 2026

## Status

Algorithm Foundation V1 is closed as a production-safe foundation. It is a free, rules-based, explainable ranking layer for dry-run/readback only.

It is not production-wired. `algorithmRankingV1Enabled` remains `false`, and production Home, Live, Search, Creator Platform, Premium, creator monetization, Watch-Party, LiveKit, and Chi'lly Chat behavior remains unchanged.

## Closed Scope

- Deterministic scoring functions exist in `_lib/algorithmRanking.ts`.
- Ranking returns `finalScore`, `componentScores`, `penalties`, `explanation`, `version`, `excluded`, and `exclusionReason`.
- Static weights are bounded and fail safe to defaults.
- Optional Remote Config helpers read bounded values and fail safe to defaults.
- Draft, private, hidden, deleted, removed, unpublished, locked-without-access, and subscriber-only-without-access content is excluded when access is missing.
- Reported or under-review content is penalized.
- Search relevance produces explicit search-match explanation.
- Paid offers are scoped; ranking does not unlock paid content or bypass paid gates.
- Dry-run uses fixed public-safe fixtures, mutates no production data, and prints no private viewer data.
- Guard `npm run guard:algorithm-ranking-v1` protects default-off status, no external recommendation vendor dependency, and no Home/Live/Public Platform production feed wiring.

## Not In Scope

- No production feed replacement.
- No Home feed ordering change.
- No Live feed ordering change.
- No Search production ordering change.
- No Creator Platform production ordering change.
- No Premium gate change.
- No creator monetization access change.
- No paid recommendation vendor, external ML service, or vector database.
- No migration.
- No private viewer-data logging.

## How To Prove

Run:

```sh
npm run guard:algorithm-ranking-v1
node scripts/qa/algorithm-ranking-dry-run.mjs
```

Expected dry-run safety flags:

- `dryRunOnly: true`
- `mutatedProductionData: false`
- `usedPrivateViewerData: false`

The dry-run writes `artifacts/algorithm-ranking-dry-run.json`. For proof lanes, copy the generated JSON into the `/tmp` proof folder and avoid committing timestamp-only drift unless explicitly requested.

## Future Production Integration Requirements

Do not implement production feed integration without a separate scoped prompt and proof lane.

Future integration must include:

- feature flag remains default-off before rollout
- staged rollout plan
- rollback switch
- before/after ranking screenshots or logs
- privacy review
- RLS/server readback review
- no paid content gate bypass
- no private viewer-data logging
- no external paid recommendation/ML/vector vendor unless separately approved
- installed-device proof
- BrowserStack/App Live proof if used later
- explicit confirmation that Home, Live, Search, Platform, Premium, creator monetization, Watch-Party, LiveKit, and Chi'lly Chat behavior remains correct

## Do Not Reopen

Do not reopen Algorithm Foundation V1 as a production feed replacement task. It is closed as foundation-only. Future work is production integration planning and proof, not foundation rework, unless a real regression appears.
