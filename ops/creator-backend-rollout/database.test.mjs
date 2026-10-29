import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { prepareDatabase, prepareMigration, manifest } from "./prepare-database.mjs";
import { gitReader, sha256 } from "./prepare-edge.mjs";
const read = gitReader(fileURLToPath(new URL("../../", import.meta.url)), manifest.sourceHead);

test("migration input leaves transaction and history commit to the canonical executor", () => {
  const query = prepareMigration(read);
  assert.equal(sha256(query), "cb7c21435e3eee37dd1d03144a9b05b34ba0cb518e35067dc44905ed517af8ca");
  assert.equal(Buffer.byteLength(query), 576507);
  const standalone = prepareDatabase(read);
  assert.equal(query, standalone.replace("\nbegin;\nset local", "\nset local").slice(0, -"commit;\n".length));
});

test("frozen source reproduces the separately qualified atomic payload byte for byte", () => {
  const payload = prepareDatabase(read);
  assert.equal(sha256(payload), "044888d2c4cd005259974bdd71c7845a9c55fbb61f17fffa8c6d296e19ec895b");
  assert.equal(Buffer.byteLength(payload), 576522);
});

test("changed input, reordered components or altered transform fail before producing SQL", () => {
  assert.throws(() => prepareDatabase(name => read(name) + "\n"), /Source changed/);
  const reordered = structuredClone(manifest);
  [reordered.components[0], reordered.components[1]] = [reordered.components[1], reordered.components[0]];
  assert.throws(() => prepareDatabase(read, reordered), /Source order/);
  const changed = structuredClone(manifest);
  changed.transforms[0].replacementText = "set check_function_bodies = true;";
  assert.throws(() => prepareDatabase(read, changed), /Unapproved transform/);
});
