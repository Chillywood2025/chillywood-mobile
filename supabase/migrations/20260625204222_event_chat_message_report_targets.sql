alter table public."safety_reports"
  drop constraint if exists "safety_reports_target_type_check";

alter table public."safety_reports"
  add constraint "safety_reports_target_type_check"
  check (
    "target_type" in (
      'participant',
      'room',
      'title',
      'creator_video',
      'profile_post',
      'profile_post_comment',
      'profile_media',
      'creator_video_comment',
      'social_attachment',
      'event',
      'chat_message'
    )
  );

comment on constraint "safety_reports_target_type_check" on public."safety_reports" is
  'Allowlisted safety report targets. Event reports target creator_events rows and chat_message reports target exact chat_messages rows; report submission does not delete, hide, ban, or notify reported users.';
