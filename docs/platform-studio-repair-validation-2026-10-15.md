# Platform Studio repair and validation

Audit baseline: `423b10f12ae2a3b6c42c1587210fadaea5418b18`.

## Scope and behavior

All nine tabs remain available: Home, Content, Clip, Live, Audience, Moderation,
Insights, Monetization and Brand. The existing skyline, palette, backgrounds,
gradients, native controls and access gates are retained. The header is compact
away from Home; tabs expose selected accessibility state. Contextual actions,
filters, empty/error states and save feedback are more explicit.

- **Home:** Upload/Create Clip opens Clip Studio. Drafts, Published and Circle
  shortcuts use their actual filters. Requests and blocks open the corresponding
  Audience list. Source failures produce attention items instead of an all-clear
  state. Loaded-page counts do not claim a complete empty library; unknown
  requests and blocked-account counts remain unavailable. Latest content and
  Live schedule/reminder summaries expose failed reads and real retry recovery.
- **Content:** visibility and sort are queried across the creator's video
  library, with debounced server search and explicit paging. Pagination tracks
  consumed server rows independently from an out-of-page saved/pinned video.
  Late query responses cannot replace newer queries. Mutations invalidate the
  filtered query as well as refreshing the canonical list. Paid/attention filters can
  filter loaded pages and keep Load More visible on a filtered-empty page.
  Replay/event searches concern their loaded collections. Failures keep a
  visible retry path and do not fabricate an empty library.
- **Clip:** opening a different saved video or starting a new clip invalidates
  previous metadata/picker completions. A failed metadata read blocks saving;
  a confirmed absent metadata row is handled separately. Save/load locks prevent
  newer edits from being replaced by a prior save. New Clip starts empty rather
  than copying the unrelated Paid Video selection.
- **Live:** Event Pass management opens the visible event editor. Schedule and
  Live safety focus their actual sections, measured relative to the outer
  scroll content. Successful event creation retains its returned ID before
  refreshing, so refresh failure followed by retry updates the same event.
  Event inputs are locked while saving. Existing sanitized room defaults are
  editable and saved with remote acknowledgement.
- **Audience:** failed reads remain distinguishable from no people. Requests
  and blocked filters are visible. Native Android request alerts have three
  buttons including a nonmutating Cancel; Block has a separate confirmation.
  A successful audience action followed by failed refresh is reported as such.
- **Moderation:** blocks go to Audience, comments hand off to each video's
  existing player panel, and Live safety opens backed room defaults. Unavailable
  counts do not claim zero.
- **Insights:** unavailable Content/Event sources are labeled unavailable and
  have retry actions. Unsupported analytics remain unavailable.
- **Monetization:** the selected paid video's editor and Save are visible,
  including targets outside the first page. Selection is independent of late
  library reloads. Saving validates the exact creator/video/access/price readback;
  missing, mismatched and failed readbacks cannot report success. All loaded
  eligible videos are selectable and more pages can be loaded. Pause Tips uses
  the existing acknowledged Tips setting. Sandbox/live-money boundaries remain.
- **Brand:** strict profile acknowledgement preserves retryable dirty identity.
  Brand loading failures require retry before editing. Rejected atomic publish
  cannot infer success from previously live assets or an asset-free draft.
  The separate backend repair supplies public snapshots and visitor presentation.

## Behavioral tests

`tests/platform-studio-ui-regression.test.mjs` executes production declarations
and production JSX, replacing named IO boundaries only. It covers out-of-order
Clip reads, failed versus missing metadata, save locks, displayed filtering and
retry, paging with an extra pinned row, same-frame paging/event actions, durable
event-create plus failed refresh, Android Cancel, root-relative focus, failed
Brand publication, and exact Paid Video readback. The Android alert probe runs
the installed React Native Alert implementation with a modeled native dialog
manager, rather than reimplementing its button-selection logic.

The full-screen mounted suite independently executes `ChannelStudioScreen`,
`CreatorVideoCard` and `CreatorContentActionSheet` with actual React hooks and
dispatches visible controls. It is complementary to the smaller failure probes,
the real helper tests and disposable PostgreSQL authority tests. It caught an
additional paid-route/initial-library race, which was fixed and rerun.
The tab-completion suite also drives actual room-default sanitization and
failed-save retry, Audience filters, Insights recovery, and acknowledged Tips
pause. Four late copy-state regressions fail against the prior candidate
`f36b28a392d112e9f18a11c7166df830fc56d3de` and pass after its correction: loaded
Published counts, unknown requests/blocks, latest-content failure/retry, and
Live schedule/reminder failure/retry.

Root account/session replacement is governed by the existing
`getAccountNavigationTreeKey(authority)` / keyed `RootNavigator` boundary in
`app/_layout.tsx`; a standalone stateful screen rerender is not equivalent to
an account change in the application.

All top-level `tests/*.test.mjs` suites are automatically included in the
existing Required Validation product job. No CI selection gate was weakened.

## Reproduction and negative controls

Run from the repository root:

```sh
node --test tests/platform-studio-ui-regression.test.mjs
node --test tests/platform-studio-helper-regression.test.mjs
node --test tests/platform-studio-mounted.test.mjs
node --test tests/platform-studio-query-refresh.test.mjs
node --test tests/platform-studio-paid-helper-mounted.test.mjs
node --test tests/platform-studio-tab-completion.test.mjs
node scripts/guard-clip-studio-policy.mjs
node scripts/guard-platform-brand-studio-policy.mjs
npx tsc --noEmit --pretty false
npx eslint app/channel-settings.tsx
git diff --check
```

Set `STUDIO_SOURCE_ROOT` to a separate checkout of the audit baseline to execute
the same behavioral assertions against the old production source. Negative
controls distinguish old wrong behavior from old missing features/declarations;
an absent new handler alone is not a proof of its successful integration. The
mounted tests additionally prove the visible path and state rerenders. One
specific old Brand failure control reports "settings published" after a rejected
publish; the repaired path retains the draft and reports failure instead.

## Proof boundaries

Native hosts, navigation transport, picker/provider/network responses and layout
measurements are controlled test boundaries. Tests prove production React
state, rendered handlers, request parameters, durable-ID handling, selected
targets and honest visible outcomes under those modeled responses. They do not
prove actual device pixels, keyboard or screen-reader ergonomics, hardware media,
live store checkout, scan-provider delivery, or a deployed migration. The SQL
tests use a disposable local database; no live database or provider is changed.

Source checks and a fresh scoped review can establish that no further defects
were found in the tested scope, not that the product is universally bug-free.
