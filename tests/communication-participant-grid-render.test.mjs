import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const filename = "components/communication/communication-participant-grid.tsx";
const layout = new Proxy({ isLandscape: false, isCompactPhone: false, fontScale: 1 }, {
  get: (target, key) => target[key] ?? 16,
});
const host = tag => ({ children, testID }) => React.createElement(tag, { "data-testid": testID }, children);
const modules = {
  react: React,
  "react-native": { View: host("div"), Text: host("span"), StyleSheet: { create: value => value, absoluteFillObject: {} } },
  "../../_lib/communication": { getCommunicationRTCModule: () => ({
    RTCView: ({ streamURL }) => React.createElement("video", { "data-stream": streamURL }),
  }) },
  "../../_lib/livekit/react-native-module": { LiveKitVideoTrack: () => React.createElement("video", { "data-provider": "livekit" }) },
  "../../hooks/use-responsive-layout": { responsiveFontSize: size => size, useResponsiveLayout: () => layout },
  "../ui/ProfileMediaImage": { ProfileMediaImage: host("img") },
  "../ui/chillywood-visual-system": { CHILLYWOOD_VISUAL: { colors: {}, radii: {}, spacing: {}, typography: {} } },
};
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  fileName: filename,
}).outputText, { module, exports: module.exports, __DEV__: false,
  require: name => { assert.ok(Object.hasOwn(modules, name), `unmodeled import ${name}`); return modules[name]; },
});
const render = (participant, props = {}) => renderToStaticMarkup(React.createElement(
  module.exports.CommunicationParticipantGrid,
  { callType: "video", participants: [{ userId: "peer", displayName: "Peer", isSelf: false,
    micOn: true, cameraOn: true, connectionState: "connected", ...participant }], ...props },
));

// Execute the complete production tile through React. Only the native renderer
// is substituted; a retained RTC stream is deliberately not destroyed on mute.
for (const provider of ["legacy", "livekit"]) {
  const retained = provider === "legacy" ? { streamURL: "stream://retained" }
    : { liveKitVideoTrackReference: { publication: {} } };
  test(`${provider}: remote camera off hides retained media and shows the authoritative off state`, () => {
    const on = render({ ...retained, cameraOn: true });
    assert.match(on, /<video/);
    const off = render({ ...retained, cameraOn: false });
    assert.doesNotMatch(off, /<video|Cam On|Video connected/);
    assert.match(off, /Cam Off/);
    assert.match(off, /Connected · camera off/);
    assert.match(render({ ...retained, cameraOn: true }), /<video/,
      "a later authorized on state can reuse the retained transport");
  });
  for (const state of ["failed", "disconnected", "connecting", "waiting"]) {
    test(`${provider}: ${state} cannot be masked by a retained stream`, () => {
      const markup = render({ ...retained, connectionState: state });
      assert.doesNotMatch(markup, /Video connected|Cam On|<video/);
      assert.match(markup, new RegExp({ failed: "Connection failed", disconnected: "Disconnected",
        connecting: "Connecting", waiting: "Waiting" }[state]));
    });
  }
}
test("local camera authority and voice mode hide stale local video", () => {
  assert.doesNotMatch(render({ isSelf: true, streamURL: "stream://local" }, { localCameraEnabled: false }), /<video|Cam On/);
  assert.doesNotMatch(render({ streamURL: "stream://remote" }, { callType: "voice" }), /<video|Cam On/);
});
