# Account Purge Production Runbook

## Status

Permanent purge/de-identification is production-capable only through a controlled admin/operator path.

Current production enablement:

- Single-user owner/operator purge: enabled and proved for eligible expired scheduled-deletion accounts.
- Dry-run: default and non-mutating.
- Batch auto-purge: disabled/default-off.
- Broad auto-purge: not enabled.
- Provider refunds: not executed.
- Live-money actions: not executed.

Latest proof artifact:

- `/tmp/app-account-purge-production-enable-proof-20260625000430/`

## What Is Automated Now

The app supports a controlled single-user backend purge/de-identification RPC:

```sh
node scripts/proof-account-purge-production-enable.mjs
```

The proof command is read-only by default. Proof mutation requires:

```sh
node scripts/proof-account-purge-production-enable.mjs --run --proof-only
```

The production RPC itself is admin/operator-only, dry-run by default, and only runs on a target account that is scheduled for deletion with an expired restore window.

## What Is Manual Now

The following remain manual/legal/support review items:

- Storage object deletion.
- Provider-side identity deletion.
- Provider refund execution.
- Billing/store records.
- Chargeback, fraud, security, support, DMCA, and legal-hold decisions.
- Any broad batch processing beyond the disabled/default-off proof wrapper.

## Eligibility Verification

An account is eligible only when all are true:

- It has a scheduled deletion request.
- Its restore window has expired.
- It has not been restored.
- It is not already de-identified.
- It is not an owner, operator, moderator, protected account, or active sandbox tester.
- It is not the acting admin/operator account.
- Runtime emergency stop is off.
- Single-user purge is enabled.

An account is not eligible when:

- It is active with no scheduled deletion.
- It is still inside the restore window.
- It is protected by platform role.
- It is an active sandbox tester/protected tester account.
- It is already de-identified, in which case the RPC returns an idempotent already-deidentified result.

## Single-User Dry-Run

Dry-run is the default and never mutates.

Expected dry-run result:

- sanitized target suffix only;
- eligibility status;
- category counts;
- retained categories;
- `providerRefundExecuted=false`;
- `liveMoneyAction=false`.

Do not use dry-run output as a private-data export. It is intentionally summarized.

## Single-User Purge

Only owner/operator sessions or service-role controlled operator tooling may call the production RPC. Service-role keys must never be placed in mobile code.

Mutation result:

- profile identity is de-identified;
- public Profile/Platform remains fail-closed;
- private-feature access remains denied;
- local push-token rows are disabled/de-identified where implemented;
- notification text/context is de-identified/dismissed where implemented;
- account deletion request is marked completed;
- auth access is restricted;
- an admin audit row is written;
- retained legal/support/audit/payment/security records remain private;
- no provider refund is executed;
- no live-money action is performed.

## Batch Mode

Batch mode is disabled/default-off.

The batch RPC currently supports:

- dry-run eligible-count readback;
- bounded limit;
- disabled mutation proof.

It does not process broad production accounts in this lane. To enable batch in the future, a separate owner/legal-approved lane must:

- turn on runtime config intentionally;
- require an explicit call-time enable flag;
- keep bounded batch size;
- prove idempotency and audit;
- prove emergency stop;
- prove no real-user accidental purge.

## Stop / Disable

The runtime config includes:

- `emergency_stop`;
- `single_user_enabled`;
- `batch_enabled`;
- `max_batch_size`.

Emergency stop or disabling single-user purge causes the production RPC to fail closed. Batch mutation also requires `batch_enabled=true` and an explicit call-time enable flag; both are false/not provided by default.

## Retained Records

Some records may be retained for security, fraud prevention, legal, transaction, support, audit, DMCA, or dispute reasons.

Retained private categories include:

- payment/provider transaction records;
- refund/chargeback/access-grant audit;
- abuse/rate-limit/security logs;
- moderation/support/report/DMCA records;
- admin audit logs;
- fraud/security records;
- legal compliance records;
- content records where deletion would break another user's lawful record or moderation history.

## De-identified Records

The controlled path de-identifies:

- profile display identity;
- username;
- bio/tagline;
- avatar/profile media references on the profile row;
- background media references on the profile row;
- public Profile/Platform visibility/activity visibility;
- follower/subscriber surface flags;
- local push-token values/fingerprints/device/install metadata;
- notification title/body/context where the deleted user is target or actor;
- safe auth metadata;
- account access state.

## What Not To Promise

The app must not promise:

- instant permanent deletion;
- deletion before the restore window ends;
- deletion of records that must be retained for security, fraud prevention, legal, transaction, support, audit, DMCA, or dispute reasons;
- provider refund execution;
- payout, withdrawal, cash-out, payable balance, or live-money movement.

## Support / Legal Escalation

Escalate to owner/legal before:

- deleting storage objects;
- deleting provider-side records;
- changing retention categories;
- turning on batch mutation;
- processing legal hold, DMCA, fraud, chargeback, or payment-dispute accounts;
- claiming legal compliance beyond the proved behavior.

## Rollback / Incident Notes

If a purge issue is suspected:

- enable `emergency_stop`;
- stop batch mutation if it was ever enabled;
- preserve admin audit logs;
- preserve support/report/DMCA records;
- do not run provider refund APIs as part of rollback;
- verify public Profile/Platform remains fail-closed;
- verify private-feature access remains denied;
- review only sanitized audit/readback artifacts.
