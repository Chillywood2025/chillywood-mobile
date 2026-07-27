#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import postgres from "../isolated-runtime/cloudflare/node_modules/postgres/src/index.js";

// Production-only operator proof. Credentials are read from an owner-only
// directory, passed directly to the driver, and never logged or embedded in a
// connection string. Administrative mutations are limited to reversible
// expiry and membership drills for the ten newly provisioned LOGIN roles.

const PROJECT_REF = "bmkkhihfbmsnnmcqkoly";
const credentialDirectory =
  process.env.COGNITIVE_RUNTIME_CREDENTIAL_DIR ?? "";
const managementToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";

const principals = Object.freeze([
  ["cognitive_product_baseline_executor", "claim_approved_action"],
  ["cognitive_sentinel_collector", "collect_sentinel_run"],
  ["cognitive_product_quality_evaluator", "read_active_baseline"],
  ["cognitive_product_quality_triage", "triage_detection"],
  ["cognitive_public_research_broker", "record_research_source"],
  ["cognitive_research_evaluator", "derive_research_evaluation"],
  ["cognitive_model_router", "recover_model_reservation"],
  [
    "cognitive_livekit_experience_collector",
    "collect_livekit_sentinel_run",
  ],
  [
    "cognitive_github_draft_pr_broker",
    "record_github_provider_readback",
  ],
  ["cognitive_level01_scheduler", "read_scheduler_status"],
]);

const results = new Map(
  principals.map(([principal]) => [
    principal,
    {
      own_preflight_rpc: "FAIL",
      sibling_rpc: "FAIL",
      protected_read: "FAIL",
      direct_dml: "FAIL",
      arbitrary_rpc: "FAIL",
      object_creation: "FAIL",
      role_assumption: "FAIL",
      workflow_mutation: "FAIL",
      net_http_get: "FAIL",
      net_http_post: "FAIL",
      same_session_expiry: "FAIL",
      revocation: "FAIL",
      other_nine_after_revocation: "FAIL",
    },
  ]),
);

const output = (overall) => {
  for (const [principal] of principals) {
    const row = results.get(principal);
    process.stdout.write(`${principal} ${Object.entries(row)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ")}\n`);
  }
  process.stdout.write(`${overall}\n`);
};

const failClosed = () => {
  output("FAIL");
  process.exitCode = 1;
};

const modeIs = (filePath, expected) => {
  try {
    return (statSync(filePath).mode & 0o777) === expected;
  } catch {
    return false;
  }
};

if (
  !credentialDirectory ||
  !managementToken ||
  !modeIs(credentialDirectory, 0o700)
) {
  output("BLOCKED");
  process.exit(1);
}

const passwords = new Map();
const passwordHashes = new Set();
let directOrigin;
try {
  const originPath = path.join(
    credentialDirectory,
    "supabase-direct-origin.json",
  );
  if (!modeIs(originPath, 0o600)) throw new Error("origin_mode");
  const originValue = JSON.parse(readFileSync(originPath, "utf8"));
  if (
    !originValue ||
    typeof originValue !== "object" ||
    Object.keys(originValue).sort().join(",") !== "database,host,port" ||
    typeof originValue.host !== "string" ||
    !/^db\.[a-z]{20}\.supabase\.co$/u.test(originValue.host) ||
    originValue.host !== ["db", PROJECT_REF, "supabase", "co"].join(".") ||
    originValue.host.includes("pooler") ||
    originValue.port !== 5432 ||
    originValue.database !== "postgres"
  ) {
    throw new Error("origin_rejected");
  }
  directOrigin = Object.freeze(originValue);

  for (const [principal] of principals) {
    const passwordPath = path.join(
      credentialDirectory,
      `${principal}.password`,
    );
    if (!modeIs(passwordPath, 0o600)) throw new Error("credential_mode");
    const password = readFileSync(passwordPath, "utf8").trim();
    if (password.length < 40) throw new Error("credential_length");
    const passwordHash = createHash("sha256").update(password).digest("hex");
    if (passwordHashes.has(passwordHash)) throw new Error("credential_reuse");
    passwordHashes.add(passwordHash);
    passwords.set(principal, password);
  }
} catch {
  output("BLOCKED");
  process.exit(1);
}

const managementQuery = async (query, readOnly = false) => {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${managementToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, read_only: readOnly }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error("management_query_rejected");
  const payload = await response.json();
  if (
    payload &&
    !Array.isArray(payload) &&
    typeof payload === "object" &&
    ("error" in payload || "message" in payload)
  ) {
    throw new Error("management_query_rejected");
  }
  return payload;
};

const createPort = (principal) =>
  postgres({
    host: directOrigin.host,
    port: directOrigin.port,
    database: directOrigin.database,
    username: `${principal}_login`,
    password: passwords.get(principal),
    ssl: "require",
    connect_timeout: 10,
    idle_timeout: 120,
    max_lifetime: 600,
    max: 1,
    prepare: false,
    onnotice: () => {},
  });

const ports = new Map();
const denied = (error) => error?.code === "42501";
const expectDenied = async (sql, query) => {
  const succeeded = Symbol("unexpected_success");
  try {
    await sql.begin(async (transaction) => {
      await query(transaction);
      throw succeeded;
    });
  } catch (error) {
    return error !== succeeded && denied(error);
  }
  return false;
};
const preflight = async (sql, principal, operation) => {
  const [row] = await sql`
    select cognitive_runtime.runtime_role_preflight(
      ${principal}::text,
      ${operation}::text
    ) as result
  `;
  return row?.result?.allowed === true &&
    row.result.principal === principal &&
    row.result.operation === operation &&
    row.result.serviceRoleMember === false;
};

const expectedRoleValues = principals
  .map(([principal]) => `('${principal}','${principal}_login')`)
  .join(",");
const expectedRoleConfigs = new Set([
  "search_path=cognitive_runtime, pg_catalog",
  "statement_timeout=15s",
  "idle_in_transaction_session_timeout=10s",
  "lock_timeout=3s",
]);

const readRuntimeStates = async () =>
  managementQuery(`
    with expected(principal,login_role) as (
      values ${expectedRoleValues}
    )
    select
      expected.principal,
      expected.login_role,
      login.rolcanlogin,
      login.rolsuper,
      login.rolcreatedb,
      login.rolcreaterole,
      login.rolinherit,
      login.rolreplication,
      login.rolbypassrls,
      login.rolconnlimit,
      login.rolvaliduntil::text as valid_until,
      login.rolconfig,
      (
        select count(*)::integer
        from pg_catalog.pg_auth_members all_membership
        where all_membership.member = login.oid
      ) as membership_count,
      granted.rolname as granted_principal,
      grantor.rolname as grantor_name,
      membership.admin_option,
      membership.inherit_option,
      membership.set_option
    from expected
    left join pg_catalog.pg_roles login
      on login.rolname = expected.login_role
    left join pg_catalog.pg_auth_members membership
      on membership.member = login.oid
    left join pg_catalog.pg_roles granted
      on granted.oid = membership.roleid
    left join pg_catalog.pg_roles grantor
      on grantor.oid = membership.grantor
    order by expected.principal;
  `, true);

const runtimeStateMatches = (row, principal) => {
  const config = Array.isArray(row?.rolconfig)
    ? new Set(row.rolconfig)
    : new Set();
  const validUntil = Date.parse(String(row?.valid_until ?? ""));
  return row?.principal === principal &&
    row.login_role === `${principal}_login` &&
    row.rolcanlogin === true &&
    row.rolsuper === false &&
    row.rolcreatedb === false &&
    row.rolcreaterole === false &&
    row.rolinherit === true &&
    row.rolreplication === false &&
    row.rolbypassrls === false &&
    row.rolconnlimit === 6 &&
    Number.isFinite(validUntil) &&
    validUntil > Date.now() &&
    config.size === expectedRoleConfigs.size &&
    [...expectedRoleConfigs].every((value) => config.has(value)) &&
    row.membership_count === 1 &&
    row.granted_principal === principal &&
    row.grantor_name === "postgres" &&
    row.admin_option === false &&
    row.inherit_option === true &&
    row.set_option === false;
};

const captureRuntimeStates = async () => {
  const rows = await readRuntimeStates();
  if (!Array.isArray(rows) || rows.length !== principals.length) {
    throw new Error("runtime_state_rejected");
  }
  const captured = new Map();
  for (const [principal] of principals) {
    const row = rows.find((candidate) => candidate.principal === principal);
    if (!runtimeStateMatches(row, principal)) {
      throw new Error("runtime_state_rejected");
    }
    captured.set(principal, Object.freeze({ ...row }));
  }
  return captured;
};

const restoreExpiry = async (principal, state) => {
  if (
    state?.login_role !== `${principal}_login` ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}$/u
      .test(state.valid_until)
  ) {
    throw new Error("expiry_restore_rejected");
  }
  return managementQuery(
    `alter role "${state.login_role}" valid until '${state.valid_until}';`,
  );
};

const restoreMembership = async (principal, state) => {
  if (
    state?.login_role !== `${principal}_login` ||
    state.granted_principal !== principal ||
    state.grantor_name !== "postgres" ||
    state.admin_option !== false ||
    state.inherit_option !== true ||
    state.set_option !== false
  ) {
    throw new Error("membership_restore_rejected");
  }
  return managementQuery(`
    grant "${principal}" to "${state.login_role}"
      with admin false, inherit true, set false
      granted by "${state.grantor_name}";
  `);
};

let originalStates;
try {
  originalStates = await captureRuntimeStates();
} catch {
  output("BLOCKED");
  process.exit(1);
}

if (process.argv.includes("--readback")) {
  for (const [principal] of principals) {
    process.stdout.write(`${principal} MATCH\n`);
  }
  process.stdout.write("PASS\n");
  process.exit();
}

if (process.argv.includes("--connection-readback")) {
  let allMatch = true;
  try {
    for (const [principal, operation] of principals) {
      const sql = createPort(principal);
      let connected = false;
      let matches = false;
      try {
        const [identity] = await sql`
          select
            current_user = ${`${principal}_login`}::text
              and session_user = ${`${principal}_login`}::text
              as matches
        `;
        connected = identity?.matches === true;
        matches = connected && await preflight(sql, principal, operation);
      } catch {
        matches = false;
      } finally {
        await sql.end({ timeout: 1 }).catch(() => {});
      }
      allMatch &&= matches;
      process.stdout.write(
        `${principal} ${connected ? "ACTIVE" : "INACTIVE"} ${
          matches ? "MATCH" : "MISMATCH"
        }\n`,
      );
    }
  } catch {
    allMatch = false;
  }
  process.stdout.write(`${allMatch ? "PASS" : "FAIL"}\n`);
  process.exit(allMatch ? 0 : 1);
}

let failed = false;
let failureStage = "static_boundaries";
const dirtyExpiries = new Map();
const dirtyMemberships = new Map();
let cleanupPromise;

const restoreDirtyState = () => {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    let restored = true;
    for (const [principal, state] of [...dirtyMemberships]) {
      try {
        await restoreMembership(principal, state);
        dirtyMemberships.delete(principal);
      } catch {
        restored = false;
      }
    }
    for (const [principal, state] of [...dirtyExpiries]) {
      try {
        await restoreExpiry(principal, state);
        dirtyExpiries.delete(principal);
      } catch {
        restored = false;
      }
    }
    cleanupPromise = undefined;
    return restored;
  })();
  return cleanupPromise;
};

const closePorts = () =>
  Promise.all(
    [...ports.values()].map((sql) =>
      sql.end({ timeout: 1 }).catch(() => {})
    ),
  );

const restoredStateMatches = async () => {
  const current = await captureRuntimeStates();
  return principals.every(([principal]) => {
    const before = originalStates.get(principal);
    const after = current.get(principal);
    return before.valid_until === after.valid_until &&
      before.membership_count === after.membership_count &&
      before.granted_principal === after.granted_principal &&
      before.grantor_name === after.grantor_name &&
      before.admin_option === after.admin_option &&
      before.inherit_option === after.inherit_option &&
      before.set_option === after.set_option;
  });
};

let cancellationRequested = false;
const handleSignal = () => {
  cancellationRequested = true;
};
const assertNotCancelled = () => {
  if (cancellationRequested) {
    failureStage = "signal_cancellation";
    throw new Error("signal_cancellation");
  }
};
process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

try {
  for (const [principal] of principals) {
    assertNotCancelled();
    ports.set(principal, createPort(principal));
  }

  for (const [principal, operation] of principals) {
    assertNotCancelled();
    failureStage = `${principal}_own_preflight_rpc`;
    const passed = await preflight(ports.get(principal), principal, operation);
    results.get(principal).own_preflight_rpc = passed ? "PASS" : "FAIL";
    if (!passed) throw new Error("own_preflight_rejected");
  }

  for (let index = 0; index < principals.length; index += 1) {
    assertNotCancelled();
    const [principal, operation] = principals[index];
    const [sibling, siblingOperation] =
      principals[(index + 1) % principals.length];
    const sql = ports.get(principal);
    const row = results.get(principal);

    failureStage = `${principal}_negative_boundaries`;
    row.sibling_rpc = await expectDenied(
      sql,
      (transaction) => transaction`
        select cognitive_runtime.runtime_role_preflight(
          ${sibling}::text,
          ${siblingOperation}::text
        )
      `,
    ) ? "DENIED" : "FAIL";
    row.protected_read = await expectDenied(
      sql,
      (transaction) => transaction`
        select switch_key
        from public.cognitive_governance_switches
        limit 1
      `,
    ) ? "DENIED" : "FAIL";
    row.direct_dml = await expectDenied(
      sql,
      (transaction) => transaction`
        delete from public.cognitive_governance_switches
        where false
      `,
    ) ? "DENIED" : "FAIL";
    row.arbitrary_rpc = await expectDenied(
      sql,
      (transaction) => transaction`
        select public.governance_approval_emergency_active()
      `,
    ) ? "DENIED" : "FAIL";
    row.object_creation =
      await expectDenied(
        sql,
        (transaction) => transaction.unsafe(
          "create table cognitive_runtime.remote_isolation_probe(value integer)",
        ),
      ) &&
        await expectDenied(
          sql,
          (transaction) => transaction.unsafe(
            "create temporary table remote_isolation_probe(value integer)",
          ),
        )
        ? "DENIED"
        : "FAIL";
    row.role_assumption = await expectDenied(
      sql,
      (transaction) =>
        transaction.unsafe(`set role "${sibling}"`),
    ) ? "DENIED" : "FAIL";
    row.workflow_mutation = await expectDenied(
      sql,
      (transaction) => transaction`
        delete from public.release_health_snapshots
        where false
      `,
    ) ? "DENIED" : "FAIL";
    row.net_http_get = await expectDenied(
      sql,
      (transaction) => transaction`
        select net.http_get(
          url := ${"https://cognitive-negative-test.invalid/"}
        )
      `,
    ) ? "DENIED" : "FAIL";
    row.net_http_post = await expectDenied(
      sql,
      (transaction) => transaction`
        select net.http_post(
          url := ${"https://cognitive-negative-test.invalid/"},
          body := ${"{}"}::jsonb
        )
      `,
    ) ? "DENIED" : "FAIL";
    if (
      Object.entries(row).some(([key, value]) =>
        key !== "same_session_expiry" &&
        key !== "revocation" &&
        key !== "other_nine_after_revocation" &&
        !["PASS", "DENIED"].includes(value)
      )
    ) {
      throw new Error("static_boundary_rejected");
    }
  }

  for (const [principal, operation] of principals) {
    assertNotCancelled();
    const originalState = originalStates.get(principal);
    const loginRole = originalState.login_role;
    const sql = ports.get(principal);
    const row = results.get(principal);
    let restored = false;
    const [sessionBefore] = await sql`
      select pg_backend_pid() as backend_pid
    `;
    try {
      failureStage = "same_session_expiry";
      dirtyExpiries.set(principal, originalState);
      await managementQuery(
        `alter role "${loginRole}" valid until '2000-01-01 00:00:00+00';`,
      );
      assertNotCancelled();
      row.same_session_expiry = await expectDenied(
        sql,
        (transaction) => transaction`
          select cognitive_runtime.runtime_role_preflight(
            ${principal}::text,
            ${operation}::text
          )
        `,
      ) ? "DENIED" : "FAIL";
    } finally {
      failureStage = "same_session_expiry_restore";
      await restoreExpiry(principal, originalState);
      dirtyExpiries.delete(principal);
      restored = true;
    }
    const [sessionAfter] = await sql`
      select pg_backend_pid() as backend_pid
    `;
    if (
      !restored ||
      sessionBefore.backend_pid !== sessionAfter.backend_pid ||
      !await preflight(sql, principal, operation)
    ) {
      row.same_session_expiry = "FAIL";
    }
  }

  for (const [principal, operation] of principals) {
    assertNotCancelled();
    const originalState = originalStates.get(principal);
    const loginRole = originalState.login_role;
    const sql = ports.get(principal);
    const row = results.get(principal);
    let restored = false;
    try {
      failureStage = "revocation";
      dirtyMemberships.set(principal, originalState);
      await managementQuery(`revoke "${principal}" from "${loginRole}";`);
      assertNotCancelled();
      row.revocation = await expectDenied(
        sql,
        (transaction) => transaction`
          select cognitive_runtime.runtime_role_preflight(
            ${principal}::text,
            ${operation}::text
          )
        `,
      ) ? "DENIED" : "FAIL";
      row.other_nine_after_revocation = (
        await Promise.all(
          principals
            .filter(([other]) => other !== principal)
            .map(([other, otherOperation]) =>
              preflight(ports.get(other), other, otherOperation)
            ),
        )
      ).every(Boolean)
        ? "PASS"
        : "FAIL";
    } finally {
      failureStage = "revocation_restore";
      await restoreMembership(principal, originalState);
      dirtyMemberships.delete(principal);
      restored = true;
    }
    if (!restored || !await preflight(sql, principal, operation)) {
      row.revocation = "FAIL";
    }
  }
} catch {
  failed = true;
} finally {
  if (!await restoreDirtyState()) failed = true;
  try {
    if (!await restoredStateMatches()) failed = true;
  } catch {
    failed = true;
  }
  await closePorts();
  process.removeListener("SIGINT", handleSignal);
  process.removeListener("SIGTERM", handleSignal);
  if (cancellationRequested) failed = true;
  passwords.clear();
  passwordHashes.clear();
}

const accepted = new Set(["PASS", "DENIED"]);
if (
  failed ||
  [...results.values()].some((row) =>
    Object.values(row).some((value) => !accepted.has(value))
  )
) {
  process.stdout.write(`${failureStage}=FAIL\n`);
  failClosed();
} else {
  output("PASS");
}
