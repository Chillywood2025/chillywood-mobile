import assert from 'node:assert/strict';
import {splitSQL} from './database-runtime-authority-fixture.mjs';

// Supabase CLI sends migration statements independently. Do not supply an
// outer test transaction that hides a missing migration-owned lock scope.
export async function applyBrandMigrationStatements(db, sql) {
  const statements = splitSQL(sql);
  assert.equal(statements[0].trim().toLowerCase(), 'begin;');
  assert.equal(statements.at(-1).trim().toLowerCase(), 'commit;');
  for (const statement of statements) await db.exec(statement);
}
