import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createPickerFixture, patch } from "../tests/helpers/ios-picker-fixture.mjs";

const checkSource = process.argv.includes("--check-source");
assert(process.argv.slice(2).every(arg => arg === "--check-source"), "unknown picker probe argument");
const root = process.cwd(), out = fs.mkdtempSync(path.join(os.tmpdir(), "ios-picker-native-"));
const read = filename => fs.readFileSync(filename, "utf8");
const execute = (command, args) => execFileSync(command, args, { cwd: out, encoding: "utf8", timeout: 120_000, stdio: "pipe" });
const stripImports = source => source.replace(/^import (?:UIKit|PhotosUI)\n/gmu, "");

try {
  const project = createPickerFixture(root, path.join(out, "project"));
  const original = patch.specification.packages.map(sdk => read(path.join(project, "node_modules", sdk.name, sdk.files[0].path)));
  const receipt = patch.applyDismissalPatch(project);
  assert.deepEqual(patch.applyDismissalPatch(project), receipt);
  const handlerFiles = patch.specification.packages.map(sdk => path.join(project, "node_modules", sdk.name, sdk.files[0].path));
  const helperFile = path.join(project, "node_modules/expo-image-picker", patch.specification.helper.path);
  const helper = read(helperFile), patched = handlerFiles.map(read);
  const template = read(path.join(root, "tests/native/IosPickerDismissalTests.swift"));
  assert.equal(template.split("// INSERT_PICKER_SOURCE").length, 2);
  function compile(label, handlers, helperSource = helper) {
    const filename = path.join(out, `${label}.swift`), binary = path.join(out, label);
    fs.writeFileSync(filename, template.replace("// INSERT_PICKER_SOURCE", [helperSource, ...handlers].map(stripImports).join("\n")));
    if (!checkSource) execute("swiftc", ["-swift-version", "5", "-parse-as-library", filename, "-o", binary]);
    return binary;
  }
  function run(binary, suite, expectedFailure) {
    if (checkSource) return;
    const result = spawnSync(binary, [suite], { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.error, undefined);
    if (expectedFailure) {
      assert.equal(result.status, 1, `negative control survived: ${suite}`);
      assert.equal(result.stderr.trim(), `FAIL: ${expectedFailure}`);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /checks PASS/u);
      process.stdout.write(result.stdout);
    }
  }
  const former = compile("former-delegates", original), corrected = compile("corrected-delegates", patched);
  for (const suite of ["camera-cancel", "camera-success", "photos-cancel", "photos-success", "files-cancel", "files-success"]) {
    run(former, suite, "IOS_PICKER_RESULT_BEFORE_DISMISSAL");
  }
  run(corrected, "all");
  const duplicate = compile("duplicate-result-mutant", patched, helper.replace("guard !hasAcceptedResult else", "guard true else"));
  run(duplicate, "camera-cancel", "duplicate delegate started another dismissal");
  const early = compile("early-result-mutant", patched, helper.replace("    dismiss(picker)", "    complete()\n    dismiss(picker)"));
  run(early, "camera-cancel", "IOS_PICKER_RESULT_BEFORE_DISMISSAL");

  if (!checkSource) {
    assert.equal(process.platform, "darwin", "Real UIKit SDK compilation requires the macOS Native SDK CI lane");
    const sdk = execute("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-path"]).trim();
    const support = path.join(out, "PickerSupport.swift");
    const status = read(path.join(root, "node_modules/expo-image-picker/ios/StatusBarVisibilityController.swift"));
    fs.writeFileSync(support, `import UIKit\ntypealias MediaInfo = [UIImagePickerController.InfoKey: Any]\n${status}`);
    execute("xcrun", ["--sdk", "iphonesimulator", "swiftc", "-swift-version", "5", "-sdk", sdk,
      "-target", `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-ios15.1-simulator`,
      "-emit-library", "-module-name", "ChillywoodPickerCompileProbe", ...handlerFiles, helperFile, support,
      "-o", path.join(out, "libChillywoodPickerCompileProbe.dylib")]);
    console.log("Actual generated picker delegate/helper sources compile against UIKit and PhotosUI (unsigned simulator library).");
  }
  console.log(JSON.stringify({ generatedNativeSources: receipt }));
  console.log(checkSource
    ? "Source generation/hash/negative-control preparation passed; Swift compilation and native execution NOT RUN."
    : "Actual Swift delegate behavior and former-source/mutation controls passed; no simulator UI, app binary or physical-device proof claimed.");
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
