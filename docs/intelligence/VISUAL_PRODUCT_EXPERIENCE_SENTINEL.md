# Visual Product Experience Sentinel

Status: protected Level 0/1 source surface registered; approved product baseline
still pending.

Registered switch:

`cognitive_visual_experience_sentinel_enabled`

Registered service identity:

`visual_product_experience_sentinel`

The sentinel measures layout quality instead of relying on model opinion. Metrics
include:

- card width divided by viewport width;
- card height divided by viewport height;
- cards visible above the fold;
- aspect ratio;
- spacing;
- title-line count;
- clipping/overflow;
- touch-target size;
- route consistency;
- phone/tablet and portrait/landscape behavior.

Before Owner baseline approval, visual outliers can be classified as
`design_baseline_missing` or as evidence-based defects. The sentinel cannot
autonomously redesign the app.
