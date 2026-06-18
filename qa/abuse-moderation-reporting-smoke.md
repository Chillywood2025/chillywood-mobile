# Abuse, Moderation, And Reporting Smoke

Use synthetic E2E accounts and safe test content only.

## Checks

- Report creator video where backed.
- Report Platform/Profile where backed.
- Report comment/message where backed.
- Block user through backed block flow.
- Blocked viewer access denied in Profile/Platform/subscription/VIP readback.
- Reported content receives penalty or exclusion in Algorithm Foundation V1 dry-run.
- Unsafe/reported content is not boosted above safe content.
- Owner cannot delete or alter immutable report history unless a backed admin/triage path explicitly allows it.
- Admin/report triage route checked if available.

## Must Not Happen

- Do not create unsafe public content for proof.
- Do not expose reporter private data.
- Do not weaken moderation or RLS policies.
- Do not use reported synthetic content as production ranking proof.
