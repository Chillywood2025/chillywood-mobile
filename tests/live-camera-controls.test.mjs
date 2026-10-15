import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), React = require("react"), ts = require("typescript");
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("components/live/live-camera-controls.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, { exports, require: name => {
  if (name === "react") return React;
  if (name === "react-native") return { View: "View", Text: "Text", TouchableOpacity: "Button", StyleSheet: { create: value => value } };
  throw new Error(`unexpected dependency ${name}`);
} });
function flatten(element) { if (!element || typeof element !== "object") return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(flatten)]; }
function render(controls, effectId = "off") {
  const calls = [];
  const nodes = flatten(exports.LiveCameraControls({ controls, effectId, intensity: 0.5,
    onSelect: id => calls.push(["state", id]), onIntensity: value => calls.push(["intensity", value]) }));
  return { calls, nodes, button: id => nodes.find(n => n.props.testID === id) };
}
const capabilities = { studioLighting: true, chicagoSkyline: true, crimsonAura: true, neonEdge: true, spotlight: true };

test("controls contain five named outgoing effects plus Off, all accessible", () => {
  const h = render({ capabilities, canSwitchCamera: true, switchingCamera: false, state: "off" });
  for (const id of ["off", "studio-light", "chicago-skyline", "crimson-aura", "neon-edge", "spotlight"]) {
    const button = h.button(`live-camera-effect-${id}`); assert.ok(button);
    assert.equal(button.props.accessibilityRole, "button"); assert.equal(button.props.disabled, false);
  }
});
test("unavailable build and missing publisher disable effects/switch while keeping Off usable", () => {
  const h = render(null);
  assert.equal(h.button("live-switch-camera").props.disabled, true);
  assert.equal(h.button("live-camera-effect-off").props.disabled, false);
  for (const id of ["studio-light", "chicago-skyline", "crimson-aura", "neon-edge", "spotlight"])
    assert.equal(h.button(`live-camera-effect-${id}`).props.disabled, true);
});
test("Off reaches native controller before the React selection update", () => {
  let h;
  h = render({ capabilities, select: (id, intensity) => h.calls.push(["native", id, intensity]) }, "crimson-aura");
  h.button("live-camera-effect-off").props.onPress();
  assert.deepEqual(h.calls, [["native", "off", 0.5], ["state", "off"]]);
});
test("all four intensity buttons use native controller and are labeled in percent", () => {
  let h;
  h = render({ capabilities, select: (id, intensity) => h.calls.push(["native", id, intensity]) }, "neon-edge");
  for (const value of [0.25, 0.5, 0.75, 1]) {
    const button = h.nodes.find(n => n.props.accessibilityLabel === `Effect intensity ${Math.round(value * 100)} percent`);
    assert.ok(button); button.props.onPress();
    assert.deepEqual(h.calls.splice(0), [["native", "neon-edge", value], ["intensity", value]]);
  }
});
test("in-flight camera switch cannot be double tapped", () => {
  const h = render({ capabilities, canSwitchCamera: true, switchingCamera: true, state: "off" });
  assert.equal(h.button("live-switch-camera").props.disabled, true);
  assert.equal(h.button("live-switch-camera").props.accessibilityState.busy, true);
});
