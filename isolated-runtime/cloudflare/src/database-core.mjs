import postgres from "postgres";

const COMMON_STATEMENTS = Object.freeze({
  runtimeRevocationStatus: Object.freeze({
    arity: 1,
    text:
      "select cognitive_runtime.runtime_revocation_status($1::text) as result",
  }),
  runtimeRolePreflight: Object.freeze({
    arity: 2,
    text:
      "select cognitive_runtime.runtime_role_preflight($1::text,$2::text) as result",
  }),
});

export const createScopedDatabasePort = ({
  connectionString,
  domainStatements,
  sqlFactory = postgres,
}) => {
  if (
    typeof connectionString !== "string" ||
    !connectionString.startsWith("postgres://") &&
      !connectionString.startsWith("postgresql://")
  ) {
    throw new Error("hyperdrive_connection_required");
  }
  const statements = Object.freeze({
    ...COMMON_STATEMENTS,
    ...domainStatements,
  });
  const sql = sqlFactory(connectionString, {
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    max_lifetime: 60,
    prepare: false,
    ssl: "require",
  });
  const call = async (statementId, parameters) => {
    const statement = statements[statementId];
    if (
      !statement ||
      !Array.isArray(parameters) ||
      parameters.length !== statement.arity
    ) {
      throw new Error("rpc_allowlist_rejected");
    }
    const rows = await sql.unsafe(statement.text, parameters);
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error("database_response_rejected");
    }
    return rows[0].result;
  };
  return Object.freeze({
    call,
    close: () => sql.end({ timeout: 1 }),
    preflight: (principal, operation) =>
      call("runtimeRolePreflight", [principal, operation]),
    revocationStatus: (principal) =>
      call("runtimeRevocationStatus", [principal]),
  });
};

export const commonStatementInventory = () =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(COMMON_STATEMENTS).map(([id, statement]) => [
        id,
        Object.freeze({ arity: statement.arity }),
      ]),
    ),
  );
