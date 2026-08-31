import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

const helperSource = readFileSync(
  new URL("../../_lib/moneyCenterSectionVisibility.ts", import.meta.url),
  "utf8",
);
const componentSource = readFileSync(
  new URL("../../app/channel-settings.tsx", import.meta.url),
  "utf8",
);

const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module });
const { isMoneyCenterSectionBodyVisible } = module.exports;

test("expanded Money Center bodies remain visible for every routed focus", () => {
  const focusedSections = ["ways_to_earn", "transactions", "payouts"];
  for (const focusedSection of focusedSections) {
    assert.equal(
      isMoneyCenterSectionBodyVisible(true),
      true,
      `${focusedSection} must stay visible when selected`,
    );
  }
  assert.equal(isMoneyCenterSectionBodyVisible(false), false);
});

test("Platform Studio uses the visibility contract without focus-state suppression", () => {
  assert.match(
    componentSource,
    /const showBody = isMoneyCenterSectionBodyVisible\(expanded\);/,
  );
  assert.doesNotMatch(
    componentSource,
    /expanded\s*&&\s*id\s*!==\s*activeMoneyCenterFocusSection/,
  );
  assert.doesNotMatch(componentSource, /activeMoneyCenterFocusSection/);
});
