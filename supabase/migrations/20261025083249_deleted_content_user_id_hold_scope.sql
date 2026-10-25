-- Match the existing Legal Evidence API's user_id scope to its exact owner.
-- This forward-only correction never changes or releases a legal hold.
-- Malformed or missing identity remains held; other/unknown scopes retain
-- their prior behavior. CREATE OR REPLACE preserves the existing owner/ACL.
create or replace function private.deleted_content_hold_matches(
 h_type text,h_id text,t_type text,t_id text,a text,parent_type text,parent_id text
) returns boolean language sql immutable set search_path='' as $$
 select case
   when h_type='user_id' then case
     when h_id ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
       and a ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
       then h_id::uuid=a::uuid
     else true end
   when h_type in ('user','account','user_profile') then h_id=a
   when h_type in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message',
     'watch_party_room_message','creator_video','video','social_attachment','platform_brand_asset') then
      (replace(replace(h_type,'watch_party_room_message','room_message'),'creator_video','video')=
       replace(replace(t_type,'watch_party_room_message','room_message'),'creator_video','video') and h_id=t_id)
      or (replace(replace(h_type,'watch_party_room_message','room_message'),'creator_video','video')=
          replace(replace(parent_type,'watch_party_room_message','room_message'),'creator_video','video') and h_id=parent_id)
   -- An unrecognized legal scope cannot safely be declared irrelevant.
   else true end
$$;
