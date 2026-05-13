-- Require chat thread membership before a user can join a communication room
-- attached to a private Chi'lly Chat thread.
CREATE OR REPLACE FUNCTION public.communication_room_join_allowed(target_room_id text, joining_user_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  WITH normalized AS (
    SELECT
      upper(trim(coalesce(target_room_id, ''))) AS room_id,
      trim(coalesce(joining_user_id, '')) AS user_id
  ),
  active_members AS (
    SELECT count(*)::int AS count
    FROM public.communication_room_memberships membership
    JOIN normalized ON membership.room_id = normalized.room_id
    WHERE membership.membership_state IN ('active', 'reconnecting')
      AND membership.last_seen_at >= now() - interval '25 seconds'
      AND membership.user_id <> normalized.user_id
  ),
  attached_chat_thread AS (
    SELECT thread.id
    FROM public.chat_threads thread
    JOIN normalized ON thread.active_communication_room_id = normalized.room_id
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.communication_rooms room
    JOIN normalized ON room.room_id = normalized.room_id
    WHERE normalized.user_id <> ''
      AND room.status = 'active'
      AND (
        room.host_user_id = normalized.user_id
        OR (SELECT count FROM active_members) < 4
      )
      AND (
        NOT EXISTS (SELECT 1 FROM attached_chat_thread)
        OR EXISTS (
          SELECT 1
          FROM public.chat_thread_members member
          JOIN attached_chat_thread ON attached_chat_thread.id = member.thread_id
          WHERE member.user_id = normalized.user_id
        )
      )
  );
$function$;

COMMENT ON FUNCTION public.communication_room_join_allowed(text, text)
IS 'Allows active communication room joins while requiring chat thread membership for rooms attached to private chat threads.';

GRANT EXECUTE ON FUNCTION public.communication_room_join_allowed(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.communication_room_join_allowed(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.communication_room_join_allowed(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.communication_room_join_allowed(text, text) TO service_role;
