import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const runners = ['scripts/test-room-seat-auction-concurrency-postgres.mjs',
  'scripts/test-auction-transfer-concurrency-postgres.mjs'];

function rpcFromSource(file, query) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'rpc') declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(declarations.length, 1, 'execute the one actual runner RPC closure');
  const initializer = declarations[0].initializer.getText(ast);
  // Substitute only psql transport and transaction/identity framing. The exact
  // production runner expression conversion and JSON parser execute unchanged.
  return new Function('query', 'call', `return ${initializer};`)(query,
    (_who, expression) => `select (${expression})::text as wire`);
}

test('native room and transfer runner RPCs serialize real PostgreSQL composites without changing JSON/scalars', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create type room_member_fixture as (party_id text, display_name text, seat_role text, optional_note text);
      create function joined_member_fixture() returns setof room_member_fixture language sql as
      $$select row('RACE-CAPACITY','Name, "quoted"','listener',null)::room_member_fixture$$;`);
    const cases = [
      ['joined_member_fixture()', {party_id: 'RACE-CAPACITY', display_name: 'Name, "quoted"', seat_role: 'listener', optional_note: null}],
      [`'{"id":"auction","financialAuthority":false}'::jsonb`, {id: 'auction', financialAuthority: false}],
      [`'[{"lease":"exact"}]'::jsonb`, [{lease: 'exact'}]],
      ['false', false], ['7', 7], ["'null'::jsonb", null],
    ];
    for (const file of runners) for (const [expression, expected] of cases) {
      let captured;
      rpcFromSource(file, sql => { captured = sql; return 'null'; })('fixture', expression);
      const {rows: [{wire}]} = await db.query(captured);
      assert.equal(typeof wire, 'string', `${file}: SQL must produce JSON wire text, including null`);
      const actual = rpcFromSource(file, sql => { assert.equal(sql, captured); return wire; })('fixture', expression);
      assert.deepEqual(actual, expected, `${file}: ${expression}`);
    }
    const raw = (await db.query('select joined_member_fixture()::text as wire')).rows[0].wire;
    assert.match(raw, /^\(RACE-CAPACITY,/u);
    assert.throws(() => JSON.parse(raw), SyntaxError, 'old raw composite transport reproduces the CI failure');
    for (const file of runners) {
      assert.throws(() => rpcFromSource(file, () => '')('fixture', 'null::jsonb'), SyntaxError,
        'missing SQL result stays fail-closed instead of becoming a successful object');
    }
  } finally { await db.close(); }
});

test('native transfer fixture executes its void binder without inventing JSON or swallowing SQL errors', async () => {
  const file = runners[1], source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const binders = [];
  const visit = node => {
    if (ts.isExpressionStatement(node) && node.getText(ast).includes('public.bind_creator_room_auction_checkout(')) binders.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(binders.length, 1);
  const statement = binders[0].getText(ast);
  assert.match(statement, /^query\(service\(/u);
  const execute = query => new Function('query', 'service', 'quote', 'attempt', 'name', statement)(query,
    expression => `select ${expression}`, {id: 'fixture-quote'}, 'fixture-attempt', 'fixture');
  let sql;
  execute(value => { sql = value; return ''; });
  const db = new PGlite();
  try {
    await db.exec(`create function public.bind_creator_room_auction_checkout(text,text,text,text,text,integer,text)
      returns void language plpgsql as $$begin return; end$$;`);
    const wire = Object.values((await db.query(`${sql}::text`)).rows[0])[0];
    assert.equal(wire, '', 'real PostgreSQL void text cannot be JSON parsed');
    assert.throws(() => JSON.parse(wire), SyntaxError, 'former run(...) parser rejects void');
    execute(value => { assert.equal(value, sql); return wire; });
    assert.throws(() => execute(() => { throw new Error('synthetic SQL failure'); }), /synthetic SQL failure/);
  } finally { await db.close(); }
});
