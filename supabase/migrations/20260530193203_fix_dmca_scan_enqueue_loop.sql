-- Prevent DMCA manual-review scan outcomes from re-queuing themselves.
-- The scanner worker only claims rows explicitly queued as pending_scan.

create or replace function public."enqueue_dmca_attachment_scan"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."scan_status" = 'pending_scan' then
    perform public."enqueue_media_scan_job"(
      'dmca_attachments',
      'evidence',
      new."id"::text,
      new."submitted_by_user_id",
      'supabase',
      new."bucket_id",
      new."object_path",
      new."mime_type",
      new."size_bytes",
      5,
      jsonb_build_object('dmcaCaseId', new."dmca_case_id")
    );
  end if;
  return new;
end;
$$;

comment on function public."enqueue_dmca_attachment_scan"() is
  'Queues private DMCA evidence attachments for malware scanning only when scan_status is pending_scan.';
