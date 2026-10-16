# Local camera inference provenance

The two unmodified version-1 model assets are redistributed under Apache-2.0,
as expressly stated in their included Google model cards. Their original author
and evaluation information is in those cards. The corresponding Apache license
is included in MediaPipe-LICENSE.txt. models.json records immutable versioned
upstream URLs and SHA-256 hashes; runtime code checks the hashes before use.
No model is downloaded at application runtime.

Standalone LiteRT 1.4.1 is Apache-2.0. Its complete distributed LICENSE, including
third-party notices (including Caffe), is retained in LiteRT-1.4.1-LICENSE.txt.
The application does not use the MediaPipe Tasks SDK, ML Kit, or Play Services
inference. It does not extract models from ML Kit.

LocalInferenceMath implements the published BlazeFace preprocessing, fixed SSD
anchor layout and weighted non-maximum suppression specification. Reference:
Google/MediaPipe v0.10.21 face_detection_short_range.pbtxt, face_detection.pbtxt,
ssd_anchors_calculator.cc, and non_max_suppression_calculator.cc. MediaPipe
source is Copyright The MediaPipe Authors, Apache-2.0. This app-owned Java
implementation changes the input path to NV21 and returns only a face region;
it does not include the MediaPipe graph/runtime or remote logging classes.

## Privacy evidence and limits

The pinned standalone runtime POM depends solely on litert-api, whose POM has
no dependencies. Both AAR manifests contain no initialization providers,
services or permissions. Static inspection found no networking calls in their
Java interpreter path or direct network socket imports in their four native
ABIs. Source implements telemetry events as callbacks to a local profiler;
the app installs no telemetry profiler. Android local ATrace profiling can be
enabled by the OS debug.tflite.trace property; that is not a remote uploader.

The application explicitly chooses FROM_APPLICATION_ONLY and XNNPACK, excludes
Play Services TFLite and MediaPipe Tasks in the resolved app dependency guard,
and checks the generated manifest. The runtime API contains a system-loader
route, making the dependency exclusion important. The official MediaPipe Tasks
0.10.21 published AAR includes remote logging even though its public TaskRunner
source uses a dummy logger; it must not be substituted for standalone LiteRT.

These are scoped controls and evidence for camera inference. They are not a
claim that unrelated app providers, device services or the operating system
never communicate. Synthetic offline emulator inference establishes model /
custom-op execution, not camera quality, thermal performance, physical-device
compatibility, or remote participant receipt. Existing physical QA gates remain.
