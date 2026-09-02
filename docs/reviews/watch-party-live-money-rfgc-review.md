# Watch-Party Live money RFGC exact-head review

Review-only branch and draft pull request. Never merge this branch.

Implementation PR: #329  
Frozen head: `9bdd36eef3ddfb54bf92582017a4d4b8ddaad720`  
Frozen tree: `832028147eb6ffb5a44a0c6740946ca62e152fd5`  
Base: `8dfa0faf388cdc05d313b971418609347ee1c229`

Aggregate result: P0=0, P1=0, launch-impacting P2=0. The GitHub Phase 1 run itself concluded failure and is not represented as green: its three failed jobs contain only the Owner-authorized unbound task/scope assurance-control-plane findings. All ten substantive jobs passed.

## Lane 1 — architecture and state

Result: P0=0, P1=0.

- The standalone Player path remains Player → Party Waiting Room → Party Room. Party Room never routes to Live Stage.
- The Home live path remains Home → Live Waiting Room → Live Stage. Live Stage returns to Live Waiting Room and preserves exact `partyId` binding.
- `watch_party_live_ticket` remains ordinary exact Party Room authority only.
- `live_watch_party_access_pass` is exact Live Stage viewer/listener authority only.
- `live_watch_party_seat_pass` is exact-target seat eligibility only. It does not imply approval, speaking, publish, host, moderator, Premium, VIP, platform subscription, paid video, event, payout, or Party Room authority.
- Access offer, seat offer, active pass, host approval, current speaker membership, LiveKit token authority, room completion, and settlement are separate server-owned states.
- Foreground return discards the prior token and refreshes exact authoritative state; ended, canceled, revoked, expired, restricted, or stale state fails closed.

## Lane 2 — security and authority

Result: P0=0, P1=0. Codex Security scan `3a7a8ebe-ff96-4d0d-b802-8e4c15be518b` reviewed the full final range with 14/14 security-relevant work items closed and zero findings.

- New tables use enabled and forced RLS. Authenticated reads are bounded to the exact buyer, creator, or host; client financial mutation is not granted.
- Purchase intents bind authenticated buyer, exact offer, creator/host, target, pass type, product, provider, provider product, environment, amount, currency, and expiry.
- Provider events bind immutable event ID, original transaction, buyer, product, purchase intent, target, creator, host, and environment. Duplicate, replayed, stale, delayed, out-of-order, wrong-product, wrong-user, and drifted-offer cases fail closed or append ignored evidence.
- Payment writes `authority_granted=false`, `payment_role_authority=false`, `payment_media_authority=false`, and `grants_livekit_authority=false`.
- LiveKit publish requires current host-approved speaker membership after exact access and seat eligibility. Historical approval alone is insufficient; reversal demotes or removes current membership.
- Restricted, blocked, removed, ended, and quarantined authority remains denied regardless of payment.

## Lane 3 — provider and native boundary

Result: P0=0, P1=0 for source and executable integration; positive installed purchase proof is provider-sandbox limited.

- Creator configuration is exact live-host-only, empty-room-only, sandbox-catalog-only, and guarded by feature/store/webhook/creator-money kill switches while `live_money_enabled` remains off.
- Android maps only the reviewed RevenueCat Google Play sandbox products. iOS fails closed because the exact App Store sandbox catalog entries are absent; nothing is charged.
- Signed webhook dispatch remains upstream of the new service-only projector. Raw payloads are not stored; only hashes and bounded metadata are retained.
- Terminal events revoke access and seat eligibility, append reversal/refund evidence, and cannot mint new authority.
- No native dependency, plugin, entitlement, permission, Android/iOS generated source, or binary changed. Existing Android/iOS route and Live Stage guards passed separately.
- RevenueCat dashboard access was unavailable and no provider mutation was authorized. No real charge, production entitlement, role, room completion, balance, or transaction was fabricated.

## Lane 4 — privacy, rollback, determinism, and economics

Result: P0=0, P1=0.

- Provider bodies, tokens, credentials, account/device identifiers, and raw receipts are not committed or emitted. Audits use hashes and bounded summaries.
- Event-ID and original-transaction advisory locks serialize duplicates and late terminal events; the target/user lock is shared with host speaker approval so payment reversal cannot race into publish authority.
- Ordinary Party earnings require exact meaningful Party Room use. Live Access requires exact meaningful Live Stage entry. Live Seat requires meaningful entry plus canonical approval. Room end alone is insufficient.
- The two live products use the current completion policy: Pending until server-owned completion, 48-hour post-completion hold, 10% reserve, 30-day reserve duration, then Available only if otherwise payable. Sandbox remains not payable.
- Late reversal binds the original immutable transaction, appends evidence, revokes authority, reduces unsafe economics through the existing reversal architecture, and never erases history or double-deducts.
- Operational rollback keeps live money and payouts off, disables offers, and can restore the prior Edge Function versions. The migration is immutable after deployment; any database correction must be forward-only. No caller-selected completion time or hold exists.
- The reviewed browserslist dependency family removes the current high advisory. The compatibility proof pins the exact new full lock-graph digest and retains 18 killed mutation controls, so future unrelated identity drift still fails closed.

## Reproduced proof

- Full Supabase integration: 80 files, 2,996 assertions, pass.
- Exact Watch-Party Live pgTAP: 59/59 pass.
- Affected legacy pgTAP: 176/176 pass.
- Route/product Node proof: 7/7 pass.
- Focused LiveKit Deno proof: 10/10 pass.
- TypeScript, Android, iOS, route, runtime, Expo, and research integrity: pass.
- Lint: 0 errors; 108 pre-existing warnings.
- Production dependency audit: critical 0, high 0, moderate 26.
- Final exact security scan: complete, zero findings.

## Assurance-only and physical limitations

`node scripts/assurance/active-task.mjs` remains failed as `MANDATORY_COMMAND_DROPPED` and is recorded only as `OWNER_AUTHORIZED_PREOP_ASSURANCE_CONTINUATION`. Phase 1 run 33576358204 is likewise not represented as an overall pass. Its only failures are task/scope admission-control drift already covered by the exact Owner authorization; no substantive failure is bypassed.

T6 installed purchase/room media proof is limited because no legitimate configured RevenueCat live product and complete sandbox identity/device pair was available. Production money, production payouts, real charges, public rollout, fake authority, and production-v2 remain prohibited.

## Merge posture

The implementation head is substantively green and qualifies for the narrow temporary authenticated Owner pull-request bypass only for the enumerated assurance-control-plane findings. The active ruleset must be read before mutation, enforcement must remain active, the exact validated head must use a normal two-parent merge, and the exact prior semantic ruleset must be restored and read back immediately. This review-only branch and PR remain unmerged.
