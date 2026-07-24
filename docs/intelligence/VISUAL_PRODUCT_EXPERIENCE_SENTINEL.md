# Visual Product Experience Sentinel

Status: protected Level 0/1 source surface registered; Owner-selected Option C
is source-bound and authenticated database approval is still pending.

Registered switch:

`cognitive_visual_experience_sentinel_enabled`

Registered service identity:

`visual_product_experience_sentinel`

The sentinel measures layout quality instead of relying on model opinion. Metrics
include:

- surface-family mapping;
- media-frame width and height separately from the total card container;
- card width and height divided by viewport width and height;
- cards visible above the fold;
- horizontal cards visible;
- aspect ratio;
- row and column spacing;
- title and metadata line counts;
- creator identity and Live-state visibility;
- clipping/overflow;
- platform-qualified interactive target width and height;
- route consistency;
- phone/tablet and portrait/landscape behavior.

The selected baseline hash is
`34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba`.
The source record remains
`owner_selected_pending_authenticated_approval`, so the sentinel must classify
comparison as baseline ambiguity until the authenticated approval version
exists. The sentinel cannot autonomously redesign the app.

Persisted visual evidence must include a screenshot evidence hash, bounded
media/container/viewport/density metrics, a surface family, an accepted
aspect-ratio class, a baseline comparison hash, an explicit baseline state, and
an exact platform unit. Android uses dp and 48dp, iOS uses pt and 44pt, and web
uses CSS pixels with the preferred 44px product target plus applicable WCAG
2.2 AA rules. A visual pass requires an approved baseline.

Runnable canary:

`npm run sentinel:canary:visual -- --evidence <sanitized-evidence.json>`

The evidence file must include sanitized screenshot/runtime hashes and measured
layout metrics from an installed device or simulator. Raw screenshots are not
committed. Because the constitution is
`owner_selected_pending_authenticated_approval`, the visual canary must not
claim an approved visual pass or a confirmed baseline deviation until the real
Owner → worker → evaluator approval exists.
