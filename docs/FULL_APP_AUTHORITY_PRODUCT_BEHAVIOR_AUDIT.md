# Full App Authority And Product Behavior Audit

Status: source/guard sweep closed; installed role/device proof pending unless run separately.

Last updated: 2026-07-12

This document is the current whole-app contract after the autonomous, media, LiveKit, money, admin, and operator changes. It classifies every current app route and every Supabase Edge Function at source level. Runtime/device proof is not implied by this file.

## Global Rules

- `/admin` is the only platform Admin Command Center. No duplicate admin route is allowed. Plain-language guard phrase: /admin is the only platform Admin Command Center.
- Owner/super_admin remains final authority. Rachi can request/recommend but cannot approve.
- Autonomous operators can request approval through trusted paths but cannot approve or self-approve.
- Level 3/4 actions require owner/super_admin approval. Level 4 also requires external confirmation where applicable.
- Unsupported or high-risk UI must be read-only, disabled, hidden, blocked, or routed to Owner Command / Autonomous Approval.
- No direct UI or function path may move money, manually grant Premium, publish/rollback production OTA, mutate auth/RLS/owner roles, ban/restrict users, delete content, expose private/original/Premium media, mutate provider products, change LiveKit routing policy, or leak secrets.

## Active Autonomous Systems

- `media_automation`
- `livekit_operator`
- `money_flow_control`
- `notification_delivery_operator`
- `release_ota_operator`
- `security_owner_operator`
- `moderation_safety_operator`
- `observability_runtime_operator`
- `owner_command_operator`

## Route Inventory

| File | Route | Classification | Required gate | Status | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `app/(auth)/_layout.tsx` | auth layout | public auth | none | live and backed | 0 | Auth container only. |
| `app/(auth)/forgot-password.tsx` | `/forgot-password` | public auth | none | live and backed | 1 | Password reset request. |
| `app/(auth)/login.tsx` | `/login` | public auth | none | live and backed | 1 | Sign-in only. |
| `app/(auth)/signup.tsx` | `/signup` | public auth | none | live and backed | 1 | Sign-up only. |
| `app/(tabs)/_layout.tsx` | tab layout | app shell | session where needed | live and backed | 0 | Navigation shell. |
| `app/(tabs)/explore.tsx` | `/explore` | public/signed-in discovery | none/session for actions | live and backed | 1 | Discovery/search lane. |
| `app/(tabs)/index.tsx` | `/` | home tab | none/session for personalized actions | live and backed | 1 | Public-safe media surfaces only. |
| `app/(tabs)/live.tsx` | `/live` | LiveKit/Premium gate | Premium for protected live paths | live and backed | 2 | LiveKit token/router path; no routing-policy mutation. |
| `app/(tabs)/my-list.tsx` | `/my-list` | signed-in library | session | live and backed | 1 | User library only. |
| `app/(tabs)/profile.tsx` | `/profile` | signed-in self profile | session | live and backed | 1 | Self profile controls only. |
| `app/+not-found.tsx` | not found | public diagnostic | none | live and backed | 0 | No privileged action. |
| `app/_layout.tsx` | root layout | app shell | none | live and backed | 0 | Global providers. |
| `app/account-deletion.tsx` | `/account-deletion` | legal/account support | session for request | live and backed | 2 | No hidden delete; request path only. |
| `app/admin-money-sandbox-purchases.tsx` | `/admin-money-sandbox-purchases` | admin money sandbox status | admin/owner | read-only/foundation | 2 | Test/not-payable status only; no live money. |
| `app/admin.tsx` | `/admin` | canonical admin | staff role/owner gates | live mixed | 3 | Uses role/action registry; high-risk approval-gated/read-only. |
| `app/auth-callback.tsx` | `/auth-callback` | auth callback | provider redirect | live and backed | 1 | No privileged UI. |
| `app/auth/callback.tsx` | `/auth/callback` | auth callback | provider redirect | live and backed | 1 | No privileged UI. |
| `app/auth/index.tsx` | `/auth` | auth redirect/compat | none | live and backed | 0 | Compat route. |
| `app/auth/v1/index.tsx` | `/auth/v1` | auth compat | none | live and backed | 0 | Compat route. |
| `app/auth/v1/verify.tsx` | `/auth/v1/verify` | auth verify compat | provider redirect | live and backed | 1 | No privileged UI. |
| `app/auth/verify.tsx` | `/auth/verify` | auth verify | provider redirect | live and backed | 1 | No privileged UI. |
| `app/beta-support.tsx` | `/beta-support` | support/legal | none/session for form | live and backed | 1 | Support intake only. |
| `app/callback.tsx` | `/callback` | compat callback | provider redirect | live and backed | 1 | No privileged UI. |
| `app/channel-settings.tsx` | `/channel-settings` | creator settings | creator/session | live and backed | 2 | Creator-owned controls; no platform admin. |
| `app/channel-studio/index.tsx` | `/channel-studio` | creator control center | creator/session | live mixed | 2 | Creator/media/money foundation controls; not platform admin. |
| `app/channel-subscription/[creatorId].tsx` | `/channel-subscription/[creatorId]` | creator monetization sandbox | session/provider | approval/provider-gated | 3 | Provider-backed only; no manual grant. |
| `app/channel/[userId].tsx` | `/channel/[userId]` | public creator channel | none/session for actions | live and backed | 1 | No platform admin controls. |
| `app/chat/[threadId].tsx` | `/chat/[threadId]` | chat/call | session | live and backed | 2 | Report/call controls; no hidden enforcement. |
| `app/chat/index.tsx` | `/chat` | chat inbox | session | live and backed | 1 | Inbox/user messaging. |
| `app/chilly-circle.tsx` | `/chilly-circle` | social/follow/friend | session | live mixed | 1 | User-scoped relationship actions. |
| `app/communication/[roomId].tsx` | `/communication/[roomId]` | chat/call room | session | live and backed | 2 | Room-safe call behavior. |
| `app/communication/index.tsx` | `/communication` | chat/call entry | session | live and backed | 1 | Communication hub. |
| `app/community-guidelines.tsx` | `/community-guidelines` | legal/static | none | live and backed | 0 | Static policy. |
| `app/copyright-report.tsx` | `/copyright-report` | legal intake | none/session for submit | live and backed | 2 | Legal intake only; evidence protected. |
| `app/copyright.tsx` | `/copyright` | legal/static | none | live and backed | 0 | Static policy. |
| `app/counter-notice.tsx` | `/counter-notice` | legal intake | none/session for submit | live and backed | 2 | Legal intake only. |
| `app/creator-monetization-setup.tsx` | `/creator-monetization-setup` | creator money setup | creator/session | read-only/foundation | 3 | No live provider mutation. |
| `app/creator-monetization.tsx` | `/creator-monetization` | creator money center | creator/session | read-only/foundation | 3 | No payable balances or payouts. |
| `app/creator-rules.tsx` | `/creator-rules` | legal/static | none | live and backed | 0 | Static policy. |
| `app/event/[eventId].tsx` | `/event/[eventId]` | event/sandbox monetization | session/provider for paid access | live mixed | 2 | Provider/test flow only where backed. |
| `app/home.tsx` | `/home` | home compat | none/session for actions | live and backed | 1 | Home route alias. |
| `app/law-enforcement.tsx` | `/law-enforcement` | legal/static/intake | none | live and backed | 1 | No private evidence exposure. |
| `app/library.tsx` | `/library` | library compat | session | live and backed | 1 | User library only. |
| `app/live-rules.tsx` | `/live-rules` | legal/static | none | live and backed | 0 | Static policy. |
| `app/modal.tsx` | `/modal` | modal/demo | none | source/proof only | 0 | No privileged action. |
| `app/moderation-policy.tsx` | `/moderation-policy` | legal/static | none | live and backed | 0 | Static policy. |
| `app/monetize.tsx` | `/monetize` | creator money intro | creator/session | read-only/foundation | 3 | No live money activation. |
| `app/payouts.tsx` | `/payouts` | payout status | creator/session | disabled/blocked | 4 | No payout/cashout/release. |
| `app/player/[id].tsx` | `/player/[id]` | media playback | media/Premium gates | live and backed | 2 | Public/Premium playback gates enforced. |
| `app/player/replay/[replayId].tsx` | `/player/replay/[replayId]` | replay playback | session/entitlement where needed | live and backed | 2 | Signed playback token path. |
| `app/premium-terms.tsx` | `/premium-terms` | legal/static | none | live and backed | 0 | Static policy. |
| `app/privacy.tsx` | `/privacy` | legal/static | none | live and backed | 0 | Static policy. |
| `app/profile/[userId].tsx` | `/profile/[userId]` | public/profile/social | none/session for actions | live and backed | 2 | Report/delete only scoped to owner/report lanes. |
| `app/reset-password.tsx` | `/reset-password` | auth password reset | provider/session | live and backed | 1 | Auth flow. |
| `app/revenue.tsx` | `/revenue` | creator/admin revenue status | creator/session | read-only/foundation | 3 | No fake revenue. |
| `app/settings.tsx` | `/settings` | settings/app diagnostics | session | live and backed | 1 | App Info release diagnostics safe fields only. |
| `app/spectate/[itemId].tsx` | `/spectate/[itemId]` | spectator/playback | session/media gates | live and backed | 2 | Playback/signing scope only. |
| `app/subscribe.tsx` | `/subscribe` | Premium purchase/restore | session/provider | live provider-backed | 3 | RevenueCat/Google Play only; no manual grant. |
| `app/support-policy.tsx` | `/support-policy` | legal/static | none | live and backed | 0 | Static policy. |
| `app/support.tsx` | `/support` | support | none/session for submit | live and backed | 1 | Support intake only. |
| `app/terms.tsx` | `/terms` | legal/static | none | live and backed | 0 | Static policy. |
| `app/tip-status.tsx` | `/tip-status` | tip/provider status | session/provider | read-only/foundation | 3 | No live money movement. |
| `app/title/[id].tsx` | `/title/[id]` | title/media detail | none/session for actions | live and backed | 1 | Public-safe metadata/media gates. |
| `app/verify.tsx` | `/verify` | auth verify compat | provider redirect | live and backed | 1 | No privileged UI. |
| `app/vip-pass/[creatorId].tsx` | `/vip-pass/[creatorId]` | creator VIP sandbox access | session/provider | provider-gated | 3 | Provider/test flow only; no manual grant. |
| `app/watch-party/[partyId].tsx` | `/watch-party/[partyId]` | Watch Party room | session/Premium for live | live and backed | 2 | LiveKit/Premium gates; no bypass. |
| `app/watch-party/index.tsx` | `/watch-party` | Watch Party entry | session/Premium for live | live and backed | 2 | Premium access sheet where required. |
| `app/watch-party/live-stage/[partyId].tsx` | `/watch-party/live-stage/[partyId]` | Live Stage | session/Premium/LiveKit | live and backed | 2 | LiveKit token/render contract. |
| `app/watch-party/live-stage/index.tsx` | `/watch-party/live-stage` | Live Stage entry | session/Premium/LiveKit | live and backed | 2 | Entry/compat route. |

## UI Action / Tap Inventory Result

Static scan covers `Button`, `Pressable`, `Touchable*`, `onPress`, `router.push`, `Link`, `Alert.alert`, action-sheet entries, and high-risk labels across `app/`, `components/`, and `_lib/`.

Current classification:

- `/admin` active taps are governed by `_lib/adminActionRegistry.ts`, `docs/ADMIN_ACTION_REGISTRY.md`, and the owner/admin/moderator tap proof/guards.
- Owner/super_admin taps can approve/deny autonomous requests and use Owner Command, but high-risk execution still requires fresh preflight, exact scope, and Level 4 external confirmation where applicable.
- Admin/operator taps are status/readback/scoped operation only and cannot self-approve.
- Moderator taps are case/review scoped and cannot access broad Admin Search, private evidence, owner approvals, hidden enforcement, direct ban/restrict, or destructive content deletion.
- Creator/user taps are routed through public, creator, support, report, monetization-provider, media, chat, and LiveKit gates. Creator Studio is not platform admin.
- Money/Premium taps are provider-backed or read-only/foundation. There are no active manual Premium grant, payout release, mark-paid, transfer, cashout, production charge, invoice, payment link, or production checkout controls.
- Release/OTA taps are status/readback only unless routed through approval. No direct production publish/rollback button is active.
- Media playback/upload taps remain gated by scan/moderation/ownership/Premium/public-safety paths; broad backfill/processing remains autonomous approval work.

## Backend / Edge Function Inventory

| Function | Classification | Auth model | Status | Risk | Notes |
| --- | --- | --- | --- | --- | --- |
| `admin-legal-evidence` | admin/legal evidence | owner/admin JWT + service backend | live and backed | 3 | No public private-evidence exposure. |
| `admin-live-cost-guard-action` | admin Live cost action | owner/admin JWT | approval/readback gated | 3 | Cost guard only. |
| `admin-live-cost-guard-webhook` | Live cost webhook | shared secret | live and backed | 2 | Webhook audit only. |
| `admin-live-ops-fix-center` | admin live ops | owner/admin JWT | live and backed | 3 | No LiveKit policy mutation without authority. |
| `admin-owner-controls` | owner/admin controls | owner/admin JWT | live and backed | 3 | No god panel; audited owner controls. |
| `autonomous-approval-request` | autonomous approvals | owner JWT or trusted token | live and backed | 3 | Owner/super_admin approval only. |
| `chilly-chat-call-dispatch` | chat/call dispatch | session/backend | live and backed | 2 | Room-safe call dispatch. |
| `create-creator-tip-checkout` | creator tip checkout preflight | session/provider/test policy | approval/provider gated | 3 | No live money unless configured/approved. |
| `creator-replay-playback` | replay playback | bearer/session + signed segments | live and backed | 2 | No token output. |
| `google-play-webhook` | Google Play readiness webhook | shared secret | readiness-only | 2 | RevenueCat remains source of truth unless direct path active. |
| `livekit-heartbeat-monitor` | LiveKit heartbeat monitor | narrow token | live and backed | 2 | Legitimate heartbeat only. |
| `livekit-operator` | LiveKit operator | narrow operator token | scheduled/live | 2 | Safe recovery only. |
| `livekit-registry` | LiveKit registry/router | bearer + heartbeat token | live and backed | 2 | No stale cutoff loosening. |
| `livekit-token` | LiveKit token issuer | bearer/session | live and backed | 2 | Token contract only; no participant-token logs. |
| `media-object-storage-migration` | media storage migration | trusted token/service backend | bounded/approval-gated | 3 | No broad deletion or exposure. |
| `media-scan-private-access` | private scan access | trusted token/session as coded | live and backed | 2 | Scanner/private access only. |
| `media-storage` | media upload/storage | bearer/session + backend service | live and backed | 2 | R2/private origin path. |
| `moderation-safety-operator` | moderation operator | narrow token | scheduled/live | 2 | Findings/recommendations only. |
| `money-operator` | money operator | narrow token | scheduled/live | 3 | Safe status/findings only; no money movement. |
| `notification-device-tokens` | device token registration | bearer/session | live and backed | 1 | Token redaction required. |
| `notification-dispatch` | notification dispatch | trusted/session as coded | scoped/live | 2 | No broad campaigns. |
| `notification-operator` | notification operator | narrow token | scheduled/live | 2 | DeviceNotRegistered cleanup only with evidence. |
| `observability-operator` | observability operator | narrow token | scheduled/live | 2 | No crash evidence deletion or PII expansion. |
| `owner-command-operator` | owner command routing | owner JWT or narrow trusted token | live and backed | 3 | Routes through target operators only. |
| `payout-release-preflight` | payout preflight | owner/admin/provider policy | blocked/preflight only | 4 | No payout release. |
| `premium-media-playback-token` | Premium media token | bearer/session + Premium readback | live and backed | 3 | Provider-backed Premium only. |
| `provider-billing-import-preflight` | provider billing import preflight | owner/admin/provider policy | preflight only | 3 | No provider mutation. |
| `provider-billing-reconciliation` | provider billing reconciliation | trusted/provider policy | read-only/safe writes | 2 | Reconciliation only. |
| `provider-readiness` | provider readiness | shared secret/trusted | live and backed | 2 | Sanitized readiness audit. |
| `provider-usage-import` | provider usage import | owner/admin JWT + backend | bounded/preflight | 3 | No fake provider usage. |
| `public-creator-video-cards` | public creator cards | public-safe read | live and backed | 1 | Public-safe metadata only. |
| `release-operator` | release operator | narrow token | scheduled/live | 2 | Findings only; no publish/rollback. |
| `request-save-replay` | save replay request | session/backend | live and backed | 2 | Request path only. |
| `revenue-source-import` | revenue source import | owner/admin/provider policy | preflight/foundation | 3 | No fake revenue. |
| `revenuecat-webhook` | RevenueCat webhook | shared secret | live and backed | 3 | Provider-backed Premium events only. |
| `security-owner-operator` | security owner operator | narrow token | scheduled/live | 2 | Findings/requests only. |
| `spectator-broadcast-start` | spectator broadcast start | session/backend | live and backed | 2 | No LiveKit routing mutation. |
| `spectator-broadcast-status` | spectator broadcast status | session/backend | live and backed | 1 | Status only. |
| `spectator-broadcast-stop` | spectator broadcast stop | session/backend | live and backed | 2 | Scoped room stop only. |
| `spectator-playback` | spectator playback | bearer/session + signed segments | live and backed | 2 | No signed URL leakage. |
| `spectator-start-room` | spectator room start | session/backend | live and backed | 2 | Room-scoped. |
| `sponsor-brand-payment-preflight` | sponsor payment preflight | owner/admin/provider policy | preflight only | 3 | No charge. |
| `sponsor-checkout-preflight` | sponsor checkout preflight | owner/admin/provider policy | preflight only | 3 | No checkout session. |
| `sponsor-reporting-fraud-preflight` | sponsor fraud preflight | owner/admin/provider policy | preflight only | 3 | No enforcement. |
| `stripe-connect-account` | Stripe Connect account | session/provider policy | foundation/test-gated | 3 | No live mode switch. |
| `stripe-connect-account-sync` | Stripe Connect sync | provider/trusted | readback/sync only | 2 | No payout creation. |
| `stripe-connect-onboarding-link` | Stripe onboarding link | session/provider policy | foundation/test-gated | 3 | No live money. |
| `stripe-connect-transfer-create` | Stripe transfer create | provider policy | blocked/approval-gated | 4 | Real transfer forbidden without Level 4 + confirmation. |
| `stripe-connect-transfer-sync` | Stripe transfer sync | provider/trusted | readback only | 2 | No mark-paid without provider confirmation. |
| `stripe-connect-webhook` | Stripe Connect webhook | Stripe signature | live/test-gated | 3 | Invalid signatures fail closed. |
| `stripe-merch-checkout` | Stripe merch checkout | session/provider test policy | test/foundation-gated | 3 | No production charge in this audit. |
| `stripe-merch-webhook` | Stripe merch webhook | Stripe signature | live/test-gated | 3 | Test-mode cannot claim production. |
| `stripe-tip-webhook` | Stripe tip webhook | Stripe signature | test-gated | 3 | No digital unlock or Premium grant. |

## Feature Lane Classification

| Lane | Status | Guarded by | Pending |
| --- | --- | --- | --- |
| Public user app | live and backed | route contracts, public feature guards | installed broad traversal pending for current commit. |
| Creator app / Studio | live mixed with read-only/foundation money | creator/media/money guards | installed creator traversal pending. |
| Admin app | live mixed | admin action registry, tap matrix, role guards | installed owner/admin/moderator role proof pending for current commit. |
| Owner Command | live and protected | owner-command proofs/guards | installed owner command UI proof pending for current commit. |
| Autonomous systems | live/scheduled where documented | autonomous registry guard | host timer proof current in docs; fresh host readback not rerun in this audit. |
| Money/provider | scoped-write guarded | money/provider proofs/guards | no live provider mutation; installed Money Center proof pending. |
| Media/R2/playback | live bounded | media delivery/automation guards | no broad media/backfill scheduled. |
| LiveKit/Watch Party/Chat call | live bounded | LiveKit operator and render proofs/guards | two-device Watch-Party/Party Room sidecar proof remains separate if not freshly run. |
| Notifications | scheduled safe probe/recovery | notification operator guard | broad push remains approval-gated. |
| Release/OTA diagnostics | scheduled findings only | release/diagnostics proofs | no publish/rollback. |
| Security/owner/audit | live bounded | owner/security/audit guards | no auth/RLS/owner-role mutation. |
| Moderation/safety | live scoped/finding/review | moderator/queue/content guards | enforcement actions remain approval-gated or absent. |
| Observability | scheduled findings only | observability guard | no Remote Config mutation or crash evidence deletion. |

## Removed / Disabled / Blocked Classes

- Manual Premium grant/edit.
- Payout release, mark paid, transfer, cashout, production charge, invoice, payment link, production checkout session.
- Production OTA publish/rollback without approval.
- Auth/RLS/owner-role mutation without approval.
- Broad push campaign without approval.
- Direct ban/suspend/restrict/delete content without backed approval/audit/appeal.
- Provider product/mode/dashboard mutation without approval.
- LiveKit routing/stale cutoff/server registry mutation.
- Broad media processing/backfill or private/original/Premium public exposure.

## Installed Proof Status

Installed role/device proof was not run by this source audit. Current pending installed proof roles/devices:

- owner/super_admin;
- admin/operator;
- moderator;
- normal user/creator;
- Premium active user;
- non-Premium user.

The safe next action is a Play-installed role traversal using current production update diagnostics and seeded accounts, without manual Premium grants or high-risk actions.
