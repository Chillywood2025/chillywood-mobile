# NEXT TASK

## Recommended UI Lane: Profile / Channel / Platform Studio Compression

The Settings and Premium UI/UX Compression Pass is implemented and Android-proved. The best next UI lane is to apply the same compact, production-facing treatment to Profile, Public Channel, and Platform Studio surfaces without changing backed visibility, upload, Premium, or creator behavior.

Scope for the next lane:

- Compress Profile settings/presentation areas into short grouped sections with rows, accordions, and concise summaries.
- Compress Public Channel viewer/owner surfaces so public content, follow state, channel identity, and creator controls are easier to scan.
- Compress Platform Studio sections where creator tools still read as long stacked panels.
- Keep Profile, Channel, Platform Studio, Follow, Chi'lly Circle, and Subscribers conceptually separate.
- Keep the Chi'llwood branded dark background where it supports readability, and keep all content below mobile safe areas.
- Preserve all public/private/draft visibility behavior, creator upload behavior, Premium gates, RevenueCat logic, LiveKit behavior, Watch-Party behavior, admin behavior, auth/session behavior, and legal/support/account deletion links.

Validation should include `npm run typecheck`, `npm run validate:runtime`, relevant guards, targeted no-fake-access/no-debug-copy greps, Android screenshots on `R5CR120QCBF`, and `git diff --check`.

## Still-Open Non-UI Follow-Ups

Security Request Context follow-ups from the previous checkpoint remain valid but are not part of the next UI lane: Audit Explorer row-level owner/operator proof for a linked network-proof row, gateway/firewall policy if product wants to block direct Supabase Edge origin bypass, and trusted Edge wrappers for remaining direct SQL/public intake paths.
