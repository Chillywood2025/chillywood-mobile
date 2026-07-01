# BrowserStack E2E Social Graph Fixtures

These fixtures are synthetic BrowserStack/E2E data only. They must not be used as public credibility, launch metrics, payout evidence, production traction, or purchase proof.

## Account Role Map

| Role | Email | Proves | Must not unlock |
| --- | --- | --- | --- |
| Owner creator | `bs_e2e_owner_01@chillywood.test` | Owns the test Platform, monetization fixtures, paid video, ticket, event, subscription, and VIP offers. | Live money, payouts, fake public clout for real users. |
| Primary viewer/tester | `bs_e2e_viewer_01@chillywood.test` | Clean non-owner sandbox tester for BrowserStack monetization flows. | Owner mode, private, subscriber-only, VIP, Premium, paid access unless separately granted by a test. |
| Follower-only viewer | `bs_e2e_viewer_02@chillywood.test` | Follow state only. | Private access, subscriber-only access, VIP, Premium, paid video, ticket, event. |
| Circle member viewer | `bs_e2e_viewer_03@chillywood.test` | Chi'lly Circle/private access. | Subscriber-only access, VIP, Premium, paid video, ticket, event. |
| Subscriber viewer | `bs_e2e_viewer_04@chillywood.test` | Active creator Platform Subscription state. | VIP, Premium, paid video, Watch-Party Seat Pass, event pass. |
| VIP viewer | `bs_e2e_viewer_05@chillywood.test` | Active creator VIP state. | Subscription, Premium, paid video, Watch-Party Seat Pass, event pass. |
| Blocked viewer | `bs_e2e_viewer_06@chillywood.test` | Block precedence over follower/Circle/subscriber/VIP-looking rows. | Profile, Platform, subscription, VIP, Premium, paid access where block rules apply. |
| Public/non-related viewer | `bs_e2e_viewer_07@chillywood.test` | Public-only/locked state. | Follow, Circle, subscriber, VIP, Premium, paid access. |
| Backup viewer 1 | `bs_e2e_viewer_08@chillywood.test` | Clean spare account. | All gated states until deliberately assigned. |
| Backup viewer 2 | `bs_e2e_viewer_09@chillywood.test` | Clean spare account. | All gated states until deliberately assigned. |

## Fixture Behavior

`npm run qa:browserstack:e2e-social-graph:prepare` uses service-role credentials from ignored local env only. It fails closed if the service-role env is missing and only touches the allowlisted `bs_e2e_*@chillywood.test` accounts.

The owner fixture is set to:

- `profile_access_visibility=private`
- `platform_access_visibility=subscriber_only`

The readback proves:

- follower-only does not unlock private or subscriber-only
- Circle member unlocks private, not subscriber-only
- subscriber unlocks private and subscriber-only
- VIP unlocks VIP only
- blocked viewer is denied even with synthetic follower/Circle/subscriber/VIP-looking rows
- public and backup viewers remain locked out of gated states
- owner is always allowed

## BrowserStack Usage

BrowserStack/Maestro flows should use the role email aliases written to ignored `.env.browserstack-monetization.local`, such as:

- `CHILLYWOOD_E2E_FOLLOWER_ONLY_EMAIL`
- `CHILLYWOOD_E2E_CIRCLE_MEMBER_EMAIL`
- `CHILLYWOOD_E2E_SUBSCRIBER_EMAIL`
- `CHILLYWOOD_E2E_VIP_EMAIL`
- `CHILLYWOOD_E2E_BLOCKED_EMAIL`
- `CHILLYWOOD_E2E_PUBLIC_VIEWER_EMAIL`

Passwords remain in ignored local env under the existing viewer password keys and must never be printed or committed.

## Reset

Run `npm run qa:browserstack:e2e-social-graph:reset` to remove owner/viewer synthetic follow, subscriber, block, and Circle rows, revoke metadata-marked synthetic access grants, revoke metadata-marked subscription/VIP rows, and return the owner test profile/platform visibility to public.

The reset is scoped to the same allowlisted E2E accounts. It does not delete auth users or modify real accounts.

## Safety Caveats

- Synthetic rows are marked with available metadata where supported: `browserstack_e2e_social_graph`, `purpose=browserstack_e2e`, `environment=sandbox`, `not_payable=true`, `no_payout=true`, `production_enabled=false`.
- Tables without metadata columns are scoped by account names and owner/viewer IDs only.
- Synthetic relationships are not public traction for real users and must be excluded from analytics/ranking proof if an analytics exclusion path exists.
- Access grants are sandbox-only and admin-sourced; they do not create provider events, payable ledgers, payouts, LiveKit publish authority, host authority, Premium, paid-video, ticket, or event access.
- The algorithm dry-run may use these roles as synthetic examples only. Unsafe, reported, private, locked, or same-creator diversity rules still apply.
