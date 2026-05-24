# NEXT TASK

## Recommended UI Lane: Platform Studio Detail Drill-In Pass

The Platform Studio Production UI/UX and Routing Pass is implemented, committed at `2061ca85795fd1b4ebef1e2a234cbf9f34f909b8`, validated, and Android-proved. The best next UI lane is to shorten the deeper Platform Studio tabs and public Platform detail surfaces now that Home routing and terminology are clean.

Scope for the next lane:

- Split long Content, Brand, Live event, Payouts, Revenue, and public Platform detail panels into compact drill-in screens, sheets, or second-level accordions.
- Keep Platform Studio Home as the short control center with Today, Needs Attention, and grouped accordions.
- Keep Preview Platform in public-preview mode with no owner controls and no draft exposure.
- Keep Moderation and Safety visible, but route future backed moderation details into a focused safety dashboard when those surfaces exist.
- Keep Profile, Platform, Platform Studio, Chi'lly Circle, followers, and subscribers conceptually separate.
- Preserve all public/private/draft visibility behavior, creator upload/publish/delete behavior, Premium gates, RevenueCat logic, LiveKit behavior, Watch-Party behavior, payout/live-money behavior, admin behavior, auth/session behavior, and legal/support/account deletion links.

Validation should include `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, targeted no-debug-copy/no-fake-data greps, source proof that public preview still uses `includeDrafts: false`, Android screenshots on `R5CR120QCBF`, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Security Request Context follow-ups remain valid but are not part of the next UI lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
