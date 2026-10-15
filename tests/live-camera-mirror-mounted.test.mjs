import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml",
  nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};

test("mounted real mirror hook follows capture facing and same-publication replacement, then releases listeners", async () => {
  const exports = {}, polls = new Set();
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("hooks/use-local-camera-mirror.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => name === "react" ? React : { TrackEvent: { Restarted: "restarted" } },
    setInterval: (call) => { polls.add(call); return call; }, clearInterval: (call) => polls.delete(call) });
  const track = (facing) => {
    const listeners = new Map();
    return { listeners, mediaStreamTrack: { getSettings: () => ({ facingMode: facing }) },
      on: (name, callback) => listeners.set(name, callback), off: (name) => listeners.delete(name) };
  };
  const front = track("user"), rear = track("environment"); let actual;
  function Harness({ value }) { actual = exports.useLocalCameraMirror(value); return null; }
  const root = createRoot(container());
  await React.act(async () => root.render(React.createElement(Harness, { value: front })));
  assert.equal(actual, true); assert.equal(polls.size, 1);
  front.mediaStreamTrack = rear.mediaStreamTrack;
  await React.act(async () => front.listeners.get("restarted")());
  assert.equal(actual, false, "SDK Restarted updates rear-facing preview without a publication replacement");
  front.mediaStreamTrack = { getSettings: () => ({ facingMode: "user" }) };
  await React.act(async () => { for (const call of polls) call(); });
  assert.equal(actual, true, "native replacement without SDK event is reconciled");
  await React.act(async () => root.render(React.createElement(Harness, { value: rear })));
  assert.equal(actual, false); assert.equal(front.listeners.size, 0); assert.equal(rear.listeners.size, 1);
  await React.act(async () => root.unmount()); assert.equal(rear.listeners.size, 0); assert.equal(polls.size, 0);
});

test("all shared Player and Stage local preview props gate mirroring on real camera facing", () => {
  for (const [path, component] of [["components/watch-party-live/livekit-stage-media-surface.tsx", "VideoTrack"],
    ["app/watch-party/live-stage/[partyId].tsx", "HybridLiveKitVideoTrack"]]) {
    const ast = ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const expressions = [];
    const visit = (node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === component) {
        const mirror = node.attributes.properties.find((entry) => ts.isJsxAttribute(entry) && entry.name.getText(ast) === "mirror");
        if (mirror?.initializer && ts.isJsxExpression(mirror.initializer)) expressions.push(mirror.initializer.expression.getText(ast));
      }
      ts.forEachChild(node, visit);
    };
    visit(ast); assert.ok(expressions.length >= 2);
    for (const expression of expressions) {
      const evaluate = (local, facingMirror) => vm.runInNewContext(expression, { mirrorLocalCamera: facingMirror,
        participantIsLocal: local, showLocalPrimary: local, isLocalParticipant: local, isShowingLocalPreview: local, isShowingSecondaryLocalPreview: local });
      assert.equal(evaluate(true, false), false, `${path}: rear self preview`);
      assert.equal(evaluate(false, true), false, `${path}: remote preview`);
      assert.equal(evaluate(true, true), true, `${path}: front self preview`);
    }
  }
});
