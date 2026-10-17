import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {assertLocalCameraProviderClosure} from '../scripts/camera-provider-closure.mjs';
const runtime = JSON.parse(fs.readFileSync(new URL('../modules/chillywood-camera-effects/third-party/models.json', import.meta.url))).runtime;
const allowed = [
  {group:'com.google.ai.edge.litert',name:'litert',version:'1.4.1',sha256:runtime.sha256},
  {group:'com.google.ai.edge.litert',name:'litert-api',version:'1.4.1',sha256:runtime.apiSha256},
  {group:'androidx.camera',name:'camera-core'},
  {group:'com.google.android.datatransport',name:'transport-runtime'},
];
const manifests=['<manifest><uses-permission android:name="android.permission.CAMERA"/><application/></manifest>'];
test('local bundled runtime accepts app-local LiteRT without suppressing unrelated Firebase transport',()=>{
  assertLocalCameraProviderClosure(allowed,manifests,runtime);
});
for(const artifact of [
  {group:'com.google.mlkit',name:'barcode-scanning'},
  {group:'com.google.mlkit',name:'face-detection'},
  {group:'com.google.mlkit',name:'segmentation-selfie'},
  {group:'androidx.camera',name:'camera-mlkit-vision'},
  {group:'com.google.android.gms',name:'play-services-code-scanner'},
  {group:'com.google.android.gms',name:'play-services-mlkit-face-detection'},
  {group:'com.google.android.gms',name:'play-services-tflite-java'},
  {group:'com.google.android.gms',name:'play-services-tflite-gpu'},
  {group:'com.google.mediapipe',name:'tasks-core'},
  {group:'com.google.mediapipe',name:'tasks-vision'},
]) test(`resolved closure rejects provider reintroduction ${artifact.group}:${artifact.name}`,()=>{
  assert.throws(()=>assertLocalCameraProviderClosure([...allowed,artifact],manifests,runtime),/Forbidden camera provider/u);
});
for(const metadata of ['com.google.mlkit.vision.DEPENDENCIES','barcode_ui','com.google.mediapipe.tasks','play-services-tflite']) {
  test(`actual merged manifest rejects ${metadata}`,()=>{
    assert.throws(()=>assertLocalCameraProviderClosure(allowed,[`<manifest><application><meta-data android:name="${metadata}"/></application></manifest>`],runtime),assert.AssertionError);
  });
}
test('missing or malformed resolution/manifest proof cannot pass',()=>{
  for(const [artifacts,xml] of [[[],manifests],[allowed,[]],[[{}],manifests],[allowed,['']],[null,manifests]])
    assert.throws(()=>assertLocalCameraProviderClosure(artifacts,xml,runtime),assert.AssertionError);
});

for (const index of [0,1]) for (const mutation of ['missing','duplicate','version','sha256']) {
  test(`resolved runtime ${index} rejects ${mutation} drift`,()=>{
    const changed = structuredClone(allowed);
    if(mutation === 'missing') changed.splice(index,1);
    else if(mutation === 'duplicate') changed.push({...changed[index]});
    else changed[index][mutation] = mutation === 'version' ? '1.4.2' : '0'.repeat(64);
    assert.throws(()=>assertLocalCameraProviderClosure(changed,manifests,runtime),assert.AssertionError);
  });
}
