import { makeFixture, read, table, sqlPolicy, sqlFunction, ids, sessionId } from './studio-authority-fixture.mjs';
import { splitSQL } from './database-runtime-authority-fixture.mjs';
export { ids, sessionId };
export const preferenceMigration = 'supabase/migrations/20261021221300_notification_preference_revision_authority.sql';
export const preferenceBaseline = 'supabase/migrations/202605120003_d9_notifications_activity_production.sql';

// Load the actual table and every additive preference schema change. This is
// shared by PGlite and independent PostgreSQL sessions; neither copies the CAS.
export function preferenceSchema() {
  const alterations = [
    '202606100001_chilly_chat_call_invites_and_ringtones.sql',
    '20260630130624_creator_money_notifications_activity.sql',
    '20261010180545_notification_activity_outbox.sql',
  ].flatMap(file => splitSQL(read(`supabase/migrations/${file}`)).filter(statement =>
    /^alter table public\."?notification_preferences"?\s/iu.test(statement.replace(/--[^\n]*/gu, '').trim())));
  return `${table(preferenceBaseline, 'notification_preferences')}
    ${alterations.join('\n')}
    ${sqlFunction(preferenceBaseline, 'touch_notification_updated_at')}
    create trigger notification_preferences_touch_updated_at before update on public.notification_preferences
      for each row execute function public.touch_notification_updated_at();
    alter table public.notification_preferences enable row level security;
    grant select,insert,update on public.notification_preferences to authenticated;
    grant all on public.notification_preferences to service_role;
    ${['select', 'insert', 'update'].map(action => sqlPolicy(preferenceBaseline, `notification_preferences_${action}_own`)).join('\n')}`;
}

export async function makePreferenceFixture() {
  const fixture = await makeFixture();
  const { db } = fixture;
  await db.exec(`set time zone 'UTC'; create schema private; alter role service_role bypassrls; ${preferenceSchema()}`);
  await db.exec('grant insert(user_id),update(push_enabled) on public.notification_preferences to anon,authenticated;');
  const policiesBefore = (await db.query("select * from pg_policies where tablename='notification_preferences' order by policyname")).rows;
  await db.exec(read(preferenceMigration));
  const snapshot = async actor => (await fixture.user(actor,
    'select public.read_my_notification_preferences() result')).rows[0].result;
  const mutate = async (actor, operation, incarnation, revision, patch) => (await fixture.user(actor,
    'select public.mutate_my_notification_preferences($1::uuid,$2::uuid,$3,$4::jsonb) result',
    [operation, incarnation, revision, patch === null ? null : JSON.stringify(patch)])).rows[0].result;
  return { ...fixture, snapshot, mutate, policiesBefore };
}
