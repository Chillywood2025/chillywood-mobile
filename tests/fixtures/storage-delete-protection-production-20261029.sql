-- Captured managed Storage metadata, 2026-10-29; synthetic local fixture only.
-- Capture SHA256: 5ab9417baf6b3551918c7990e5b7841f692442f794ca18fab465980658409912
-- Function definition MD5: 4371ae544fb1ef704f9c5d42265ac324
-- Exact source body and statement trigger; owner and effective default ACL checked by runner.
-- Never enables storage.allow_delete_query or changes application row fences.
CREATE OR REPLACE FUNCTION storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$
;
alter function storage.protect_delete() owner to supabase_storage_admin;
CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
