import { makeFixture, read, table, sqlPolicy, sqlFunction, ids, sessionId } from './studio-authority-fixture.mjs';
export { ids, sessionId };
export const collectionMigration = 'supabase/migrations/20261020233652_user_collection_revision_authority.sql';
export async function makeCollectionFixture() {
  const fixture = await makeFixture();
  const { db } = fixture;
  const baseline = 'supabase/migrations/202604190004_baseline_current_schema_truth.sql';
  await db.exec("set time zone 'UTC'; create schema private;");
  for (const name of ['user_list', 'watch_history']) {
    await db.exec(table(baseline, name));
    await db.exec(`alter table public.${name} add primary key(user_id,title_id);
      alter table public.${name} add foreign key(user_id) references auth.users(id) on delete cascade;
      alter table public.${name} enable row level security;
      grant select,insert,update,delete,truncate,references,trigger on public.${name} to anon,authenticated;`);
    for (const action of ['select', 'insert', 'update', 'delete']) {
      await db.exec(sqlPolicy(baseline, `${name}_owner_${action}`));
    }
  }
  await db.exec(sqlFunction('supabase/migrations/202608250001_chilly_chat_room_authority_closure.sql', 'whole_app_exact_current_session_authority'));
  // Also retain an already-present stricter live policy; the migration must not
  // replace, drop or broaden it while introducing SECURITY DEFINER RPCs.
  for (const name of ['user_list', 'watch_history']) {
    await db.exec(`create policy fixture_exact_session on public.${name} as restrictive for all to authenticated
      using(public.whole_app_exact_current_session_authority())
      with check(public.whole_app_exact_current_session_authority());`);
  }
  const policiesBefore = (await db.query("select schemaname,tablename,policyname,qual,with_check from pg_policies where tablename in ('user_list','watch_history') order by tablename,policyname")).rows;
  await db.exec(read(collectionMigration));
  const mutate = async (actor, collection, title, operation, revision, value) => (
    (await fixture.user(actor, 'select public.mutate_my_collection_state($1,$2,$3::uuid,$4,$5::jsonb) result',
      [collection, title, operation, revision, value === null ? null : JSON.stringify(value)])).rows[0].result
  );
  const snapshot = async (actor, collection, cursor = '', limit = 200) => (
    (await fixture.user(actor, 'select * from public.read_my_collection_state($1,$2,$3)', [collection, cursor, limit])).rows
  );
  return { ...fixture, mutate, snapshot, policiesBefore };
}
