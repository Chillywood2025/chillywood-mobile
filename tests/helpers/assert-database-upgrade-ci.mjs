import assert from 'node:assert/strict';

// A predecessor-only reset is not full schema replay. Every existing native
// gate must retain this complete sequence before claiming latest-schema proof.
export const databaseUpgradeCommands = [
  'supabase start',
  'supabase db reset --local --version 20261031204321',
  'SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-chat-activity-upgrade-postgres.mjs',
  'supabase migration up --local',
  'supabase test db',
];
export function assertDatabaseUpgradeCI(run) {
  const lines = run.split('\n');
  let previous = -1;
  for (const command of databaseUpgradeCommands) {
    assert.equal(lines.filter(line => line === command).length,1,`${command} executes exactly once without swallowing failure`);
    const position = lines.indexOf(command);
    assert.ok(position > previous,'predecessor reset -> populated upgrade -> latest migrations -> full pgTAP');
    previous = position;
  }
}
