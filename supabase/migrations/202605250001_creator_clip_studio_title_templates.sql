alter table public."creator_clip_edits"
  drop constraint if exists "creator_clip_edits_overlay_style_check";

alter table public."creator_clip_edits"
  add constraint "creator_clip_edits_overlay_style_check"
  check ("title_overlay_style" in ('clean', 'bold', 'spotlight', 'trailer'));

alter table public."creator_clip_edits"
  drop constraint if exists "creator_clip_edits_title_overlay_text_length_check";

alter table public."creator_clip_edits"
  add constraint "creator_clip_edits_title_overlay_text_length_check"
  check ("title_overlay_text" is null or char_length(btrim("title_overlay_text")) <= 80)
  not valid;

alter table public."creator_clip_edits"
  drop constraint if exists "creator_clip_edits_title_overlay_subtitle_length_check";

alter table public."creator_clip_edits"
  add constraint "creator_clip_edits_title_overlay_subtitle_length_check"
  check ("title_overlay_subtitle" is null or char_length(btrim("title_overlay_subtitle")) <= 140)
  not valid;

comment on column public."creator_clip_edits"."title_overlay_style" is
  'Title card preview style metadata. Public display stays deferred unless a safe public renderer explicitly reads it.';

comment on column public."creator_clip_edits"."template_preset" is
  'Template preset metadata for editor preview and owner library display. It does not create transitions, audio sync, timeline effects, or video export.';
