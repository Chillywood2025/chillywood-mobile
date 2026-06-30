-- Creator monetization setup activation.
-- This turns on setup/readiness mode only. It does not enable live money,
-- production purchases, payable balances, cash-out, transfers, withdrawals,
-- payout release, provider refunds, or provider product mutation.

insert into public."platform_money_kill_switches" (
  "key",
  "state",
  "display_label",
  "description",
  "reason",
  "owner_only_reason"
)
values
  (
    'digital_sales_enabled',
    'sandbox_only',
    'Digital sales',
    'Controls paid digital access setup and production sale controls.',
    'Creator digital sale setup is available in sandbox/not-payable mode. Production sales are not live.',
    'Keep production sales disabled until owner/provider activation, refund/support policy, tax/legal review, and live-money approval pass.'
  ),
  (
    'tips_enabled',
    'sandbox_only',
    'Tips',
    'Controls creator-support tip setup and production tip checkout claims.',
    'Creator tip setup is available in sandbox/not-payable mode. Production tips are not live.',
    'Keep production tips disabled until provider proof, refund/dispute policy, payout readiness, and live-money approval pass.'
  ),
  (
    'watch_party_tickets_enabled',
    'sandbox_only',
    'Watch-Party Seat Passes',
    'Controls paid Watch-Party ticket setup and production sale controls.',
    'Watch-Party Ticket setup is available in sandbox/not-payable mode. Production ticket sales are not live.',
    'Keep production ticket sales disabled until product mapping, room access proof, refund policy, and live-money approval pass.'
  ),
  (
    'watch_party_seats_enabled',
    'sandbox_only',
    'Watch-Party seats',
    'Controls paid Watch-Party seat setup and production access claims.',
    'Watch-Party seat setup is available in sandbox/not-payable mode. Production seat sales are not live.',
    'Keep production seat sales disabled until product mapping, host/room policy, and live-money approval pass.'
  ),
  (
    'live_watch_party_access_enabled',
    'sandbox_only',
    'Live Watch-Party access passes',
    'Controls paid Live Watch-Party / Live Stage access pass setup and production sale controls.',
    'Live Watch-Party access setup is available in sandbox/not-payable mode. Production sales are not live.',
    'Keep production access pass sales disabled until product mapping, Live Stage policy, and live-money approval pass.'
  ),
  (
    'live_watch_party_seats_enabled',
    'sandbox_only',
    'Live Watch-Party seat passes',
    'Controls paid Live Watch-Party / Live Stage seat setup and production sale controls.',
    'Live Watch-Party seat setup is available in sandbox/not-payable mode. Production sales are not live.',
    'Keep production seat pass sales disabled until product mapping, host approval policy, and live-money approval pass.'
  ),
  (
    'paid_content_enabled',
    'sandbox_only',
    'Paid content',
    'Controls paid video and digital content setup and production sale controls.',
    'Paid Video setup is available in sandbox/not-payable mode. Production paid content sales are not live.',
    'Keep production paid content sales disabled until provider mapping, access resolver proof, refund policy, and live-money approval pass.'
  ),
  (
    'creator_monetization_enabled',
    'sandbox_only',
    'Creator monetization',
    'Controls creator monetization setup/readiness surfaces.',
    'Creator monetization setup is available in sandbox/not-payable mode.',
    'Setup mode does not allow production money movement, payable balances, transfers, withdrawals, cash-out, or payout release.'
  ),
  (
    'creator_balance_visible',
    'on',
    'Creator balance visible',
    'Controls the read-only creator balance section.',
    'Creator balance/readiness is visible as read-only not-payable setup information.',
    'Default on because no payable balance, withdrawal, cash-out, transfer, or payout release is created while live money is off.'
  ),
  (
    'revenuecat_google_play_enabled',
    'sandbox_only',
    'RevenueCat / Google Play',
    'Controls store readiness surfaces for Android digital purchases.',
    'Store readiness is available in sandbox mode. Production purchases are not live.',
    'Sandbox-only allows setup/readiness without production charges.'
  ),
  (
    'provider_webhooks_enabled',
    'sandbox_only',
    'Provider webhooks',
    'Controls provider webhook processing beyond audit/readiness.',
    'Webhook checks are sandbox/readiness only.',
    'Webhook readiness must not activate live money while live_money_enabled is off.'
  ),
  (
    'stripe_connect_enabled',
    'sandbox_only',
    'Stripe Connect',
    'Controls payout setup/readiness surfaces.',
    'Cashout readiness can be reviewed in sandbox/not-payable mode. Payout execution is not live.',
    'Stripe Connect readiness does not allow production payout release until provider, tax/KYC, fraud/support/legal, and owner approvals pass.'
  )
on conflict ("key") do update
set
  "display_label" = excluded."display_label",
  "description" = excluded."description",
  "reason" = excluded."reason",
  "owner_only_reason" = excluded."owner_only_reason",
  "state" = case
    when public."platform_money_kill_switches"."state" in ('on', 'locked', 'maintenance') then public."platform_money_kill_switches"."state"
    else excluded."state"
  end,
  "updated_at" = timezone('utc'::text, now());

update public."platform_money_kill_switches"
set
  "state" = 'off',
  "reason" = 'Live money remains off. Creator setup mode does not allow production money movement.',
  "owner_only_reason" = 'A separate owner-approved live-money activation lane is required before this can change.',
  "updated_at" = timezone('utc'::text, now())
where "key" = 'live_money_enabled'
  and "state" <> 'off';

update public."platform_money_kill_switches"
set
  "state" = 'off',
  "reason" = 'Payouts and cash-out remain off for production money movement.',
  "owner_only_reason" = 'A separate payout activation lane is required after Stripe/live provider approval, tax/KYC readiness, fraud/support/legal review, and owner approval.',
  "updated_at" = timezone('utc'::text, now())
where "key" = 'payouts_enabled'
  and "state" <> 'off';
