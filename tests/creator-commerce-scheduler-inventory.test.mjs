import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const inventoryPath = path.resolve('config/autonomy/autonomous-components.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const schedulers = [
  ['google_play_external_transaction_reporter', 'supabase/migrations/20261030165642_google_external_transaction_reporting.sql'],
  ['creator_auction_lifecycle_scheduler', 'supabase/migrations/20261030182836_creator_auction_lifecycle_notifications.sql'],
];

function runGuard(candidate) {
  const source = fs.readFileSync('scripts/guard-autonomous-component-inventory.mjs', 'utf8')
    .replace(/^import .*;\n/gmu, '');
  let stderr = '';
  const interceptedFs = { ...fs, readFileSync: (file, ...args) => path.resolve(file) === inventoryPath
    ? JSON.stringify(candidate) : fs.readFileSync(file, ...args) };
  try {
    new Function('fs', 'path', 'process', source)(interceptedFs, path, {
      cwd: () => process.cwd(), stdout: { write() {} }, stderr: { write(text) { stderr += text; } },
      exit(code) { throw new Error(`guard_exit_${code}`); },
    });
    return { ok: true, stderr };
  } catch (error) {
    if (error.message !== 'guard_exit_1') throw error;
    return { ok: false, stderr };
  }
}

test('commerce schedulers have separate source-only ownership and explicit activation boundaries', () => {
  for (const [id, migration] of schedulers) {
    const owners = inventory.components.filter(component => component.paths.includes(migration));
    assert.equal(owners.length, 1);
    const component = owners[0];
    assert.equal(component.id, id);
    assert.equal(component.owningSystem, 'money_flow_control');
    assert.equal(component.componentType, 'foundation_only_off');
    assert.equal(component.deploymentState, 'foundation_only_off');
    assert.equal(component.approvalLevel, 4);
    assert.match(component.schedulerCadence, /^none installed; owner-only configuration/);
    assert.ok(component.forbiddenScope.includes('silent activation'));
    assert.match(component.killSwitch, /private\.disable_/);
    for (const proof of component.proof.split(/, | and /u)) assert.ok(fs.existsSync(proof), proof);
    const sql = fs.readFileSync(migration, 'utf8');
    assert.match(sql, /cron\.schedule\(/u);
    assert.match(sql, /revoke all on function private\.configure_/u);
  }
  assert.deepEqual(runGuard(inventory), { ok: true, stderr: '' });
});

test('actual inventory guard rejects each missing commerce scheduler registration', () => {
  for (const [id, migration] of schedulers) {
    const changed = structuredClone(inventory);
    changed.components = changed.components.filter(component => component.id !== id);
    const result = runGuard(changed);
    assert.equal(result.ok, false);
    assert.ok(result.stderr.includes(`orphan_database_scheduler:${migration}`), result.stderr);
  }
});
