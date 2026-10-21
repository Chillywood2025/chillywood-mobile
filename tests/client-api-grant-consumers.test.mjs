import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {assertClientGrantCoverage, discoverClientGrantConsumers, readClientSources} from './helpers/client-api-grant-consumers.mjs';

const inventory = JSON.parse(fs.readFileSync(new URL('fixtures/explicit-api-client-operations.json', import.meta.url), 'utf8'));
const fixture = [{table: 'known_table', privileges: ['SELECT'], consumers: ['app/probe.ts', '_lib/platformFinance.ts', '_lib/moneyAuditEvents.ts']
  .map(file => ({file, privileges: ['SELECT']}))}];
const discover = entries => discoverClientGrantConsumers(new Map(entries));
const check = entries => assertClientGrantCoverage(discover(entries), fixture);

test('current client calls stay covered by the fresh-schema grant inventory', () => {
  const consumers = discoverClientGrantConsumers(readClientSources(fileURLToPath(new URL('../', import.meta.url))));
  assertClientGrantCoverage(consumers, inventory);
  // Keep source attribution honest as well as guarding additions. This is
  // semantic table/operation coverage, not a source-file hash checkpoint.
  const actual = new Map();
  for (const {table, privileges, file} of consumers) {
    const row = actual.get(table) ?? {table, privileges: new Set(), consumers: new Map()};
    for (const privilege of privileges) row.privileges.add(privilege);
    row.consumers.set(file, new Set([...(row.consumers.get(file) ?? []), ...privileges]));
    actual.set(table, row);
  }
  assert.deepEqual([...actual.values()].map(row => ({table: row.table,
    privileges: [...row.privileges].sort(), consumers: [...row.consumers].sort(([a], [b]) => a.localeCompare(b))
      .map(([file, privileges]) => ({file, privileges: [...privileges].sort()}))})).sort((a, b) => a.table.localeCompare(b.table)), inventory);
});

test('literal, local and imported alias constants resolve without tracking unrelated edits', () => {
  check([
    ['_lib/tables.ts', 'export const TABLE = "known_table" as const;'],
    ['app/probe.ts', `import {TABLE as imported} from '../_lib/tables';
      const local = imported;
      client.from(local).select('id');
      client.from('known_table').select('*');
      const unrelated = 'new_table'; Array.from([unrelated]);
      supabase.storage.from('unclassified_bucket').upload('key', payload);`],
  ]);
});

test('new literal and changed imported table constants fail with the source location', () => {
  assert.throws(() => check([['app/probe.ts', "client.from('new_table').select('*')"]]), /app\/probe.ts:1: new_table SELECT is not covered/u);
  assert.throws(() => check([
    ['_lib/tables.ts', 'export const TABLE = "new_table";'],
    ['app/probe.ts', "import {TABLE} from '@/_lib/tables'; client.from(TABLE).select('*');"],
  ]), /new_table SELECT is not covered/u);
});

test('a new write operation cannot hide behind an already reviewed SELECT', () => {
  for (const [operation, expected] of [['insert', 'INSERT'], ['update', 'UPDATE'], ['delete', 'DELETE'], ['upsert', 'INSERT, UPDATE']]) {
    assert.throws(() => check([['app/probe.ts', `client.from('known_table').${operation}({}).select('*');`]]),
      error => error.message.includes(`known_table ${expected} is not covered`));
  }
  const otherFileWrites = structuredClone(fixture);
  otherFileWrites[0].privileges.push('DELETE');
  otherFileWrites[0].consumers[1].privileges.push('DELETE');
  assert.throws(() => assertClientGrantCoverage(discover([['app/probe.ts', "client.from('known_table').delete();"]]), otherFileWrites),
    /known_table DELETE is not covered/u, 'another file using DELETE does not approve a new write consumer');
});

test('closed wrappers expand their actual callers and finite array/object source lists', () => {
  const finance = `async function readTableCount(table: string) { return client.from(table).select('id'); }
    readTableCount('known_table');`;
  check([['_lib/platformFinance.ts', finance]]);
  assert.throws(() => check([['_lib/platformFinance.ts', `${finance}\nreadTableCount('new_table');`]]), /new_table SELECT is not covered/u);
  assert.throws(() => check([['_lib/platformFinance.ts', finance.replace(".select('id')", ".delete().eq('id', 1)")]]), /known_table DELETE is not covered/u);
  const audit = `const TABLES = ['known_table'] as const;
    const SOURCES = [{table: 'known_table', creatorColumn: 'creator_id'}];
    const readSourceRows = (table: string) => client.from(table).select('*');
    TABLES.map(table => readSourceRows(table));
    SOURCES.map(source => readSourceRows(source.table));`;
  check([['_lib/moneyAuditEvents.ts', audit]]);
  assert.throws(() => check([['_lib/moneyAuditEvents.ts', audit.replace("table: 'known_table'", "table: 'new_table'")]]), /new_table SELECT is not covered/u);
  assert.throws(() => check([['_lib/moneyAuditEvents.ts', audit.replace("['known_table']", "['known_table', 'new_table']")]]), /new_table SELECT is not covered/u);
});

test('unresolved dynamic boundaries, escaped wrappers and shadowed constants fail closed', () => {
  for (const source of [
    'client.from(input.table).select("*");',
    'const table = getTable(); client.from(table).select("*");',
    'const table = "known_table"; function read(table: string) { return client.from(table).select("*"); }',
    'const query = client.from("known_table"); query.select("*");',
    'client["from"]("new_table").delete();',
    'const method = "from"; client[method]("new_table").delete();',
    'const {from: read} = client; read("new_table").delete();',
    'const read = client.from; read("new_table").select("*");',
    'const Array = client; Array.from("new_table").delete();',
    'client.storage.from("new_table").delete();',
    'client.schema("private").from("known_table").select("*");',
    'const privateClient = client.schema("private"); privateClient.from("known_table").select("*");',
  ]) assert.throws(() => check([['app/probe.ts', source]]), /[Uu]nclassified client Data API/u);
  assert.throws(() => check([['_lib/platformFinance.ts', `function readTableCount(table: string) { return client.from(table).select('*'); }
    const alias = readTableCount; alias('known_table');`]]), /wrapper escapes direct calls/u);
  assert.throws(() => check([['_lib/platformFinance.ts', `export function readTableCount(table: string) { return client.from(table).select('*'); }
    readTableCount('known_table');`]]), /wrapper is exported/u);
});

test('discovery includes new TS, TSX, JS, JSX, MJS and CJS client files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-api-source-discovery-'));
  try {
    for (const directory of ['_lib', 'app', 'components', 'constants', 'hooks', 'modules']) fs.mkdirSync(path.join(root, directory));
    for (const extension of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']) {
      fs.writeFileSync(path.join(root, 'app', `new-consumer.${extension}`), "client.from('new_table').select('*');");
    }
    const consumers = discoverClientGrantConsumers(readClientSources(root));
    assert.equal(consumers.length, 6);
    assert.throws(() => assertClientGrantCoverage(consumers, fixture), /new_table SELECT is not covered/u);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('computed schema and method boundaries fail closed without rejecting ordinary computed calls', () => {
  for (const source of [
    `client['schema']('private').from('known_table').select('*');`,
    `const schema = 'sch' + 'ema'; client[schema]('private').from('known_table').select('*');`,
    `const method = 'fr' + 'om'; client[method]('new_table').select('*');`,
    `const method = getMethod(); client[method]('new_table').select('*');`,
    `const method = getMethod(); const scoped = client[method]('private'); scoped.from('known_table').select('*');`,
    `const method = getMethod(); const query = client[method]('new_table'); query.select('*');`,
    `const method = getMethod(); const query = client[method]('new_table'); const alias = query; alias.select('*');`,
    `const {schema: scope} = client; const scoped = scope('private'); scoped.from('known_table').select('*');`,
    `const {['sch' + 'ema']: scope} = client; scope('private').from('known_table').select('*');`,
    `const scope = client.schema; scope('private').from('known_table').select('*');`,
    `const scope = client.schema.bind(client); scope('private').from('known_table').select('*');`,
    `const method = 'del' + 'ete'; client.from('known_table').select('*')[method]();`,
  ]) assert.throws(() => check([['app/probe.ts', source]]), /unclassified client Data API boundary/u, source);
  check([['app/probe.ts', `const method = getMethod(); formatters[method]('ordinary text');
    const label = 'tit' + 'le'; labels[label];
    client.schema('public').from('known_table').select('*');`]]);
});

test('finite table sources and wrapper parameters cannot be mutated behind the audit', () => {
  for (const body of [
    `const TABLES = ['known_table']; TABLES.push('new_table'); TABLES.map(table => readSourceRows(table));`,
    `const SOURCE = {table: 'known_table'}; SOURCE.table = 'new_table'; readSourceRows(SOURCE.table);`,
    `const TABLES = ['known_table']; mutate(TABLES); TABLES.map(table => readSourceRows(table));`,
    `['known_table'].map(table => { table = 'new_table'; return readSourceRows(table); });`,
    `[{table: 'known_table'}].map(source => { mutate(source); return readSourceRows(source.table); });`,
  ]) assert.throws(() => check([['_lib/moneyAuditEvents.ts',
    `const readSourceRows = (table: string) => client.from(table).select('*'); ${body}`]]), /mutated|escapes reviewed reads/u);
  assert.throws(() => check([['_lib/platformFinance.ts', `function readTableCount(table: string) {
    table = 'new_table'; return client.from(table).select('*'); } readTableCount('known_table');`]]), /mutated/u);
});
