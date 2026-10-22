begin;
select plan(8);

select is((select relreplident::text from pg_class where oid='public.chat_messages'::regclass),
  'f', 'chat message deletes retain non-PK thread routing data');
select is((select relreplident::text from pg_class where oid='public.watch_party_room_messages'::regclass),
  'f', 'party message deletes retain non-PK party routing data');
select ok((select relrowsecurity from pg_class where oid='public.chat_messages'::regclass),
  'chat message RLS remains enabled');
select ok((select relrowsecurity from pg_class where oid='public.watch_party_room_messages'::regclass),
  'party message RLS remains enabled');
select is((select count(*)::integer from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' and tablename in ('chat_messages','watch_party_room_messages')),2,
  'both messages retain their existing publication membership');

-- Test routing input only, without inserting/deleting product rows. The
-- managed decoder applies this filter before RLS strips old DELETE output.
with inputs as (
  select jsonb_populate_record(null::realtime.wal_column,
    '{"name":"id","type_name":"text","value":"synthetic-message","is_pkey":true,"is_selectable":true}') id,
  jsonb_populate_record(null::realtime.wal_column,
    '{"name":"thread_id","type_name":"text","value":"synthetic-room","is_pkey":false,"is_selectable":true}') thread_id,
  jsonb_populate_record(null::realtime.user_defined_filter,
    '{"column_name":"thread_id","op":"eq","value":"synthetic-room","negate":false}') thread_filter
)
select ok(not realtime.is_visible_through_filters(array[id],array[thread_filter])
  and realtime.is_visible_through_filters(array[id,thread_id],array[thread_filter]),
  'only the full chat-message identity supplies the non-PK thread filter') from inputs;

with inputs as (
  select jsonb_populate_record(null::realtime.wal_column,
    '{"name":"id","type_name":"text","value":"synthetic-message","is_pkey":true,"is_selectable":true}') id,
  jsonb_populate_record(null::realtime.wal_column,
    '{"name":"party_id","type_name":"text","value":"synthetic-room","is_pkey":false,"is_selectable":true}') party_id,
  jsonb_populate_record(null::realtime.user_defined_filter,
    '{"column_name":"party_id","op":"eq","value":"synthetic-room","negate":false}') party_filter
)
select ok(not realtime.is_visible_through_filters(array[id],array[party_filter])
  and realtime.is_visible_through_filters(array[id,party_id],array[party_filter]),
  'only the full party-message identity supplies the non-PK party filter') from inputs;

select is((select count(*)::integer from pg_constraint c join pg_attribute a
  on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='p' and c.conrelid in ('public.chat_messages'::regclass,'public.watch_party_room_messages'::regclass)
  and a.attname in ('thread_id','party_id')),0,
  'routing fields are still absent from the message primary keys');
select * from finish();
rollback;
