import test from "node:test";
import assert from "node:assert/strict";

import { jsonSchemaConstEqual, resolveLocalJsonPointer } from "../../scripts/assurance/json-schema-ref.mjs";

test("resolves nested local JSON pointers", () => {
  const root = {
    $defs: {
      outer: {
        properties: {
          nested: { type: "string" },
        },
      },
    },
  };
  assert.deepEqual(
    resolveLocalJsonPointer(root, "#/$defs/outer/properties/nested"),
    { type: "string" },
  );
});

test("decodes JSON pointer escape tokens", () => {
  const root = { "a/b": { "c~d": 7 } };
  assert.equal(resolveLocalJsonPointer(root, "#/a~1b/c~0d"), 7);
});

test("fails closed for external and unresolved refs", () => {
  const root = { $defs: { known: {} } };
  assert.equal(resolveLocalJsonPointer(root, "https://example.com/schema.json"), null);
  assert.equal(resolveLocalJsonPointer(root, "#/$defs/missing"), null);
});

test("compares object const values independent of key order while preserving array order", () => {
  assert.equal(jsonSchemaConstEqual({ beta: 2, alpha: { delta: 4, gamma: 3 } }, { alpha: { gamma: 3, delta: 4 }, beta: 2 }), true);
  assert.equal(jsonSchemaConstEqual({ values: [1, 2] }, { values: [2, 1] }), false);
});
