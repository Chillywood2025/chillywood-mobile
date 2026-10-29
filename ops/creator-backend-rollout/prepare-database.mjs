// Reproduce the reviewed atomic payload. This module never connects to a database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gitReader, sha256 } from "./prepare-edge.mjs";

export const manifest = JSON.parse(readFileSync(new URL("./database-manifest.json", import.meta.url), "utf8"));
function requireValue(condition, message) { if (!condition) throw new Error(message); }

export function prepareDatabase(readSource, plan = manifest) {
  requireValue(plan.schemaVersion === 1 && plan.components.length === 25, "Unexpected deployment plan");
  let body = "-- REVIEW BODY ONLY. Requires a separately reviewed single transaction and early locks.\n";
  for (const [index, component] of plan.components.entries()) {
    requireValue(component.sequence === index + 1, "Source order mismatch");
    const source = readSource(component.sourcePath);
    requireValue(typeof source === "string", `Missing source: ${component.sourcePath}`);
    let bytes = Buffer.from(source);
    requireValue(bytes.length === component.sourceBytes && sha256(bytes) === component.sourceSha256, `Source changed: ${component.sourcePath}`);
    const transforms = plan.transforms.filter(x => x.sourcePath === component.sourcePath)
      .sort((a, b) => b.sourceByteOffset - a.sourceByteOffset);
    let boundary = bytes.length;
    for (const edit of transforms) {
      const end = edit.sourceByteOffset + edit.removedByteLength;
      requireValue(edit.sourceByteOffset >= 0 && end <= boundary, "Overlapping or invalid reviewed transform");
      requireValue(bytes.subarray(edit.sourceByteOffset, end).toString() === edit.removedText, "Reviewed transform no longer matches");
      requireValue((edit.kind === "remove_top_level_transaction_wrapper" && /^(?:\n)*?(?:begin|commit);$/i.test(edit.removedText) && edit.replacementText === "")
        || (edit.kind === "limit_check_function_bodies_to_cutover_transaction" && edit.removedText === "set check_function_bodies = false;" && edit.replacementText === "set local check_function_bodies = false;"), "Unapproved transform");
      bytes = Buffer.concat([bytes.subarray(0, edit.sourceByteOffset), Buffer.from(edit.replacementText), bytes.subarray(end)]);
      boundary = edit.sourceByteOffset;
    }
    requireValue(bytes.length === component.transformedBytes && sha256(bytes) === component.transformedSha256, "Transformed source mismatch");
    body += `\n-- Source component ${index + 1}: ${path.posix.basename(component.sourcePath)}\n`;
    requireValue(Buffer.byteLength(body) === component.bodyByteOffset, "Component offset mismatch");
    body += bytes.toString();
  }
  requireValue(Buffer.byteLength(body) === plan.bodyBytes && sha256(body) === plan.bodySha256, "Combined body mismatch");
  requireValue(plan.lockedTables.length === 37 && plan.lockedTables.every(x => /^public\.[a-z_]+$/.test(x)), "Lock scope mismatch");
  requireValue(JSON.stringify([...new Set(plan.lockedTables)].sort()) === JSON.stringify(plan.lockedTables), "Lock order mismatch");
  const prefix = "-- Atomic creator backend cutover; reviewed source transformations are in manifest.json.\n"
    + "begin;\nset local lock_timeout='5s';\nset local statement_timeout='120s';\n"
    + `lock table\n  ${plan.lockedTables.join(',\n  ')}\nin access exclusive mode;\n`;
  requireValue(Buffer.byteLength(prefix) === plan.payloadBodyByteOffset, "Transaction prefix mismatch");
  const payload = prefix + body + "\ncommit;\n";
  requireValue(Buffer.byteLength(payload) === plan.payloadBytes && sha256(payload) === plan.payloadSha256, "Qualified payload mismatch");
  return payload;
}

// Migration executors append their history record and own the transaction.
// An embedded COMMIT would detach that record from the schema changes.
export function prepareMigration(readSource) {
  const standalone = prepareDatabase(readSource);
  const header = "-- Atomic creator backend cutover; reviewed source transformations are in manifest.json.\n";
  requireValue(standalone.startsWith(header + "begin;\n") && standalone.endsWith("commit;\n"), "Standalone enclosure mismatch");
  const query = header + standalone.slice(header.length + "begin;\n".length, -"commit;\n".length);
  requireValue(Buffer.byteLength(query) === manifest.migrationQueryBytes && sha256(query) === manifest.migrationQuerySha256, "Migration query mismatch");
  return query;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , repo, sourceRef] = process.argv;
    requireValue(process.argv.length === 4, "Usage: node prepare-database.mjs /absolute/repo FULL_COMMIT_SHA");
    process.stdout.write(prepareMigration(gitReader(path.resolve(repo), sourceRef)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
