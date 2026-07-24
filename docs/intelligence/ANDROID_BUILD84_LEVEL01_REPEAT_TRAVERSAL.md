# Android Build 84 Level 0/1 Repeat Traversal

Status: bounded installed-product evidence collected; remote persistence waits
for a reviewed, isolated sentinel runtime.

Evidence was collected on 2026-07-24 from Play-internal Android build
`1.0.0 (84)`, whose reviewed source is
`1335dc18669d8917bb72c14393bf464d98ce902f`. The package identity is retained
only as a SHA-256 hash. No device identifier, account credential, access token,
raw screenshot, accessibility dump, or raw application log is stored here.

The owner-only sanitized evidence file remains outside Git with SHA-256:

`f7cf764c8d7e5b81189f48f2a097189f417113b56179c8a324380d26b83e8a1e`

## Repeat traversal

Two installed traversals produced 16 separate cold/warm route observations
under a 15-second bound. Network validation passed before each traversal.

| Route | Maximum observed resolution | Classification |
| --- | ---: | --- |
| Home | 9,169 ms | resolved empty or partial synthetic dataset |
| Explore | 4,976 ms | resolved empty or partial synthetic dataset |
| Library | 4,754 ms | resolved empty or partial synthetic dataset |
| Live | 3,597 ms | resolved empty or partial synthetic dataset |

Every observation became interactive and reached a bounded content/empty state.
No error or timeout state was observed. The installed build does not expose
request- or provider-level timing, so this evidence cannot attribute the
observed time to an API, database, or provider. The earlier ten-second
observations are classified as non-reproduced bounded observations, not
confirmed endless-loading defects.

## Search

The Search route exposed a native editable input that was focusable, clickable,
and accessibility-labelled. A non-private synthetic query was accepted, an
empty result state rendered, clear succeeded, and keyboard dismissal was
requested successfully.

Classification:
`interactive_accessible_search_confirmed`

The earlier missing-interactive-node observation is classified as an
observer/automation false positive for this build and run. It is not a product
finding.

## Android touch target

The device density was 420 dpi. Forty-one clickable nodes were measured. The
minimum actual clickable target was the Home main-tab action:

- 270 by 61 physical pixels;
- approximately 102.86 by 23.24 dp;
- accessibility-labelled and actually interactive;
- no larger clickable ancestor detected.

Android's reviewed recommendation is 48 dp by 48 dp. The measured height is
materially below that threshold.

Classification:
`confirmed_android_touch_target_below_48dp`

This is platform-correct Android evidence; it does not apply an iOS point
threshold to Android pixels.

## Stability

The bounded traversals observed zero fatal exceptions and zero ANRs. This means
only that none were observed in these runs; it is not a universal crash-free
claim.

## Persistence

The touch-target observation is eligible for independent evaluation and
deterministic triage after the reviewed collector/triage runtime is isolated
and deployed. The resolved routes and accessible Search result must be stored
as passing/non-finding runs, not converted into defects.
