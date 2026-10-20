// Real Auth/PostgREST/PG qualification against the canonical runner's GENERATED
// DATABASE CLONE. The user's local stack is inspected read-only. Newly created
// HTTP sidecars point only at the clone and are removed before it is dropped.
// No provider actions, mocked authority, trigger bypass, or remote endpoints.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {execFileSync} from 'node:child_process';
import {createHmac, randomBytes, randomUUID, webcrypto} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const authorityFile = 'supabase/functions/_shared/exact-subject-authority.ts';
const mediaFile = 'supabase/functions/media-storage/index.ts';
const controlsFile = 'supabase/functions/admin-owner-controls/index.ts';
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const sorted = values => Array.from(values).sort();
const redact = value => String(value)
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, '[redacted JWT]')
  .replace(/[A-Za-z0-9_=-]{40,}/gu, '[redacted]')
  .replace(/(?:https?|postgres(?:ql)?):\/\/\S+/gu, '[redacted URL]');

function syntax(file) {
  return ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

// Production declarations and all their local dependencies execute unchanged.
// Every used import must be supplied with the actual module/SDK; no fallback
// empty module or substitute permission/authentication outcome is permitted.
export function declarations(file, names, imports = {}, {entryGuards = []} = {}) {
  const ast = syntax(file), available = new Map(), imported = new Map();
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) available.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        assert.ok(ts.isIdentifier(declaration.name), `${file}: exact top-level declaration name required`);
        available.set(declaration.name.text, statement);
      }
    }
    if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly) {
      const bindings = statement.importClause.namedBindings;
      if (bindings) {
        assert.ok(ts.isNamedImports(bindings), `${file}: explicitly support any new namespace import`);
        for (const item of bindings.elements) if (!item.isTypeOnly) {
          imported.set(item.name.text, {module: statement.moduleSpecifier.text, name: item.propertyName?.text ?? item.name.text});
        }
      }
      assert.equal(statement.importClause.name, undefined, `${file}: explicitly support any new default import`);
    }
  }
  // For mutating canary/intake entrypoints execute their exact first denying
  // guard only. true means that guard allowed entry, NOT that the action ran.
  for (const name of entryGuards) {
    const statement = available.get(name);
    assert.ok(statement && ts.isVariableStatement(statement), `${file}:${name}: exact entry declaration required`);
    const entry = statement.declarationList.declarations.find(item => item.name.getText(ast) === name)?.initializer;
    assert.ok(entry && ts.isArrowFunction(entry) && ts.isBlock(entry.body), `${file}:${name}: explicit block required`);
    const guard = entry.body.statements[0];
    assert.ok(ts.isIfStatement(guard) && ts.isReturnStatement(guard.thenStatement) && !guard.elseStatement,
      `${file}:${name}: initial denying guard required`);
    assert.match(guard.expression.getText(ast), /^!hasAnyPermission\(user,/u, `${file}:${name}: actual permission predicate`);
    const extracted = ts.createSourceFile(file,
      `const ${name}=async (${entry.parameters.map(item => item.getText(ast)).join(',')})=>{${guard.getText(ast)}return true;};`,
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    available.set(name, extracted.statements[0]);
  }
  const selected = new Set(), usedImports = new Map();
  function visit(node) {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (available.has(name) && !selected.has(name)) {
        selected.add(name); visit(available.get(name));
      } else if (imported.has(name)) usedImports.set(name, imported.get(name));
    }
    ts.forEachChild(node, visit);
  }
  for (const name of names) {
    assert.ok(available.has(name), `${file}: missing production declaration ${name}`);
    if (!selected.has(name)) { selected.add(name); visit(available.get(name)); }
  }
  const bindings = {};
  for (const [name, item] of usedImports) {
    assert.ok(Object.hasOwn(imports, item.module), `${file}: unprovided actual import ${item.module}`);
    assert.ok(Object.hasOwn(imports[item.module], item.name), `${file}: missing actual import ${item.name}`);
    bindings[name] = imports[item.module][item.name];
  }
  const chosen = new Set([...selected].map(name => available.get(name)));
  const statements = [...ast.statements.filter(statement => chosen.has(statement)),
    ...[...chosen].filter(statement => !ast.statements.includes(statement))];
  const compiled = ts.transpileModule(`${statements.map(statement => statement.getText()).join('\n')}
Object.assign(exports,{${names.join(',')}});`, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true},
  });
  assert.equal(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length ?? 0, 0,
    `${file}: extracted production source must compile`);
  const module = {exports: {}};
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, ...bindings,
    Date, Set, Map, URL, Request, Response, Headers, TextEncoder, TextDecoder,
    crypto: webcrypto, console, setTimeout, clearTimeout,
    require(name) { throw new Error(`${file}: unprovided runtime dependency ${name}`); },
  }, {filename: file});
  return module.exports;
}

function callerScopes(name) {
  const ast = syntax(mediaFile), matches = [];
  const declaration = ast.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(item => item.name.getText(ast) === name);
  assert.ok(declaration, `actual media caller ${name} required`);
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'userHasScopedStaffPermission') {
      const keys = node.arguments[2];
      assert.ok(keys && ts.isArrayLiteralExpression(keys) && keys.elements.every(ts.isStringLiteral),
        `${name}: exact production scope array required`);
      matches.push(keys.elements.map(item => item.text));
    }
    ts.forEachChild(node, visit);
  }
  visit(declaration);
  assert.ok(matches.length > 0, `${name}: actual scoped predicate must remain wired`);
  assert.ok(matches.every(keys => JSON.stringify(keys) === JSON.stringify(matches[0])), `${name}: qualify any new distinct scope`);
  return matches[0];
}

export function loadExactSubjectAuthorityCallers() {
  const authority = declarations(authorityFile, [
    'readExactPermissionKeys', 'readExactPlatformRole', 'readExactCurrentSessionAuthority', 'readExactBreakGlassSessionId',
  ]);
  const imports = {'npm:@supabase/supabase-js@2': {createClient}, '../_shared/exact-subject-authority.ts': authority};
  const paging = declarations('supabase/functions/_shared/admin-history-pagination.ts', ['readHistoryPage', 'readMergedHistoryPage']);
  const controls = declarations(controlsFile, [
    'authenticate', 'hasPermission', 'hasAnyPermission', 'legalRequestList', 'auditList', 'canaryList',
    'legalRequestCreate', 'canaryRun',
  ], {...imports, '../_shared/admin-history-pagination.ts': paging}, {entryGuards: ['legalRequestCreate', 'canaryRun']});
  const media = declarations(mediaFile, ['userCanUsePremiumCreatorTools', 'userHasScopedStaffPermission', 'ownerMediaBlockedForStaff'], imports);
  const legal = declarations('supabase/functions/admin-legal-evidence/index.ts',
    ['authenticate', 'hasPermission', 'hasAnyPermission', 'canReleaseHold', 'resolveLegalReason'], imports);
  const liveOps = declarations('supabase/functions/admin-live-ops-fix-center/index.ts', ['authenticate'], imports);
  const liveCost = declarations('supabase/functions/_shared/live-cost-guard.ts', ['userHasLiveCostGuardRole'], {
    './exact-subject-authority.ts': authority,
  });
  const scopes = Object.fromEntries([
    'canReadCreatorVideo', 'canReadSocialAttachment', 'canDeleteCreatorVideo', 'canDeleteSocialAttachment',
  ].map(name => [name, callerScopes(name)]));
  return {authority, controls, media, legal, liveOps, liveCost, scopes};
}

// Launch only generated HTTP sidecars. Their DB URI is rebuilt to name the
// generated clone explicitly, never the source database or an environment URL.
export async function withCloneHttp({container, database}, run) {
  assert.match(database, /^runtime_authority_[0-9]+_[a-f0-9]{12}$/u, 'canonical generated clone name required');
  const project = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
    .match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"\s*(?:#.*)?$/mu)?.[1];
  assert.ok(project);
  assert.equal(container, `supabase_db_${project}`, 'exact local CLI source container required');
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//u);
  const command = (args, input) => {
    try {
      return execFileSync('docker', args, {cwd: root, input, encoding: 'utf8', timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']});
    } catch (error) {
      throw new Error(`Disposable authority HTTP container operation failed: ${redact(error.stderr ?? error.message)}`);
    }
  };
  assert.match(command(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim(),
    /^(unix|npipe):\/\//u, 'remote Docker forbidden');
  const inspect = name => JSON.parse(command(['inspect', name]))[0];
  const db = inspect(container), auth = inspect(`supabase_auth_${project}`), rest = inspect(`supabase_rest_${project}`);
  for (const item of [db, auth, rest]) {
    assert.equal(item.State.Running, true, 'source CLI services must already be running');
    assert.equal(item.Config.Labels['com.supabase.cli.project'], project, 'exact local CLI project label');
  }
  const network = `supabase_network_${project}`;
  assert.ok(db.NetworkSettings.Networks[network], 'expected local CLI database network');
  const sql = statement => command(['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', database], `set statement_timeout='15s';set timezone='UTC';${statement}`).trim();
  assert.equal(sql('select current_database();'), database, 'SQL targets only the generated clone');
  const envOf = item => Object.fromEntries(item.Config.Env.map(entry => {
    const separator = entry.indexOf('='); return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
  const authEnv = envOf(auth), restEnv = envOf(rest);
  const cloneUri = raw => {
    const uri = new URL(raw);
    assert.ok(['postgres:', 'postgresql:'].includes(uri.protocol));
    uri.hostname = container; uri.port = '5432'; uri.pathname = `/${database}`;
    uri.search = ''; uri.hash = '';
    assert.equal(uri.pathname, `/${database}`);
    return uri.toString();
  };
  // Independent ephemeral API keys belong only to these generated sidecars.
  // Do not read/reuse the user's local API keys or change any original setting.
  // Actor access tokens are subsequently issued by real GoTrue password login.
  const jwtSecret = randomBytes(48).toString('hex');
  const apiKey = role => {
    const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encoded({alg: 'HS256', typ: 'JWT'})}.${encoded({iss: 'supabase', role, iat: now, exp: now + 3600})}`;
    return `${unsigned}.${createHmac('sha256', jwtSecret).update(unsigned).digest('base64url')}`;
  };
  const credentials = {ANON_KEY: apiKey('anon'), SERVICE_ROLE_KEY: apiKey('service_role')};
  const nonce = randomUUID().replaceAll('-', ''), label = 'com.chillywood.exact-authority-fixture';
  const names = [`exact_authority_auth_${nonce}`, `exact_authority_rest_${nonce}`];
  const directory = mkdtempSync(path.join(os.tmpdir(), 'exact-authority-http-'));
  const upstreams = {};
  const gateway = http.createServer((req, res) => {
    const prefix = req.url?.startsWith('/auth/v1/') ? '/auth/v1' : req.url?.startsWith('/rest/v1/') ? '/rest/v1' : null;
    const port = prefix && upstreams[prefix];
    if (!port) { res.writeHead(404); res.end(); return; }
    const upstream = http.request({hostname: '127.0.0.1', port, path: req.url.slice(prefix.length), method: req.method,
      headers: {...req.headers, host: `127.0.0.1:${port}`}}, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.setTimeout(15_000, () => upstream.destroy(new Error('local upstream deadline')));
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  let failure;
  try {
    await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(0, '127.0.0.1', resolve); });
    const apiUrl = `http://127.0.0.1:${gateway.address().port}`;
    const environments = [{
      GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: apiUrl, GOTRUE_SITE_URL: apiUrl,
      GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: cloneUri(authEnv.GOTRUE_DB_DATABASE_URL),
      GOTRUE_JWT_SECRET: jwtSecret, GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_EXP: '3600', GOTRUE_DISABLE_SIGNUP: 'false',
      GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'true', GOTRUE_LOG_LEVEL: 'error',
    }, {
      PGRST_DB_URI: cloneUri(restEnv.PGRST_DB_URI), PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon', PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions',
      PGRST_JWT_SECRET: jwtSecret, PGRST_SERVER_PORT: '3000', PGRST_LOG_LEVEL: 'error',
    }];
    for (let i = 0; i < names.length; i++) {
      const environmentFile = path.join(directory, `sidecar-${i}.env`);
      for (const value of Object.values(environments[i])) assert.ok(!/[\r\n]/u.test(value), 'single-line generated container environment');
      writeFileSync(environmentFile, Object.entries(environments[i]).map(([key, value]) => `${key}=${value}`).join('\n'), {mode: 0o600});
      const port = i === 0 ? '9999' : '3000';
      command(['create', '--name', names[i], '--label', `${label}=${nonce}`, '--network', network, '--pull=never',
        '--publish', `127.0.0.1::${port}`, '--env-file', environmentFile, (i === 0 ? auth : rest).Config.Image]);
      command(['start', names[i]]);
      const binding = inspect(names[i]).NetworkSettings.Ports[`${port}/tcp`];
      assert.equal(binding.length, 1); assert.equal(binding[0].HostIp, '127.0.0.1');
      upstreams[i === 0 ? '/auth/v1' : '/rest/v1'] = Number(binding[0].HostPort);
    }
    const nativeFetch = globalThis.fetch;
    const deadline = Date.now() + 20_000;
    for (const route of ['/auth/v1/health', '/rest/v1/']) {
      while (true) {
        const response = await nativeFetch(`${apiUrl}${route}`, {redirect: 'error', signal: AbortSignal.timeout(5000),
          headers: {Authorization: `Bearer ${credentials.SERVICE_ROLE_KEY}`, apikey: credentials.ANON_KEY}}).catch(() => null);
        if (response?.ok) break;
        assert.ok(Date.now() < deadline, 'generated Auth/PostgREST readiness deadline'); await delay(25);
      }
    }
    await run({apiUrl, anonKey: credentials.ANON_KEY, serviceKey: credentials.SERVICE_ROLE_KEY, sql});
  } catch (error) { failure = error; }
  finally {
    const cleanup = [];
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
    for (const name of names.reverse()) {
      // Query exact generated name+nonce, including after an uncertain create.
      try {
        const ids = command(['ps', '-a', '--filter', `name=^/${name}$`, '--filter', `label=${label}=${nonce}`, '--format', '{{.ID}}']).trim();
        if (ids) {
          assert.equal(inspect(name).Config.Labels[label], nonce);
          command(['rm', '-f', name]);
        }
      } catch (error) { cleanup.push(error); }
    }
    rmSync(directory, {recursive: true, force: true});
    if (failure || cleanup.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanup], 'Disposable authority HTTP qualification failed');
  }
}

export async function runExactSubjectAuthorityHttpQualification({container, database}) {
  const source = loadExactSubjectAuthorityCallers();
  await withCloneHttp({container, database}, async connection => {
    const nativeFetch = globalThis.fetch;
    const localFetch = async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      assert.equal(url.origin, connection.apiUrl, 'authority test cannot contact another stack or provider');
      return nativeFetch(input, {...init, redirect: 'error', signal: init?.signal ?? AbortSignal.timeout(15_000)});
    };
    globalThis.fetch = localFetch;
    const options = {auth: {autoRefreshToken: false, persistSession: false}, global: {fetch: localFetch}};
    const admin = createClient(connection.apiUrl, connection.serviceKey, options);
    const independentAdmin = createClient(connection.apiUrl, connection.serviceKey, options);
    const users = [], roles = [], grants = [], clients = [];
    const grantSubjects = new Map();
    let owner, independentOwner;
    let checks = 0, primaryFailure;
    const check = (value, description) => { assert.ok(value, description); checks++; };
    const data = (result, description) => {
      assert.equal(result.error, null, `${description}: ${redact(result.error?.message ?? 'request failed')}`);
      return result.data;
    };
    const request = person => new Request(`${connection.apiUrl}/functions/v1/qualification`, {headers: {authorization: `Bearer ${person.token}`}});
    const role = async (person, name) => {
      const row = data(await admin.from('platform_role_memberships').insert({user_id: person.id, email: person.email,
        role: name, status: 'active', notes: 'Synthetic local authority qualification', granted_by: 'local-test'}).select('id').single(), 'real role insert');
      roles.push(row.id); return row.id;
    };
    const grant = async (person, key, expiresAt = null) => {
      const row = data(await owner.client.rpc('admin_grant_platform_staff_permission_by_email', {
        p_target_email: person.email, p_permission_key: key,
        p_reason: 'Synthetic local authority qualification', p_expires_at: expiresAt,
      }), 'canonical authenticated Owner grant');
      grants.push(row.id);
      assert.equal(row.userId, person.id); assert.equal(row.email, person.email);
      assert.equal(row.permissionKey, key); assert.equal(row.status, 'active');
      grantSubjects.set(row.id, {person, key});
      const stored = data(await independentAdmin.from('platform_staff_permission_grants')
        .select('target_user_id,target_email,permission_key,status,granted_by').eq('id', row.id).single(), 'committed exact grant readback');
      assert.deepEqual(stored, {target_user_id: person.id, target_email: person.email, permission_key: key, status: 'active', granted_by: owner.id});
      return row.id;
    };
    const revoke = async id => {
      const {person, key} = grantSubjects.get(id);
      const row = data(await independentOwner.rpc('admin_revoke_platform_staff_permission_by_email', {
        p_target_email: person.email, p_permission_key: key, p_reason: 'Synthetic local authority qualification revoke',
      }), 'independent authenticated Owner revoke');
      assert.equal(row.id, id); assert.equal(row.userId, person.id);
      assert.equal(row.permissionKey, key); assert.equal(row.status, 'revoked');
    };
    const authenticate = (module, person) => module.authenticate(request(person), admin, connection.apiUrl, connection.anonKey);
    const denied = async (result, status, error, description) => {
      assert.ok(result.error instanceof Response, `${description}: actual authentication response`);
      assert.equal(result.error.status, status); assert.equal((await result.error.json()).error, error); checks++;
    };
    const response = async (value, status, description) => {
      assert.ok(value instanceof Response, `${description}: actual handler response`); assert.equal(value.status, status, description); checks++;
    };
    async function person(label) {
      const email = `exact-authority-${label}-${randomUUID()}@example.invalid`, password = `Local-${randomBytes(24).toString('hex')}!`;
      const created = data(await admin.auth.admin.createUser({email, password, email_confirm: true}), 'create isolated Auth subject');
      users.push(created.user.id);
      const client = createClient(connection.apiUrl, connection.anonKey, options); clients.push(client);
      const signed = data(await client.auth.signInWithPassword({email, password}), 'real sign in');
      const value = {id: created.user.id, email, password, client, token: signed.session.access_token};
      check((await source.authority.readExactCurrentSessionAuthority(client, value.id))?.userId === value.id, `${label}: actual current session`);
      return value;
    }
    async function qualifyAccountSession(client, subject, label) {
      const session = await source.authority.readExactCurrentSessionAuthority(client, subject.id);
      assert.ok(session, `${label}: exact live session`);
      const requirements = data(await client.rpc('wave1_legal_requirements_readback', {p_capability: 'account'}),
        `${label}: canonical account legal requirements`);
      const binding = value => {
        assert.equal(value.state, 'ACTIVE'); assert.equal(value.restoreOnly, false);
        assert.equal(value.userId, subject.id); assert.equal(value.accountId, subject.id);
        assert.equal(value.sessionGeneration, session.sessionGeneration);
        assert.equal(value.market, 'UNITED_STATES'); assert.equal(value.capability, 'account');
      };
      binding(requirements);
      assert.ok(Array.isArray(requirements.requirements) && requirements.requirements.length > 0);
      const acceptances = {};
      for (const requirement of requirements.requirements) {
        assert.equal(typeof requirement.documentKey, 'string'); assert.ok(requirement.documentKey.length);
        assert.equal(typeof requirement.version, 'string'); assert.ok(requirement.version.length);
        assert.ok(!Object.hasOwn(acceptances, requirement.documentKey), 'no duplicate canonical legal requirement');
        acceptances[requirement.documentKey] = requirement.version;
      }
      const accepted = data(await client.rpc('wave1_accept_legal_documents', {
        p_acceptances: acceptances, p_market: 'UNITED_STATES', p_capability: 'account',
        p_expected_user_id: subject.id, p_expected_account_id: subject.id, p_session_generation: session.sessionGeneration,
      }), `${label}: authenticated exact-session legal acceptance`);
      binding(accepted); check(accepted.allAccepted === true, `${label}: current account legal authority`);
      assert.deepEqual(await source.authority.readExactCurrentSessionAuthority(client, subject.id), session,
        `${label}: session unchanged after legal acceptance`);
    }
    async function qualifyOwner(client, label) {
      await qualifyAccountSession(client, owner, label);
      check(data(await client.rpc('has_platform_role', {required_roles: ['owner']}), `${label}: real SQL Owner predicate`) === true,
        `${label}: actual SQL Owner authority`);
      check(data(await client.rpc('platform_staff_actor_role'), `${label}: real SQL actor role`) === 'owner',
        `${label}: canonical producer receives non-null Owner authority`);
    }
    const keys = ['content_moderation', 'reports_review', 'emergency_break_glass', 'legal_request_intake', 'legal_review', 'audit_review', 'security_review', 'admin.audit.view', 'live_ops'];
    async function scopes(person, expected, description) {
      for (const [caller, permissions] of Object.entries(source.scopes)) {
        assert.equal(await source.media.userHasScopedStaffPermission(admin, person, permissions), expected, `${description}: ${caller} actual scoped predicate`); checks++;
      }
    }
    try {
      const sa = await person('sa'), operator = await person('operator'), stranger = await person('stranger');
      owner = await person('owner');
      await role(sa, 'super_admin'); await role(operator, 'operator'); await role(stranger, 'operator'); await role(owner, 'owner');
      independentOwner = createClient(connection.apiUrl, connection.anonKey, options); clients.push(independentOwner);
      data(await independentOwner.auth.signInWithPassword({email: owner.email, password: owner.password}), 'independent real Owner sign in');
      check((await source.authority.readExactCurrentSessionAuthority(independentOwner, owner.id))?.userId === owner.id,
        'independent Owner has actual current session');
      await qualifyOwner(owner.client, 'issuing Owner');
      await qualifyOwner(independentOwner, 'revoking Owner');
      await qualifyAccountSession(sa.client, sa, 'scoped operator');
      check(await source.authority.readExactPlatformRole(admin, sa.id, ['owner', 'operator', 'moderator']) === null, 'SA cannot synthesize operator');
      check(await source.authority.readExactPlatformRole(admin, sa.id, ['owner', 'super_admin']) === 'super_admin', 'explicit SA role preserved');
      assert.deepEqual(sorted(await source.authority.readExactPermissionKeys(admin, sa.id, keys)), [], 'SA cannot fabricate requested scopes'); checks++;
      await denied(await authenticate(source.controls, sa), 403, 'staff_role_required', 'SA-only owner-controls');
      await denied(await authenticate(source.legal, sa), 403, 'legal_permission_required', 'SA-only legal evidence');
      await denied(await authenticate(source.liveOps, sa), 403, 'live_ops_permission_required', 'SA-only Live Ops');
      check(!await source.liveCost.userHasLiveCostGuardRole(admin, sa), 'SA-only Live Cost denied');
      assert.equal(data(await sa.client.rpc('monetization_has_active_premium', {p_user_id: sa.id}), 'real Premium readback'), false);
      check(!await source.media.userCanUsePremiumCreatorTools(admin, sa.client, sa), 'SA-only Premium setup denied');
      await scopes(sa, false, 'SA-only'); check(await source.media.ownerMediaBlockedForStaff(admin, sa, owner.id), 'true Owner media remains protected');
      const forbidden = await owner.client.rpc('admin_grant_platform_staff_permission_by_email', {
        p_target_email: sa.email, p_permission_key: 'audit_review', p_reason: 'Synthetic prohibited grant', p_expires_at: null,
      });
      if (forbidden.data?.id) grants.push(forbidden.data.id);
      check(forbidden.error?.code === 'P0001' && forbidden.error?.message === 'platform_staff_permission_target_role_required',
        'canonical Owner producer rejects confirmed SA-only target without an actual operator/moderator role');
      assert.deepEqual(data(await admin.from('platform_staff_permission_grants').select('id').eq('target_user_id', sa.id),
        'rejected canonical grant leaves no subject grant'), []);
      const operatorRole = await role(sa, 'operator');
      check(await source.authority.readExactPlatformRole(admin, sa.id, ['owner', 'operator']) === 'operator', 'real additional operator role works');
      check(await source.media.userCanUsePremiumCreatorTools(admin, sa.client, sa), 'actual operator Premium setup preserved');
      const unscoped = await authenticate(source.controls, sa); assert.ok(unscoped.user);
      await response(await source.controls.legalRequestList(admin, unscoped.user, {}), 403, 'unscoped legal read');
      await response(await source.controls.auditList(admin, unscoped.user, {}), 403, 'unscoped audit read');
      await response(await source.controls.canaryRun(admin, null, unscoped.user, connection.apiUrl, connection.anonKey), 403, 'actual Canary entry denies');
      await response(await source.controls.legalRequestCreate(admin, unscoped.user, {}), 403, 'actual legal intake entry denies');
      await scopes(sa, false, 'unscoped operator');
      const wrong = await grant(stranger, 'audit_review');
      assert.deepEqual(sorted(await source.authority.readExactPermissionKeys(admin, sa.id, keys)), [], 'wrong subject grant denied'); checks++;
      await revoke(wrong);
      const readOnlyId = await grant(sa, 'admin.audit.view');
      const readOnly = await authenticate(source.controls, sa); assert.ok(readOnly.user);
      assert.deepEqual(sorted(readOnly.user.permissions), ['admin.audit.view']); checks++;
      await response(await source.controls.auditList(admin, readOnly.user, {source: 'platform_admin', actorUserId: sa.id}), 200, 'exact read scope reaches real audit handler');
      await response(await source.controls.canaryRun(admin, null, readOnly.user, connection.apiUrl, connection.anonKey), 403, 'audit read does not imply Canary');
      await response(await source.controls.legalRequestCreate(admin, readOnly.user, {}), 403, 'audit read does not imply intake');
      await revoke(readOnlyId);
      for (const client of [independentAdmin, admin]) {
        assert.deepEqual(sorted(await source.authority.readExactPermissionKeys(client, sa.id, keys)), [], 'both independent clients observe committed revoke'); checks++;
      }
      const active = [];
      for (const key of ['content_moderation', 'legal_request_intake', 'legal_review', 'audit_review', 'live_ops']) active.push(await grant(sa, key));
      const scoped = await authenticate(source.controls, sa); assert.ok(scoped.user);
      assert.deepEqual(sorted(scoped.user.permissions), ['audit_review', 'content_moderation', 'legal_request_intake', 'legal_review', 'live_ops']); checks++;
      await scopes(sa, true, 'SA+operator+exact grant');
      await response(await source.controls.legalRequestList(admin, scoped.user, {search: sa.id}), 200, 'actual scoped legal read');
      await response(await source.controls.canaryList(admin, scoped.user, sa.client), 200, 'actual scoped Canary read');
      check(await source.controls.legalRequestCreate(admin, scoped.user, {}) === true, 'actual legal intake entry permits exact grant');
      check(await source.controls.canaryRun(admin, null, scoped.user, connection.apiUrl, connection.anonKey) === true, 'actual Canary entry permits exact grant');
      check(Boolean((await authenticate(source.legal, sa)).user), 'actual scoped legal authentication');
      check(Boolean((await authenticate(source.liveOps, sa)).user), 'actual scoped Live Ops authentication');
      check(await source.liveCost.userHasLiveCostGuardRole(admin, sa), 'actual scoped Live Cost predicate');
      const legalUser = (await authenticate(source.legal, sa)).user;
      assert.ok(legalUser);
      check(!source.legal.canReleaseHold(legalUser), 'SA with legal review but no legal_hold/ops cannot release holds');
      assert.throws(() => source.legal.resolveLegalReason(legalUser, '', 'Owner-only fallback'),
        /legal_reason_required/u, 'SA still must supply a real reason'); checks++;
      const holdGrant = await grant(sa, 'legal_hold');
      check(source.legal.canReleaseHold((await authenticate(source.legal, sa)).user), 'SA plus actual legal_hold may pass release predicate');
      await revoke(holdGrant);
      const operatorHold = await grant(operator, 'legal_hold');
      const legalOperator = (await authenticate(source.legal, operator)).user;
      assert.ok(legalOperator);
      check(!source.legal.canReleaseHold(legalOperator), 'operator plus actual legal_hold does not acquire narrower release role');
      await revoke(operatorHold);
      // Keep the real grants active while changing the actual operator row.
      // SA-aware callers have their own policy; operator-only media/controls
      // must never regain the revoked/expired role through the remaining SA.
      data(await independentAdmin.from('platform_role_memberships').update({status: 'revoked'}).eq('id', operatorRole), 'revoke operator with live grants');
      await scopes(sa, false, 'revoked operator with actual unrevoked grants');
      await denied(await authenticate(source.controls, sa), 403, 'staff_role_required', 'revoked operator with live grants blocks controls');
      check(!await source.media.userCanUsePremiumCreatorTools(admin, sa.client, sa), 'revoked operator cannot retain Premium setup through SA');
      data(await independentAdmin.from('platform_role_memberships').update({status: 'active'}).eq('id', operatorRole), 'restore exact fixture operator');
      const roleCutoff = connection.sql("select (clock_timestamp()+interval '2 seconds')::text;");
      data(await independentAdmin.from('platform_role_memberships').update({expires_at: roleCutoff}).eq('id', operatorRole), 'finite future operator through real trigger');
      const roleDeadline = Date.now() + 15_000;
      while (connection.sql(`select clock_timestamp()>=expires_at from public.platform_role_memberships where id=${literal(operatorRole)};`) !== 't') {
        assert.ok(Date.now() < roleDeadline, 'observe actual operator expiry within bounded wait'); await delay(25);
      }
      await scopes(sa, false, 'expired operator with actual live grants');
      await denied(await authenticate(source.controls, sa), 403, 'staff_role_required', 'expired operator with live grants blocks controls');
      check(!await source.media.userCanUsePremiumCreatorTools(admin, sa.client, sa), 'expired operator cannot use SA for Premium setup');
      data(await independentAdmin.from('platform_role_memberships').update({expires_at: null}).eq('id', operatorRole), 'restore exact fixture expiry');
      for (const id of active) await revoke(id);
      await scopes(sa, false, 'revoked scopes');
      await denied(await authenticate(source.legal, sa), 403, 'legal_permission_required', 'revoked legal scope');
      await denied(await authenticate(source.liveOps, sa), 403, 'live_ops_permission_required', 'revoked live scope');
      check(!await source.liveCost.userHasLiveCostGuardRole(admin, sa), 'revoked Live Cost scope');
      const previewGrant = await grant(sa, 'evidence_preview');
      const previewUser = (await authenticate(source.legal, sa)).user;
      assert.ok(previewUser);
      assert.deepEqual(sorted(previewUser.permissions), ['evidence_preview']);
      check(!source.legal.canReleaseHold(previewUser), 'SA with exact preview-only grant cannot release holds');
      await revoke(previewGrant);
      const ownerLegal = (await authenticate(source.legal, owner)).user;
      assert.ok(ownerLegal);
      check(source.legal.canReleaseHold(ownerLegal), 'true Owner release predicate remains functional');
      const cutoff = connection.sql("select (clock_timestamp()+interval '2 seconds')::text;");
      const expiring = await grant(sa, 'audit_review', cutoff);
      check((await source.authority.readExactPermissionKeys(admin, sa.id, ['audit_review'])).has('audit_review'), 'future grant initially valid');
      const deadline = Date.now() + 15_000;
      while (connection.sql(`select clock_timestamp()>=expires_at from public.platform_staff_permission_grants where id=${literal(expiring)};`) !== 't') {
        assert.ok(Date.now() < deadline, 'real expiry within bounded wait'); await delay(25);
      }
      assert.deepEqual(sorted(await source.authority.readExactPermissionKeys(independentAdmin, sa.id, ['audit_review'])), [], 'actual expired grant denied'); checks++;
      await revoke(expiring);
      data(await independentAdmin.from('platform_role_memberships').update({status: 'revoked'}).eq('id', operatorRole), 'revoke exact operator');
      check(await source.authority.readExactPlatformRole(admin, sa.id, ['owner', 'operator']) === null, 'revoked operator cannot fall back to SA');
      await scopes(sa, false, 'revoked operator');
      await denied(await authenticate(source.controls, sa), 403, 'staff_role_required', 'revoked operator authentication');
      check(await source.media.userCanUsePremiumCreatorTools(admin, owner.client, owner), 'true Owner Premium setup preserved');
      const plain = await grant(operator, 'reports_review');
      check(await source.media.userHasScopedStaffPermission(admin, operator, source.scopes.canReadCreatorVideo), 'ordinary operator report grant works');
      check(!await source.media.userHasScopedStaffPermission(admin, operator, source.scopes.canDeleteCreatorVideo), 'report read never implies deletion');
      await revoke(plain);
      data(await sa.client.auth.signOut({scope: 'global'}), 'retire synthetic real Auth session');
      await denied(await authenticate(source.controls, sa), 401, 'invalid_session', 'retained JWT denied after session retirement');
      console.log(`Exact-subject authority HTTP: ${checks} real Auth/PostgREST/helper/caller checks passed; no provider or Canary actions executed`);
    } catch (error) { primaryFailure = error; }
    finally {
      const failures = [];
      const clean = async (description, operation) => {
        try { data(await operation(), description); } catch (error) { failures.push(new Error(`${description}: ${redact(error.message)}`)); }
      };
      for (const id of grants) await clean('delete exact synthetic grant', () => admin.from('platform_staff_permission_grants').delete().eq('id', id));
      for (const id of roles) await clean('delete exact synthetic role', () => admin.from('platform_role_memberships').delete().eq('id', id));
      for (const client of clients) await clean('sign out exact synthetic session', () => client.auth.signOut({scope: 'global'}));
      for (const id of users) await clean('delete exact synthetic Auth subject', () => admin.auth.admin.deleteUser(id));
      for (const [table, ids] of [['platform_staff_permission_grants', grants], ['platform_role_memberships', roles]]) if (ids.length) {
        try { assert.equal(data(await admin.from(table).select('id').in('id', ids), 'verify exact cleanup').length, 0); }
        catch (error) { failures.push(new Error(`${table} cleanup verification: ${redact(error.message)}`)); }
      }
      if (users.length) {
        try {
          assert.equal(connection.sql(`select count(*) from auth.users where id in (${users.map(literal).join(',')});`), '0', 'exact synthetic Auth rows removed');
          assert.equal(connection.sql(`select count(*) from auth.sessions where user_id in (${users.map(literal).join(',')});`), '0', 'exact synthetic sessions removed');
        } catch (error) { failures.push(new Error(`Auth cleanup verification: ${redact(error.message)}`)); }
      }
      globalThis.fetch = nativeFetch;
      if (primaryFailure || failures.length) throw new AggregateError([...(primaryFailure ? [primaryFailure] : []), ...failures], 'Real authority assertions or fixture cleanup failed');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--check-source'], 'standalone execution is source-only; database execution belongs to the canonical clone runner');
  loadExactSubjectAuthorityCallers();
  console.log('Exact-subject actual helper/caller source wiring: PASS; Auth/PostgREST/database qualification NOT RUN');
}
