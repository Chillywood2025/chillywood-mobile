# Stable Seeded Proof Account Pack

Stable seeded proof account pack: Closed / Partial / Blocked.

Verdict for this lane: Closed for seeded proof account pack provisioning and readback.

Service-role bootstrap is approved only for proof-only account creation/repair. Service-role bootstrap is not role/permission authority proof. Owner RPC staff grant path remains the authority proof.

No passwords, service-role keys, tokens, provider secrets, signed URLs, raw IPs, tax IDs, bank details, private evidence, or private messages are committed or artifacted. Current First Owner was not touched. No real users were modified. No provider mutation happened. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.

## Purpose

The stable seeded proof account pack gives installed-device and backend proof scripts repeatable proof-only identities for signed-out, normal user, creator, Moderator, Admin/operator, Owner, restricted, blocked-user-pair, Premium, and non-Premium flows. The accounts use only `@chillywood.test` labels and credentials live only in ignored local env.

## Credential Handling Rules

- Credential values are stored only in `.env.browserstack-monetization.local`.
- `.env.browserstack-monetization.local` is ignored by git.
- Credential values must not be printed, committed, pasted into chat, placed in docs, or included in artifacts.
- Proof artifacts may include key names, account labels, user-id suffixes, and present/missing status only.
- Proof accounts are not real staff accounts and are separate from staff accounts.

## Service-Role Bootstrap Boundary

Service-role bootstrap was used only for proof-only account creation/repair and proof-only state fixtures:

- created or repaired missing `@chillywood.test` Auth users;
- repaired proof-only `user_profiles` rows;
- seeded creator-ready sandbox status rows where backed;
- seeded blocked A/B relationship where backed;
- seeded restricted/suspended proof state for `proof_restricted_001`;
- seeded test Premium entitlement for `proof_premium_001`;
- ensured `proof_nonpremium_001`, `proof_normal_001`, and proof Owner had no active Premium entitlement.

Service-role bootstrap did not prove role or permission authority, did not touch real users, did not touch current First Owner, did not create live money, did not create payable balances, did not change provider products, did not change real purchases, and did not mutate Google Play, RevenueCat, Stripe, or provider dashboards.

## Owner RPC Authority Boundary

Moderator and Admin/operator staff roles/scopes were verified through the backed Owner RPC path where possible:

- `admin_grant_platform_role_by_email`
- `admin_grant_platform_staff_permission_by_email`

The role/permission authority proof remains `npm run proof:owner-rpc-staff-grant-path`. The proof Owner account is proof-only and not the current First Owner.

## Readiness Table

| Account label | Email | Role/state | Readiness |
| --- | --- | --- | --- |
| `proof_normal_001` | `proof_normal_001@chillywood.test` | normal signed-in user, non-staff, non-Premium | Closed |
| `proof_creator_001` | `proof_creator_001@chillywood.test` | creator-ready profile/channel plus sandbox creator-money status fixtures | Closed |
| `proof_moderator_001` | `proof_moderator_001@chillywood.test` | scoped Moderator with exact moderation/support scopes | Closed |
| `proof_admin_operator_001` | `proof_admin_operator_001@chillywood.test` | scoped Admin/operator with exact Admin readback scopes | Closed |
| `proof_owner_001` | `proof_owner_001@chillywood.test` | proof Owner, not current First Owner | Closed |
| `proof_restricted_001` | `proof_restricted_001@chillywood.test` | restricted/suspended fail-closed proof user | Closed |
| `proof_blocked_a_001` | `proof_blocked_a_001@chillywood.test` | blocked-user pair A | Closed |
| `proof_blocked_b_001` | `proof_blocked_b_001@chillywood.test` | blocked-user pair B | Closed |
| `proof_premium_001` | `proof_premium_001@chillywood.test` | active test Premium entitlement | Closed |
| `proof_nonpremium_001` | `proof_nonpremium_001@chillywood.test` | non-Premium, no active Premium entitlement | Closed |

## Proof Result

Bootstrap passed with sanitized output:

- `/tmp/app-stable-seeded-proof-account-pack-20260626215035/`

Independent readback proof passed:

- `/tmp/app-stable-seeded-proof-account-pack-proof-20260626215043/`

`npm run proof:stable-seeded-proof-account-pack` passed with all ten accounts usable. `npm run guard:stable-seeded-proof-account-pack-policy` guards the no-secret, proof-only, Owner RPC authority, First Owner safety, real-user safety, provider safety, and money-off boundaries.

## Rerun Instructions

1. Keep local proof credentials in `.env.browserstack-monetization.local`.
2. Run `npm run proof:stable-seeded-proof-account-pack`.
3. Run `npm run guard:stable-seeded-proof-account-pack-policy`.
4. Run `npm run proof:one-attached-device-full-app-automation`.
5. Use the installed Play internal app only; do not sideload, uninstall, reinstall, clear data, or reset the device.

## Safety Confirmation

- Current First Owner was not touched.
- No real users were modified.
- No credentials were committed.
- No passwords were printed.
- No provider mutation happened.
- No Play production submission happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
