import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { mount, textOf, productionFunctions } from "../platform-studio-mounted-harness.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const studio = fs.readFileSync(path.join(root, "app/channel-settings.tsx"), "utf8");
const guard = fs.readFileSync(path.join(root, "scripts/guard-money-center-policy.mjs"), "utf8");
const compiledGuard = ts.transpileModule(guard, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function runGuard(source) {
  const failures = [];
  const processFixture = { cwd: () => root, exitCode: 0, exit: () => {} };
  vm.runInNewContext(compiledGuard, {
    exports: {}, process: processFixture, console: { log: () => {}, error: value => failures.push(value) },
    require: name => {
      if (name === "typescript") return ts;
      if (name === "node:path") return path;
      if (name === "node:fs") return { readFileSync: (file, encoding) => file === path.join(root, "app/channel-settings.tsx") ? source : fs.readFileSync(file, encoding) };
      throw new Error(`Unexpected guard dependency: ${name}`);
    },
  });
  return { failures, exitCode: processFixture.exitCode };
}

test("Money policy allows measured non-money focus but rejects a removed or comment-only exclusion", () => {
  assert.deepEqual(runGuard(studio), { failures: [], exitCode: 0 });
  for (const replacement of ["", '// if (key === "tab-monetization") return;']) {
    const changed = studio.replace('if (key === "tab-monetization") return;', replacement);
    assert.notEqual(changed, studio);
    const result = runGuard(changed);
    assert.equal(result.exitCode, 1);
    assert.ok(result.failures.some(value => value.includes("exclude Money Center")));
  }
});

test("Money policy rejects direct and differently named imperative manager scrolling", () => {
  for (const command of ["studioScrollRef.current?.scrollTo({ y: 900 });", "otherList.current?.scrollToIndex({ index: 1 });"]) {
    const marker = "const focusMoneyCenterSection = useCallback((id: MoneyCenterFocusSection) => {";
    const changed = studio.replace(marker, `${marker}\n${command}`);
    assert.notEqual(changed, studio);
    const result = runGuard(changed);
    assert.equal(result.exitCode, 1);
    assert.ok(result.failures.some(value => value.includes("focus must remain declarative")));
  }
});

test("Money policy rejects scrolling in useCallback dependencies outside the guarded measured callback", () => {
  const changed = studio.replace(/(const recordStudioSection = useCallback\([\s\S]*?\}, )\[\](\);)/u,
    "$1[studioScrollRef.current?.scrollTo({ y: 999 })]$2");
  assert.notEqual(changed, studio);
  const result = runGuard(changed);
  assert.equal(result.exitCode, 1);
  assert.ok(result.failures.some(value => value.includes("focus must remain declarative")));
});

test("mounted Money deep links, Ways to Earn, manager open and close work without imperative scrolling", async t => {
  const { isMoneyCenterSectionBodyVisible } = productionFunctions("_lib/moneyCenterSectionVisibility.ts", ["isMoneyCenterSectionBodyVisible"], {});
  const h = await mount(t, { route: { tab: "monetization", focus: "ways_to_earn", manage: "tips" }, overrides: { isMoneyCenterSectionBodyVisible } });
  const node = id => h.find(value => value.props.testID === id);
  assert.ok(node("money-manager-tips"));
  assert.equal(h.scrolls.length, 0);
  await h.press(node("money-manager-close-button"));
  assert.equal(node("money-manager-tips"), undefined);
  await h.press(node("money-center-open-ways-to-earn-button"));
  assert.ok(node("money-center-ways-to-earn-panel"));
  await h.press(node("money-feature-tips-cta"));
  assert.ok(node("money-manager-tips"));
  await h.route({ tab: "monetization", focus: "transactions", manage: "" });
  assert.ok(node("money-center-transactions-accordion-panel"));
  assert.equal(h.scrolls.length, 0);
  await h.press(h.button("Live"));
  await h.press(h.find(value => value.type === "TouchableOpacity" && textOf(value).startsWith("Schedule Event")));
  assert.ok(h.scrolls.length > 0, "non-money measured Studio focus is preserved");
  const scrollsBeforeMoney = h.scrolls.length;
  await h.press(h.button("Monetization"));
  assert.equal(h.scrolls.length, scrollsBeforeMoney);
});
