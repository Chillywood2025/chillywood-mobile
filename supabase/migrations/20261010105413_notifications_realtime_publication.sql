-- Notification rows remain protected by their existing owner SELECT/UPDATE
-- policies. Clients subscribe only to exact-user INSERT and UPDATE hints and
-- reread durable state; no grants, RLS or replica identity change is required.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Operational rollback, if separately authorized, is a forward migration:
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
-- The stored notification rows and owner policies are unaffected by removal.
