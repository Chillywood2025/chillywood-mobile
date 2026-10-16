#!/usr/bin/env node
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const harness = path.join(root, "tools/local-camera-inference-harness");
const production = path.join(root, "modules/chillywood-camera-effects/android/src/main");
const packageName = "expo.modules.chillywoodcameraeffects.offlinetest";
const runnerName = "expo.modules.chillywoodcameraeffects.OfflineInferenceInstrumentation";
const javaFiles = ["LocalCameraInference.java", "LocalInferenceMath.java", "EffectMath.java"];
export const ARTIFACTS = Object.freeze([
  { name: "litert", sha256: "815ef39f7d40f579adda1c7bcb7ce090685fb286777ffd8283f33202f67da1b4",
    url: "https://dl.google.com/dl/android/maven2/com/google/ai/edge/litert/litert/1.4.1/litert-1.4.1.aar" },
  { name: "litert-api", sha256: "ce5f6cc1924f0b9eb0fc339e0d3a3e6c9d041b9deb5e99f800fd6a42150f1875",
    url: "https://dl.google.com/dl/android/maven2/com/google/ai/edge/litert/litert-api/1.4.1/litert-api-1.4.1.aar" },
]);
export const MODELS = Object.freeze([
  { file: "blaze_face_short_range.tflite", sha256: "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f" },
  { file: "selfie_segmenter.tflite", sha256: "191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b" },
]);
const digest = value => createHash("sha256").update(value).digest("hex");

export function verifySource() {
  const notices = path.join(root, "modules/chillywood-camera-effects/third-party");
  const metadata = JSON.parse(fs.readFileSync(path.join(notices, "models.json"), "utf8"));
  assert.equal(metadata.runtime.coordinate, "com.google.ai.edge.litert:litert:1.4.1");
  assert.equal(metadata.runtime.apiCoordinate, "com.google.ai.edge.litert:litert-api:1.4.1");
  assert.equal(metadata.runtime.sha256, ARTIFACTS[0].sha256);
  assert.equal(metadata.runtime.apiSha256, ARTIFACTS[1].sha256);
  assert.equal(metadata.runtime.url, ARTIFACTS[0].url);
  assert.equal(metadata.runtime.apiUrl, ARTIFACTS[1].url);
  assert.equal(metadata.models.length, MODELS.length);
  for (const model of MODELS) {
    const entry = metadata.models.find(value => value.asset === model.file);
    assert.equal(entry?.sha256, model.sha256);
    assert.equal(entry.license, "Apache-2.0");
    assert(fs.statSync(path.join(notices, entry.modelCard)).size > 1000);
  }
  for (const file of [metadata.runtime.license, "MediaPipe-LICENSE.txt", "NOTICE.md"]) {
    assert(fs.statSync(path.join(notices, file)).size > 1000, `Bundled notice missing: ${file}`);
  }
  const manifest = fs.readFileSync(path.join(harness, "AndroidManifest.xml"), "utf8");
  assert.doesNotMatch(manifest, /<uses-permission|<(?:service|provider|receiver|activity)\b/u);
  assert.match(manifest, /android:testOnly="true"/u);
  assert.match(manifest, /android:handleProfiling="false"/u);
  const adapter = fs.readFileSync(path.join(production, "java/expo/modules/chillywoodcameraeffects/LocalCameraInference.java"), "utf8");
  assert.match(adapter, /setRuntime\(InterpreterApi\.Options\.TfLiteRuntime\.FROM_APPLICATION_ONLY\)/u);
  assert.match(adapter, /setUseXNNPACK\(true\)/u);
  assert.match(adapter, /setUseNNAPI\(false\)/u);
  assert.doesNotMatch(adapter, /import\s+(?:com\.google\.(?:mlkit|mediapipe|android\.gms)|java\.net)\./u);
  const inputs = javaFiles.map(file => {
    const filename = path.join(production, "java/expo/modules/chillywoodcameraeffects", file);
    return { file, sha256: digest(fs.readFileSync(filename)) };
  });
  for (const model of MODELS) {
    assert.equal(digest(fs.readFileSync(path.join(production, "assets/chillywood_models", model.file))),
      model.sha256, `Exact bundled model required: ${model.file}`);
  }
  return { sourceFiles: inputs, models: MODELS, artifacts: ARTIFACTS,
    inferenceExecuted: false, physicalDeviceEvidence: false };
}

export function parseInferenceResult(output) {
  assert.doesNotMatch(output, /CHILLYWOOD_LOCAL_INFERENCE_FAIL|INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED/u);
  assert.match(output, /INSTRUMENTATION_CODE:\s*-1\b/u, "Instrumentation must finish successfully");
  const matches = [...output.matchAll(/CHILLYWOOD_LOCAL_INFERENCE_PASS (\{[^\r\n]+\})/gu)];
  assert.equal(matches.length, 1, "One actual native-inference receipt is required");
  const receipt = JSON.parse(matches[0][1]);
  assert.equal(receipt.scope, "isolated-android-x86_64-production-adapter-inference");
  assert.equal(receipt.runtime, "standalone-litert-1.4.1-application-only-xnnpack");
  assert.equal(receipt.faceSha256, MODELS[0].sha256);
  assert.equal(receipt.maskSha256, MODELS[1].sha256);
  assert.equal(receipt.faceInvocations, 8);
  assert.equal(receipt.maskInvocations, 16);
  assert(receipt.checks > 1_000_000, "Every actual output value must be checked");
  for (const key of ["customOpWithoutXnnpackRejected", "corruptModelsRejected", "syntheticInputsOnly"]) assert.equal(receipt[key], true);
  for (const key of ["internetPermission", "physicalDeviceEvidence", "visualSubjectQualityEvidence"]) assert.equal(receipt[key], false);
  return receipt;
}

async function main() {
  const options = new Set(process.argv.slice(2));
  assert([...options].every(option => ["--source-check", "--emulator", "--build-only"].includes(option)
    || /^--serial=emulator-\d+$/u.test(option)), "Unknown option or non-emulator target");
  const sourceReceipt = verifySource();
  if (options.has("--source-check")) {
    assert.equal(options.size, 1);
    console.log(JSON.stringify({ ...sourceReceipt, scope: "source-and-model-integrity-only" }, null, 2));
    return;
  }
  assert.equal(Number(options.has("--emulator")) + Number(options.has("--build-only"))
    + [...options].filter(value => value.startsWith("--serial=")).length, 1,
  "Choose --emulator, --build-only, or an explicit --serial=emulator-N");
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  const javaHome = process.env.JAVA_HOME;
  assert(sdk && javaHome, "Android SDK and JDK must be supplied; no automatic SDK/license installation");
  const buildTools = path.join(sdk, "build-tools/35.0.0");
  const androidJar = path.join(sdk, "platforms/android-35/android.jar");
  const binaries = Object.fromEntries(["aapt2", "d8", "zipalign", "apksigner"].map(name => [name, path.join(buildTools, name)]));
  Object.assign(binaries, { javac: path.join(javaHome, "bin/javac"), keytool: path.join(javaHome, "bin/keytool"),
    adb: path.join(sdk, "platform-tools/adb"), emulator: path.join(sdk, "emulator/emulator") });
  for (const name of ["aapt2", "d8", "zipalign", "apksigner", "javac", "keytool", "adb"]) {
    assert(fs.existsSync(binaries[name]), `Required installed tool missing: ${name}`);
  }
  assert(fs.existsSync(androidJar), "Android 35 platform must already be installed");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-offline-inference-"));
  const env = { PATH: process.env.PATH, HOME: temporary, TMPDIR: temporary, JAVA_HOME: javaHome,
    ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ANDROID_USER_HOME: path.join(temporary, "android-user"),
    ANDROID_EMULATOR_HOME: path.join(temporary, "android-user"), ANDROID_AVD_HOME: path.join(temporary, "avd"),
    LANG: "C.UTF-8", CI: "1" };
  for (const directory of ["classes", "dex", "assets/chillywood_models", "avd", "android-user"]) {
    fs.mkdirSync(path.join(temporary, directory), { recursive: true });
  }
  let ownedEmulator;
  let installed = false;
  let serial;
  const run = (command, args, timeout = 180_000, input) => {
    const result = spawnSync(command, args, { cwd: temporary, env, encoding: "utf8", timeout,
      input, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.error?.message ?? result.status}\n${`${result.stdout ?? ""}\n${result.stderr ?? ""}`.slice(-8000)}`);
    return result.stdout;
  };
  try {
    // Downloads occur on the build host only. No code/model download path is
    // compiled into the APK, and no unpinned Maven/transitive resolver is used.
    for (const artifact of ARTIFACTS) {
      const response = await fetch(artifact.url, { signal: AbortSignal.timeout(60_000) });
      assert(response.ok && new URL(response.url).hostname === "dl.google.com", `Official artifact unavailable: ${artifact.name}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(digest(bytes), artifact.sha256, `${artifact.name}: immutable artifact checksum mismatch`);
      fs.writeFileSync(path.join(temporary, `${artifact.name}.aar`), bytes);
    }
    run("python3", ["-c", `import pathlib,zipfile,re,json
p=pathlib.Path('.')
for name in ['litert','litert-api']:
 with zipfile.ZipFile(p/(name+'.aar')) as z:
  manifest=z.read('AndroidManifest.xml').decode()
  assert not re.search(r'<uses-permission|<(?:service|provider|receiver|activity)\\b',manifest)
  (p/(name+'.jar')).write_bytes(z.read('classes.jar'))
  if name=='litert': (p/'libtensorflowlite_jni.so').write_bytes(z.read('jni/x86_64/libtensorflowlite_jni.so'))
 with zipfile.ZipFile(p/(name+'.jar')) as z:
  classes=[n for n in z.namelist() if n.endswith('.class')]
  assert classes and all(n.startswith('org/tensorflow/lite/') for n in classes)
print('Exact two-AAR closure: no permissions, startup components or external SDK classes')`]);
    const classpath = [androidJar, path.join(temporary, "litert.jar"), path.join(temporary, "litert-api.jar")].join(path.delimiter);
    run(binaries.javac, ["-source", "8", "-target", "8", "-classpath", classpath,
      "-d", path.join(temporary, "classes"), ...javaFiles.map(file => path.join(production, "java/expo/modules/chillywoodcameraeffects", file)),
      path.join(harness, "OfflineInferenceInstrumentation.java")]);
    run("python3", ["-c", "import pathlib,zipfile\np=pathlib.Path('classes')\nwith zipfile.ZipFile('production-and-harness.jar','w') as z:\n for f in sorted(p.rglob('*.class')): z.write(f,f.relative_to(p))"]);
    run(binaries.d8, ["--min-api", "26", "--lib", androidJar, "--output", path.join(temporary, "dex"),
      path.join(temporary, "production-and-harness.jar"), path.join(temporary, "litert.jar"), path.join(temporary, "litert-api.jar")]);
    for (const model of MODELS) fs.copyFileSync(path.join(production, "assets/chillywood_models", model.file),
      path.join(temporary, "assets/chillywood_models", model.file));
    run(binaries.aapt2, ["link", "-o", "unsigned.apk", "--manifest", path.join(harness, "AndroidManifest.xml"),
      "-I", androidJar, "-A", path.join(temporary, "assets"), "--min-sdk-version", "26", "--target-sdk-version", "35",
      "--version-code", "1", "--version-name", "offline-test"]);
    run("python3", ["-c", `import pathlib,zipfile
with zipfile.ZipFile('unsigned.apk','a') as z:
 for f in sorted(pathlib.Path('dex').glob('*.dex')): z.write(f,f.name)
 z.write('libtensorflowlite_jni.so','lib/x86_64/libtensorflowlite_jni.so')`]);
    const permissions = run(binaries.aapt2, ["dump", "permissions", "unsigned.apk"]);
    assert.doesNotMatch(permissions, /uses-permission|android\.permission\./u, "Built APK must request no permissions");
    run(binaries.zipalign, ["-f", "4", "unsigned.apk", "aligned.apk"]);
    // Ephemeral test-only signing identity, never an application/release key.
    run(binaries.keytool, ["-genkeypair", "-keystore", "ephemeral-test.jks", "-alias", "offline-test",
      "-storepass", "offline-test-only", "-keypass", "offline-test-only", "-keyalg", "RSA", "-keysize", "2048",
      "-validity", "1", "-dname", "CN=Disposable Offline Inference Test", "-noprompt"]);
    run(binaries.apksigner, ["sign", "--ks", "ephemeral-test.jks", "--ks-key-alias", "offline-test",
      "--ks-pass", "pass:offline-test-only", "--key-pass", "pass:offline-test-only", "--out", "test-only.apk", "aligned.apk"]);
    run(binaries.apksigner, ["verify", "test-only.apk"]);
    const apkSha256 = digest(fs.readFileSync(path.join(temporary, "test-only.apk")));
    if (options.has("--build-only")) {
      console.log(JSON.stringify({ ...sourceReceipt, scope: "isolated-test-apk-build-only", apkSha256 }));
      return;
    }
    serial = [...options].find(value => value.startsWith("--serial="))?.slice("--serial=".length);
    if (options.has("--emulator")) {
      assert(fs.existsSync(binaries.emulator), "Android emulator must already be installed");
      const avdmanager = path.join(sdk, "cmdline-tools/latest/bin/avdmanager");
      assert(fs.existsSync(avdmanager), "Installed avdmanager required");
      const avdName = `chillywood-offline-${process.pid}`;
      run(avdmanager, ["create", "avd", "--name", avdName, "--package", "system-images;android-35;default;x86_64"], 180_000, "no\n");
      serial = "emulator-5558";
      assert(!run(binaries.adb, ["devices"]).split(/\r?\n/u).some(line => line.startsWith(`${serial}\t`)),
        "Reserved emulator port is already in use; refusing to target another emulator");
      const log = fs.openSync(path.join(temporary, "emulator.log"), "w");
      ownedEmulator = spawn(binaries.emulator, ["-avd", avdName, "-port", "5558", "-no-window", "-no-audio",
        "-no-boot-anim", "-no-snapshot", "-no-metrics", "-gpu", "swiftshader_indirect", "-accel", "auto"],
      { cwd: temporary, env, stdio: ["ignore", log, log] });
      let emulatorError;
      ownedEmulator.once("error", error => { emulatorError = error; });
      fs.closeSync(log);
      const deadline = Date.now() + 10 * 60_000;
      while (true) {
        if (emulatorError) throw emulatorError;
        assert(ownedEmulator.exitCode === null, `Owned emulator exited before boot: ${fs.readFileSync(path.join(temporary, "emulator.log"), "utf8").slice(-3000)}`);
        const boot = spawnSync(binaries.adb, ["-s", serial, "shell", "getprop", "sys.boot_completed"],
          { cwd: temporary, env, encoding: "utf8", timeout: 10_000 });
        if (boot.status === 0 && boot.stdout.trim() === "1") break;
        assert(Date.now() < deadline, "Isolated AOSP emulator failed to boot within ten minutes");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      assert.equal(run(binaries.adb, ["-s", serial, "emu", "avd", "name"]).split(/\r?\n/u)[0].trim(),
        avdName, "The booted emulator must be the disposable instance created by this run");
    }
    assert.match(serial, /^emulator-\d+$/u, "Physical device execution is forbidden");
    assert.equal(run(binaries.adb, ["-s", serial, "shell", "getprop", "ro.kernel.qemu"]).trim(), "1", "Only an emulator may run this test");
    assert.doesNotMatch(run(binaries.adb, ["-s", serial, "shell", "pm", "list", "packages"]), /package:com\.google\.android\.gms\b/u,
      "Use an AOSP image, not a Google/Play-services image");
    run(binaries.adb, ["-s", serial, "install", "-t", "--no-incremental", path.join(temporary, "test-only.apk")]);
    installed = true;
    const output = run(binaries.adb, ["-s", serial, "shell", "am", "instrument", "-w", `${packageName}/${runnerName}`], 10 * 60_000);
    const receipt = parseInferenceResult(output);
    console.log(JSON.stringify({ ...receipt, apkSha256, sourceFiles: sourceReceipt.sourceFiles, artifacts: ARTIFACTS }, null, 2));
  } finally {
    if (installed && serial) {
      spawnSync(binaries.adb, ["-s", serial, "uninstall", packageName], { cwd: temporary, env, encoding: "utf8", timeout: 30_000 });
    }
    if (ownedEmulator) {
      ownedEmulator.kill("SIGTERM");
      await Promise.race([new Promise(resolve => ownedEmulator.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (ownedEmulator.exitCode === null) ownedEmulator.kill("SIGKILL");
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
