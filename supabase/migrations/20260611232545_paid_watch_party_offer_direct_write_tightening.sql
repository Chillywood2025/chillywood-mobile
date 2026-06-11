-- Paid Watch-Party Seats V1 direct-write tightening.
-- Creators manage offers through set_paid_watch_party_offer(). Direct client
-- writes stay closed so seats_sold, provider fields, and statuses cannot be
-- mutated outside the guarded RPC/provider path.

revoke insert, update, delete on table public."paid_watch_party_offers" from authenticated;
grant select on table public."paid_watch_party_offers" to authenticated;

comment on table public."paid_watch_party_offers" is
  'Sandbox-only creator Watch-Party ticket offers. Creator writes are RPC-only; clients cannot directly mutate seats_sold, provider fields, payable state, LiveKit authority, host authority, Premium, Tips, Paid Videos, payouts, or live money.';
