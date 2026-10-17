import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = new URL("../modules/chillywood-camera-effects/", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("third-party/models.json", root), "utf8"));
const read = relative => fs.readFileSync(new URL(relative, root), "utf8");

test("bundled licensed model assets have exact provenance and integrity", () => {
  for (const model of manifest.models) {
    const bytes = fs.readFileSync(new URL(`android/src/main/assets/chillywood_models/${model.asset}`, root));
    assert.equal(bytes.length, model.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), model.sha256);
    assert.equal(bytes.subarray(4, 8).toString(), "TFL3");
    assert.equal(model.license, "Apache-2.0");
    assert.match(model.url, /\/1\/[^/]+\.tflite$/u);
    assert(fs.readFileSync(new URL(`third-party/${model.modelCard}`, root)).subarray(0, 4).equals(Buffer.from("%PDF")));
  }
  assert.match(read("third-party/LiteRT-1.4.1-LICENSE.txt"), /Apache License/u);
  assert.match(read("third-party/MediaPipe-LICENSE.txt"), /Apache License/u);
});

test("production inference selects standalone pinned application runtime with no remote path", () => {
  const source = read("android/src/main/java/expo/modules/chillywoodcameraeffects/LocalCameraInference.java");
  assert.match(source, /FROM_APPLICATION_ONLY/u);
  assert.match(source, /setUseXNNPACK\(true\)/u);
  assert.match(source, /setUseNNAPI\(false\)/u);
  for (const model of manifest.models) assert(source.includes(model.sha256));
  assert.doesNotMatch(source, /https?:|java\.net|android\.net|DownloadManager|FROM_SYSTEM_ONLY|PREFER_SYSTEM_OVER_APPLICATION/u);
  const gradle = read("android/build.gradle");
  assert(gradle.includes(manifest.runtime.coordinate));
  assert(gradle.includes(manifest.runtime.apiCoordinate));
  assert.doesNotMatch(gradle, /implementation ['"].*(?:mlkit|mediapipe|play-services-tflite)/u);
  const dir = new URL("android/src/main/java/expo/modules/chillywoodcameraeffects/", root);
  for (const file of fs.readdirSync(dir).filter(file => /\.(?:java|kt)$/u.test(file))) {
    const content = fs.readFileSync(path.join(dir.pathname, file), "utf8");
    assert.doesNotMatch(content, /import com\.google\.(?:mlkit|mediapipe)/u);
  }
});
