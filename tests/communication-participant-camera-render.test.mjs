import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Execute the production JSX, including its real render conditions and labels.
// Host views are DOM stand-ins; this proves presentation, not native frames/RTP.
const host = (tag) => function TestHost({ children, testID, ...props }) {
  return React.createElement(tag,
    { "data-testid": testID, ...(props.streamURL ? { "data-stream": props.streamURL } : {}),
      ...(tag === "video" ? { "data-mirror": String(props.mirror) } : {}) }, children);
};
const mocks = {
  react: React,
  "react-native": { StyleSheet: { create: (value) => value }, Text: host("span"), View: host("div") },
  "../../_lib/communication": { getCommunicationRTCModule: () => ({ RTCView: host("video") }) },
  "../../_lib/livekit/react-native-module": { LiveKitVideoTrack: host("video") },
  "../../hooks/use-responsive-layout": { responsiveFontSize: (size) => size,
    useResponsiveLayout: () => ({ fontScale: 1, isLandscape: false }) },
  "../ui/ProfileMediaImage": { ProfileMediaImage: host("img") },
  "../ui/chillywood-visual-system": { CHILLYWOOD_VISUAL: {} },
};
const filename = process.env.CHILLY_GRID_TEST_SOURCE ?? "components/communication/communication-participant-grid.tsx";
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  fileName: filename,
}).outputText, { module, exports: module.exports, __DEV__: false,
  require: (name) => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; } });
const render = (participant, props = {}) => renderToStaticMarkup(React.createElement(
  module.exports.CommunicationParticipantGrid, { callType: "video", participants: [{
    userId: "remote", displayName: "Participant", isSelf: false,
    cameraOn: false, micOn: true, connectionState: "connected", ...participant,
  }], ...props }));

for (const transport of ["legacy", "livekit"]) {
  const retained = transport === "legacy" ? { streamURL: "retained-native-stream" }
    : { liveKitVideoTrackReference: { publication: { trackSid: "retained-track" } } };
  test(`${transport}: camera-off hides a retained remote renderer and removes Cam On`, () => {
    const html = render(retained);
    assert.doesNotMatch(html, /<video|Cam On|Video connected/);
    assert.match(html, /communication-video-remote-placeholder/);
    assert.match(html, /Cam Off/);
  });
  test(`${transport}: camera-on restores the existing remote renderer`, () => {
    const html = render({ ...retained, cameraOn: true });
    assert.match(html, /<video/);
    assert.match(html, /Cam On/);
    assert.doesNotMatch(html, /communication-video-remote-placeholder/);
  });
  test(`${transport}: voice calls never render a retained video track`, () => {
    assert.doesNotMatch(render({ ...retained, cameraOn: true }, { callType: "voice" }), /<video|Cam On/);
  });
  for (const [connectionState, label] of [
    ["failed", "Connection failed"], ["disconnected", "Disconnected"],
    ["connecting", "Connecting"], ["waiting", "Waiting"],
  ]) {
    test(`${transport}: ${connectionState} cannot be masked by retained video`, () => {
      const html = render({ ...retained, cameraOn: true, connectionState });
      assert.doesNotMatch(html, /<video|Cam On|Video connected/);
      assert.match(html, /communication-video-remote-placeholder/);
      assert.ok(html.includes(label));
    });
  }
}
test("local camera-off overrides a retained stream and stale participant intent", () => {
  assert.doesNotMatch(render({ isSelf: true, cameraOn: true, streamURL: "local" },
    { localCameraEnabled: false }), /<video|Cam On/);
});
test("camera requested without a track remains Starting, never Cam On", () => {
  const html = render({ cameraOn: true });
  assert.match(html, /Starting/);
  assert.doesNotMatch(html, /<video|Cam On|Video connected/);
});

for (const [facing, mirror] of [["user", true], ["environment", false], [undefined, false]]) {
  test(`legacy local renderer mirrors only observed front camera: ${facing ?? "unknown"}`, () => {
    const html = render({ isSelf: true, cameraOn: true, streamURL: "local",
      cameraFacingMode: facing });
    assert.match(html, new RegExp(`data-mirror="${mirror}"`));
  });
  test(`legacy remote renderer ignores facing metadata: ${facing ?? "unknown"}`, () => {
    assert.match(render({ cameraOn: true, streamURL: "remote", cameraFacingMode: facing }),
      /data-mirror="false"/);
  });
}

const previewModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("components/communication/communication-preview-card.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  fileName: "components/communication/communication-preview-card.tsx",
}).outputText, { module: previewModule, exports: previewModule.exports, __DEV__: false,
  require: (name) => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; } });

for (const [facing, mirror] of [["user", true], ["environment", false], [undefined, false]]) {
  test(`standalone preview mirrors only observed front camera: ${facing ?? "unknown"}`, () => {
    const html = renderToStaticMarkup(React.createElement(previewModule.exports.CommunicationPreviewCard, {
      displayName: "You", streamURL: "local", cameraEnabled: true, micEnabled: true,
      cameraPermissionState: "granted", microphonePermissionState: "granted", cameraFacingMode: facing,
    }));
    assert.match(html, new RegExp(`data-mirror="${mirror}"`));
  });
}
