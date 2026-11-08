-- Last statement bundle, in the SAME explicit install transaction.
set local role receipt_router_v1_owner;
revoke all on all tables in schema receipt_router_v1 from public,anon,authenticated,service_role;
revoke all on all sequences in schema receipt_router_v1 from public,anon,authenticated,service_role;
revoke all on all functions in schema receipt_router_v1 from public,anon,authenticated,service_role;
revoke create on schema receipt_router_v1 from postgres;
reset role;
grant receipt_router_v1_owner to postgres with inherit false,set false;
-- Installer administration remains; no runtime SET/inheritance, no enabled
-- connection, no worker activation, no legacy hold enforcement or projection.
