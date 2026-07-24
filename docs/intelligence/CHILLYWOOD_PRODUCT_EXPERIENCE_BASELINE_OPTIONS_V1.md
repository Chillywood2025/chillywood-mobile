# Chi'llywood Product-Experience Baseline Options V1

Status: historical alternatives preserved. The Owner selected Option C
(`creator_balanced`) on 2026-07-24. The immutable source selection record is
`config/intelligence/chillywood-product-experience-baseline-v1.json`; its
authenticated Owner → worker → evaluator database approval remains pending.
These options are measurement baselines only. They do not authorize a
production UI change, deployment, release, or automatic repair.

Canonical options manifest:
`config/intelligence/product-experience-baseline-options-v1.json`

Manifest SHA-256:
`7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df`

Canonical selection hashes bind the manifest schema/version, scope, common
requirements, and exactly one selected option after recursively sorting JSON
object keys and encoding the result as compact UTF-8 JSON:

- A: `29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9`
- B: `9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5`
- C: `0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184`

## First-party guidance used

- Apple recommends a button hit region of at least 44 by 44 points, preserving
  image aspect ratios, adapting layouts to text-size and display changes, and
  testing multiple devices, orientations, localizations, and Dynamic Type sizes.
- Android recommends at least 48 by 48 dp for interactive targets and adaptive
  layouts driven by the available window rather than device-name assumptions.
  The compact, medium, and expanded width boundaries begin at 600 and 840 dp.
- WCAG 2.2 AA target-size guidance uses 24 by 24 CSS px with defined exceptions;
  its enhanced guidance uses 44 by 44 CSS px. Chi'llywood's options adopt 44 CSS
  px as the preferred web product target while retaining the exact WCAG AA
  classification rules.
- React Native exposes platform accessibility semantics and font scaling, but a
  native element being touchable does not by itself prove correct screen-reader
  focus, name, role, value, layout, or scaling.

Primary sources:

- <https://developer.apple.com/design/human-interface-guidelines/buttons>
- <https://developer.apple.com/design/human-interface-guidelines/layout>
- <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- <https://developer.android.com/guide/topics/ui/accessibility/views/apps-views>
- <https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes>
- <https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout>
- <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum>
- <https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced>
- <https://reactnative.dev/docs/accessibility>
- <https://reactnative.dev/docs/text>

## Common invariant

All three options require:

- Android interactive targets of at least 48 dp by 48 dp and iOS interactive
  targets of at least 44 pt by 44 pt;
- 44 CSS px preferred web product targets, with WCAG 2.2 AA's exact 24 CSS px
  minimum and exceptions classified separately;
- media displayed without aspect-ratio distortion;
- title and metadata limits of two lines each, without clipping at supported
  text sizes;
- Dynamic Type/font scaling, meaningful screen-reader name/role/value, visual
  and accessibility focus-order agreement, and non-color-only state cues;
- explicit loading, empty, error, offline, and permission states;
- portrait, landscape, split-window, phone, and tablet evidence;
- creator identity and live-state indicators that do not shrink the interactive
  card target.

Reference mock metrics use a 390 by 844 logical-unit phone viewport and a 1024 by
1366 logical-unit tablet viewport. They are bounded examples, not screenshots of
the production UI.

## A — Dense discovery

| Metric | Phone | Tablet |
| --- | ---: | ---: |
| Card media | 173 x 97, 16:9 | 228 x 128, 16:9 |
| Columns | 2 | 4 |
| Outer margin | 16 | 32 |
| Column / row gap | 12 / 16 | 16 / 20 |
| Expected cards above fold | 4–6 | 8–12 |

The phone uses a two-column grid and the tablet uses four columns. Featured
content may span the row but may not displace more than one discovery row.
Creator avatar and name remain visible in one compact metadata row; the Live
badge and viewer state remain visible at the media edge.

Expected impact: fastest browsing and comparison.

Tradeoff: the least room for artwork, creator storytelling, and featured-event
emphasis.

## B — Cinematic

| Metric | Phone | Tablet |
| --- | ---: | ---: |
| Card media | 358 x 201, 16:9 | 460 x 259, 16:9 |
| Columns | 1 | 2 |
| Outer margin | 16 | 40 |
| Column / row gap | 0 / 24 | 24 / 28 |
| Expected cards above fold | 1–2 | 2–4 |

The phone uses a single-column stream and the tablet uses two columns. One
optional featured hero may use a 2:1 crop only when the asset has a protected
focal region. Creator identity receives a dedicated metadata band; Live state
adds an elapsed or scheduled state beside it.

Expected impact: strongest artwork and featured-event storytelling.

Tradeoff: lowest browsing density and the most scrolling before comparison.

## C — Creator-balanced

| Metric | Phone | Tablet |
| --- | ---: | ---: |
| Card media | 252 x 142, 16:9 | 307 x 173, 16:9 |
| Row/grid | 1.42 peekable cards | 3 columns |
| Outer margin | 16 | 32 |
| Column / row gap | 12 / 20 | 20 / 24 |
| Expected cards above fold | 3–4 | 6–9 |

Compact phones use peekable horizontal rows; tablets use a three-column grid.
Creator avatar and name are first-class, and a compact secondary line may show
category or recency. Live badge, viewer state, and creator identity remain
visible without reducing the card's interactive target.

Expected impact: streaming-style density with creator and Live identity kept
prominent.

Tradeoff: more responsive layout rules than A or B, with less artwork emphasis
than B.

## Orientation and resizing

- A adds columns when the available window crosses 600 and 840 logical units.
- B uses two columns in landscape only when compact height still leaves the
  primary action and metadata visible.
- C uses two balanced columns in compact landscape and three or four columns in
  medium/expanded windows.
- No option locks orientation or treats a physical tablet name as a breakpoint.
- No option stretches media to fill an incompatible container.

## Exact authenticated approval request

Record exactly Option `C` (`creator_balanced`) for
`chillywood-product-experience-baseline-v1`; Options A and B remain historical
alternatives and are not selected.

The approval must name manifest SHA-256
`7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df`
and canonical selection hash
`0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184`.
The selected Option C hash, not the three-option manifest hash, is the
immutable `baseline_hash`.

Approval scope:

- bind future Android, iOS, and responsive visual sentinel findings to the
  selected option;
- store a new immutable approved-baseline version and content hash;
- permit measurement and governed finding creation only.

Approval does not authorize UI modification, source execution, draft fixes,
deployment, release, spending, provider-product changes, auth/RLS changes, role
changes, or merge.

Default approval duration is 24 hours. Any later baseline amendment creates a
new version; it does not rewrite V1.
