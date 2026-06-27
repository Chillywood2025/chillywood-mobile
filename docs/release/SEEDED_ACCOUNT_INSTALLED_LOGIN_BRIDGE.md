# Seeded Account Installed Login Bridge

Seeded account installed login bridge: Closed / Partial / Blocked.

Verdict for this lane: Partial overall because the follow-up role traversal still has five route-marker/control-proof blockers. The installed login bridge itself is Closed for every non-restricted seeded proof account, and `proof_restricted_001` is Closed as restricted expected fail-closed.

Backend auth readback passed for `proof_normal_001`, `proof_creator_001`, `proof_moderator_001`, `proof_admin_operator_001`, `proof_owner_001`, `proof_blocked_a_001`, `proof_blocked_b_001`, `proof_premium_001`, and `proof_nonpremium_001`. `proof_restricted_001` remained blocked by account status and failed closed as expected.

Installed UI login root cause: automation credential injection failure. The prior Maestro flow used `${CHILLYWOOD_E2E_*}` placeholders without a secure runner environment bridge, so the installed app saw literal/empty credentials and returned Login Error / Invalid login credentials even though backend auth accepted the same accounts. The app login UI did not reject `@chillywood.test` email format, and this lane did not find a password mismatch for the non-restricted accounts.

Secondary harness issues fixed:

- Settings logout preparation did not expand the Account section before looking for `settings-logout-button`.
- XML redaction treated Android hierarchy `password="false"` as a secret-looking field and malformed the hierarchy, which broke bounds parsing.

## Credential Source Status

Credential values remain stored only in ignored `.env.browserstack-monetization.local`. The file is ignored by `.env*.local` and is not committed. The required local keys were present without printing values:

| Account label | Email key | Password key | Local status |
| --- | --- | --- | --- |
| `proof_normal_001` | `CHILLYWOOD_E2E_NORMAL_EMAIL` | `CHILLYWOOD_E2E_NORMAL_PASSWORD` | Present |
| `proof_creator_001` | `CHILLYWOOD_E2E_CREATOR_EMAIL` | `CHILLYWOOD_E2E_CREATOR_PASSWORD` | Present |
| `proof_moderator_001` | `CHILLYWOOD_E2E_MODERATOR_EMAIL` | `CHILLYWOOD_E2E_MODERATOR_PASSWORD` | Present |
| `proof_admin_operator_001` | `CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL` | `CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD` | Present |
| `proof_owner_001` | `CHILLYWOOD_E2E_OWNER_EMAIL` | `CHILLYWOOD_E2E_OWNER_PASSWORD` | Present |
| `proof_restricted_001` | `CHILLYWOOD_E2E_RESTRICTED_EMAIL` | `CHILLYWOOD_E2E_RESTRICTED_PASSWORD` | Present |
| `proof_blocked_a_001` | `CHILLYWOOD_E2E_BLOCKED_A_EMAIL` | `CHILLYWOOD_E2E_BLOCKED_A_PASSWORD` | Present |
| `proof_blocked_b_001` | `CHILLYWOOD_E2E_BLOCKED_B_EMAIL` | `CHILLYWOOD_E2E_BLOCKED_B_PASSWORD` | Present |
| `proof_premium_001` | `CHILLYWOOD_E2E_PREMIUM_EMAIL` | `CHILLYWOOD_E2E_PREMIUM_PASSWORD` | Present |
| `proof_nonpremium_001` | `CHILLYWOOD_E2E_NONPREMIUM_EMAIL` | `CHILLYWOOD_E2E_NONPREMIUM_PASSWORD` | Present |

## Secure Credential Bridge

The harness now uses the secure local `MAESTRO_` environment bridge. The runner reads ignored local env values, then launches Maestro with process environment variables:

- `MAESTRO_CHILLYWOOD_LOGIN_EMAIL`
- `MAESTRO_CHILLYWOOD_LOGIN_PASSWORD`

The values are not passed as command-line arguments, are not printed, and are redacted from captured output. Command-line credential passing remains rejected by the policy guard.

## Backend Auth Readback

| Account label | Backend result |
| --- | --- |
| `proof_normal_001` | Pass |
| `proof_creator_001` | Pass |
| `proof_moderator_001` | Pass |
| `proof_admin_operator_001` | Pass |
| `proof_owner_001` | Pass |
| `proof_restricted_001` | Blocked by account status, expected restricted fail-closed |
| `proof_blocked_a_001` | Pass |
| `proof_blocked_b_001` | Pass |
| `proof_premium_001` | Pass |
| `proof_nonpremium_001` | Pass |

## Installed UI Login Results

| Account label | Installed UI login result | Landing / reason |
| --- | --- | --- |
| `proof_normal_001` | Pass | Landing screen detected after login |
| `proof_creator_001` | Pass | Landing screen detected after login |
| `proof_moderator_001` | Pass | Landing screen detected after login |
| `proof_admin_operator_001` | Pass | Landing screen detected after login |
| `proof_owner_001` | Pass | Landing screen detected after login; current First Owner was not touched |
| `proof_restricted_001` | Pass: restricted expected fail-closed | Installed login denied by backed account status before private traversal |
| `proof_blocked_a_001` | Pass | Landing screen detected after login |
| `proof_blocked_b_001` | Pass | Landing screen detected after login |
| `proof_premium_001` | Pass | Landing screen detected after login |
| `proof_nonpremium_001` | Pass | Landing screen detected after login |

## Role Traversal Rerun

The full seeded one-device role traversal was rerun after the bridge fix. Result: Partial.

Status counts: Pass `75`, Human review `28`, Blocked `5`, Two-device required `4`, Fail `0`.

Remaining blocked route-marker/control-proof items:

- `proof_normal_001` `/chat`;
- `proof_normal_001` `/admin`;
- `proof_creator_001` `/channel-studio`;
- `proof_creator_001` `/creator-monetization-setup`;
- `proof_creator_001` `/payouts`.

Two-device proof still required for live video participant visibility, chat call media, Watch-Party sync, and real multi-user simultaneous participant state.

## No-Secrets Proof

No passwords were printed or committed. No credential values were added to docs, artifacts, logs, screenshots, or git. Artifacts may include proof account labels and key names only.

## Safety Confirmation

- No service-role was used.
- No accounts were created or recreated.
- No seeded account passwords were changed.
- Current First Owner was not touched.
- No real users were modified.
- No auth bypass was added.
- No RLS/account-status gate weakening happened.
- No sideload, uninstall, reinstall, or clear-data happened.
- No Play production submission happened.
- No provider mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.

## Artifact Path

- Login bridge and rerun source artifact: `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627012145/`

The separate lane artifact is `/tmp/app-seeded-account-installed-login-bridge-YYYYMMDD-HHMMSS/`.

## Next Lane Recommendation

Fix remaining route-marker/control blockers and rerun only affected one-device role flows. After one-device route/control blockers close, run two-device live/watch-party/chat-call proof.
