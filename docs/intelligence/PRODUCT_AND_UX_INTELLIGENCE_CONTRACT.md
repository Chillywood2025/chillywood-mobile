# Product and UX Intelligence Contract

Status: `SECURITY_HARDENING_IN_PROGRESS`

Analysis may cover routes, role/state matrices, loading states, empty states, error states, offline behavior, permissions, notifications, calls, purchases, funnels, accessibility, and duplicate or unreachable controls across iOS, Android, web, and shared backend state.

The system may propose UX improvements, route fixes, copy changes, backend simplifications, performance work, architecture improvements, and bounded experiments. Every proposal must identify affected platforms, user roles/states, data, tests, release impact, and rollback scope.

The Level 0/1 sentinel surfaces are `livekit_experience_sentinel`,
`visual_product_experience_sentinel`, and `installed_journey_sentinel`. They must
derive findings from bounded evidence such as timings, screenshots, route states,
provider/backend state hashes, and metric manifests. They may report
`needs_product_baseline_review` before an Owner-approved visual baseline exists.

It may not autonomously change prices, money, Premium rights, moderation outcomes, ranking/public exposure, auth/RLS, production feature flags, store releases, or provider products. Source-ready is not physical proof, provider proof, or production success.
