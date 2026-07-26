-- Hosted scheduler dependencies for the bounded terminal call-delivery worker.
-- The worker remains fail-closed until configure_chilly_chat_call_transition_retry
-- is invoked after its Edge Function is deployed.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
