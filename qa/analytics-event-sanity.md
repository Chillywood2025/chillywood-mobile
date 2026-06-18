# Analytics Event Sanity

This document defines expected categories only. Do not add new analytics wiring in this QA lane unless a safe existing analytics helper already supports it.

## Expected Event Categories

- `app_open`
- `login_success`
- `login_failure`
- `premium_screen_view`
- `platform_view`
- `player_view`
- `money_offer_view`
- `sandbox_purchase_started`
- `sandbox_purchase_completed`
- `report_submitted`
- `visibility_changed`

## E2E Traffic

If analytics exclusion is available, all `@chillywood.test` BrowserStack/E2E accounts should be excluded from real launch dashboards, growth metrics, ranking proof, payout proof, and creator credibility claims.

If exclusion is not available, proof summaries must label the data as synthetic and avoid using it as production traction.

## Must Not Happen

- Do not log passwords, service-role keys, access tokens, provider secrets, or private viewer data.
- Do not treat synthetic follows, subscriptions, VIP, comments, likes, or views as real public traction.
- Do not mark purchase completion unless a real sandbox provider event/readback exists.
