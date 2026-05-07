revoke all on function public.record_creator_video_upload_usage(text) from public;
revoke all on function public.record_creator_video_upload_usage(text) from "anon";
grant execute on function public.record_creator_video_upload_usage(text) to "authenticated";
