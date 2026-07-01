-- Watch-Party Seat Pass visible copy cleanup.
-- Forward-only data/comment update. This keeps compatibility keys such as
-- watch_party_ticket, watch_party_tickets_enabled, and paid_watch_party_tickets
-- unchanged for provider, migration, RPC, notification, and access logic.

update public."platform_money_kill_switches"
set
  "display_label" = 'Watch-Party Seat Passes',
  "description" = 'Controls paid Watch-Party Seat Pass setup and production sale controls.',
  "reason" = 'Watch-Party Seat Pass setup is available in sandbox/not-payable mode. Production Seat Pass sales are not live.',
  "owner_only_reason" = 'Keep production Seat Pass sales disabled until product mapping, room access proof, refund policy, and live-money approval pass.',
  "updated_at" = timezone('utc'::text, now())
where "key" = 'watch_party_tickets_enabled';

update public."money_refund_policy_rules"
set
  "display_name" = 'Watch-Party Seat Pass',
  "standard_refund_policy" = 'Refund review when buyer has not entered/used the room and the room is canceled/unavailable or platform fault blocks access. No standard refund after room entry/use unless platform fault or legal/provider/admin decision.',
  "updated_at" = timezone('utc'::text, now())
where "policy_key" = 'watch_party_ticket';

do $$
begin
  if to_regclass('public."paid_watch_party_offers"') is not null then
    alter table public."paid_watch_party_offers"
      alter column "title" set default 'Watch-Party Seat Pass';

    update public."paid_watch_party_offers"
    set
      "title" = 'Watch-Party Seat Pass',
      "updated_at" = timezone('utc'::text, now())
    where "title" in ('Watch-Party ticket', 'Watch-Party Ticket');

    comment on table public."paid_watch_party_offers" is
      'Sandbox-only creator Watch-Party Seat Pass offers. Creator writes are RPC-only; rows do not grant Premium, Tips, Paid Videos, Live Stage, LiveKit authority, payouts, or live money.';
  end if;

  if to_regclass('public."paid_watch_party_tickets"') is not null then
    comment on table public."paid_watch_party_tickets" is
      'Sandbox-only compatibility table for paid Watch-Party Seat Pass access. A Seat Pass unlocks only the linked Party Waiting Room / Party Room and never grants Premium, Tips, Paid Videos, Live Stage, LiveKit publish, host authority, payouts, or live money.';
  end if;
end $$;

comment on function public."resolve_paid_watch_party_ticket_access"(text) is
  'Creator-safe Paid Watch-Party Seat Pass resolver. Seat Pass access is scoped to one Party Room / Watch-Party target and does not grant Premium, Live Stage, LiveKit authority, payouts, Tips, or Paid Videos.';

comment on function public."create_paid_watch_party_ticket_purchase_intent"(uuid) is
  'Creator-safe Paid Watch-Party Seat Pass purchase intent. Keeps Seat Pass access sandbox/not-payable unless owner/provider live-money activation explicitly changes it.';
