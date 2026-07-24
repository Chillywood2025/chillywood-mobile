# Product Experience Constitution

Status: Owner selected Option C (`creator_balanced`); authenticated baseline
approval is not yet recorded.

Source:

`config/intelligence/product-experience-constitution.json`

The constitution is intentionally marked:

- `status`: `owner_selected_pending_authenticated_approval`
- `selectedBaselineHash`:
  `34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba`
- `ownerApprovalVersion`: `null`
- `approvedBaselineHash`: `null`

The immutable source selection is:

`config/intelligence/chillywood-product-experience-baseline-v1.json`

It records the exact Option C metrics, seven surface families, route/component
mappings, explicit exceptions, platform-specific accessibility units, and the
amendment rule. Options A and B remain in the historical alternatives
manifest. The prompt records Owner intent but is not a database signature.
`ownerApprovalVersion` and `approvedBaselineHash` stay null until the real
authenticated Owner → worker → independent evaluator chain succeeds.

This prevents the system from treating selection intent as a live approved
baseline. Until that chain succeeds, comparison can be exercised but cannot
produce an approved-baseline pass or a baseline-deviation finding.

The constitution includes:

- mobile-first principles;
- streaming-content density expectations;
- route completion expectations;
- loading-state deadlines;
- empty/error/offline expectations;
- Option C media-frame, total-container, viewport, density, spacing, creator,
  and Live-state metrics;
- explicit `standard_streaming_card`, `live_streaming_card`,
  `creator_streaming_card`, `featured_hero_card`, `vertical_post_card`,
  `compact_media_list_item`, and `non_media_interactive_surface` families;
- typography and Dynamic Type constraints;
- compact/medium/expanded responsive behavior;
- Android 48dp, iOS 44pt, and web CSS-pixel/WCAG target rules without unit
  mixing;
- screenshot provenance requirements;
- explicit no-production-mutation authority.

Installed sentinel runner configuration:

`config/intelligence/sentinel-installed-runner.config.json`

The installed runner configuration preserves the same authority boundary:
read-only inventory, sanitized evidence hashes, bounded metrics, no raw private
evidence, no release mutation, and fail-closed `NEW_BINARY_OR_OTA_REQUIRED`
when installed telemetry is unavailable.
