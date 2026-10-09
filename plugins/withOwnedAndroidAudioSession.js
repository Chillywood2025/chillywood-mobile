const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { createRunOncePlugin, withDangerousMod } = require("@expo/config-plugins");

const PLUGIN_NAME = "with-owned-android-audio-session";
const SDK_VERSION = "2.10.0";
const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");
const packagePrefix = "android/src/main/java/com/livekit/reactnative/";
const coordinatorPath = `${packagePrefix}audio/ChillywoodOwnedAudioSession.java`;
const COORDINATOR_SHA256 = "3fa3b8f63222ec9bab052a92a40b980fa6e64a34aa65ce9f7e140dfa2190d519";
const WEBRTC_VERSION = "144.0.0";
const trackProbePath = "android/src/main/java/org/webrtc/audio/ChillywoodAudioTrackRoute.java";
const accessorPath = "android/src/main/java/com/oney/WebRTCModule/ChillywoodAudioModuleAccessor.java";
const TRACK_PROBE_SHA256 = "9c163cdb41a57dcb3d6e7a2cf88747800d2801499a5df10599e3ae05df90f1bd";
const ACCESSOR_SHA256 = "08b55cec912d6350e119ffb6b3dd631b51702858a3b9a4d5dace558fa1add5f9";
const webRtcInputs = {
  "android/build.gradle": ["345a133d213dae45fc462a54e7ff9e73f2778aa9d028f837679fa0e645097c97"],
  "android/consumer-rules.pro": ["8d9cde2d745a6e3992746e1673be9d6b86d6034864c9deb3633be2c2fa04c7d1"],
  "android/src/main/java/com/oney/WebRTCModule/WebRTCModuleOptions.java": ["359631674cfa1f525008c73b521e6da5388a894e75578cff48ca511852e51300"],
  "android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java": [
    "ed4aa8eacfa1311f681de34cae94d1bac5c4a2984ae7c9ad6835217e408dda20",
    "bd5fe459edd9089ca418e214bf4f39120b55a898f9b0035408315a8a2e818df1",
  ],
};

const definitions = {
  manager: {
    relativePath: `${packagePrefix}audio/AudioSwitchManager.java`,
    originalSha256: "ab57adfe9bb5caa3842c5cbb3d8cc4f433c1210ee3995283c25d2a9408baaf79",
    patchedSha256: "7eaa16da0c5680d73e9589115e5a03948d4c21f0b66419f3b841adface6f0ea3",
  },
  module: {
    relativePath: `${packagePrefix}LivekitReactNativeModule.kt`,
    originalSha256: "9bcf637cb346a97f37e637e0b2c55a5fdac454d115d0ad2f00ee3c7c40da25b8",
    patchedSha256: "b2304261e0869eb41537a9c074c2aa0a6df257ecd8aa068816609ec99090f26a",
  },
  setup: {
    relativePath: `${packagePrefix}LiveKitReactNative.kt`,
    originalSha256: "de90d742453af30a72e4a643550e6a4aabcb542586584f6ba221084fb1fd2fe4",
    patchedSha256: "60aca0f48ece119ace67dddfbef90536db95a9105d617b68177c2b4ca32fa8e3",
  },
};

function replaceExactly(source, from, to) {
  if (source.split(from).length !== 2) throw new Error(`${PLUGIN_NAME}: native source anchor changed.`);
  return source.replace(from, to);
}

function transformKnownSource(kind, source) {
  if (kind === "manager") {
    source = replaceExactly(source, "    private AudioSwitch audioSwitch;", "    private AudioSwitch audioSwitch;\n\n    public final ChillywoodOwnedAudioSession ownedSession;");
    source = replaceExactly(source, "        preferredDeviceList.add(AudioDevice.Earpiece.class);", "        preferredDeviceList.add(AudioDevice.Earpiece.class);\n        ownedSession = new ChillywoodOwnedAudioSession(context, this);");
    const start = source.indexOf("    public void start() {");
    const end = source.indexOf("    public void setMicrophoneMute", start);
    if (start < 0 || end < start) throw new Error(`${PLUGIN_NAME}: lifecycle anchors changed.`);
    source = source.slice(0, start) + `    public void start() {
        ownedSession.runUnowned(this::startOnMainThread);
    }

    void startOnMainThread() {
        if (audioSwitch != null) return;
        audioSwitch = new AudioSwitch(context, loggingEnabled, audioFocusChangeListener, preferredDeviceList);
        audioSwitch.setManageAudioFocus(manageAudioFocus);
        audioSwitch.setFocusMode(focusMode);
        audioSwitch.setAudioMode(audioMode);
        audioSwitch.setAudioStreamType(audioStreamType);
        audioSwitch.setAudioAttributeContentType(audioAttributeContentType);
        audioSwitch.setAudioAttributeUsageType(audioAttributeUsageType);
        audioSwitch.setForceHandleAudioRouting(forceHandleAudioRouting);
        Runnable devicesChanged = ownedSession.createDeviceChangeObserver();
        audioSwitch.start((devices, currentDevice) -> {
            audioDeviceChangeListener.invoke(devices, currentDevice);
            devicesChanged.run();
            return Unit.INSTANCE;
        });
        audioSwitch.activate();
    }

    void prepareOwnedDefaultOnMainThread(String output) {
        preferredDeviceList = new ArrayList<>();
        preferredDeviceList.add(AudioDevice.BluetoothHeadset.class);
        preferredDeviceList.add(AudioDevice.WiredHeadset.class);
        preferredDeviceList.add("earpiece".equals(output) ? AudioDevice.Earpiece.class : AudioDevice.Speakerphone.class);
        preferredDeviceList.add("earpiece".equals(output) ? AudioDevice.Speakerphone.class : AudioDevice.Earpiece.class);
    }

    boolean ownedDefaultObservedOnMainThread(String selected) {
        return selected.equals(ownedSelectedOutputOnMainThread());
    }

    String ownedSelectedOutputOnMainThread() {
        AudioDevice selectedDevice = selectedAudioDevice();
        if (selectedDevice == null) return "none";
        AudioDeviceKind kind = AudioDeviceKind.fromAudioDevice(selectedDevice);
        if (kind == null) return "none";
        return ("speaker".equals(kind.typeName) || "earpiece".equals(kind.typeName)) ? kind.typeName : "other";
    }

    boolean ownedOutputAvailableOnMainThread(String output) {
        for (AudioDevice device : availableAudioDevices()) {
            AudioDeviceKind kind = AudioDeviceKind.fromAudioDevice(device);
            if (kind != null && output.equals(kind.typeName)) return true;
        }
        return false;
    }

    public void stop() {
        ownedSession.runUnowned(this::stopOnMainThread);
    }

    void stopOnMainThread() {
        if (audioSwitch != null) audioSwitch.stop();
        audioSwitch = null;
    }

    boolean isStartedOnMainThread() { return audioSwitch != null; }

` + source.slice(end);
    const selectStart = source.indexOf("    public void selectAudioOutput(@NonNull Class");
    const selectEnd = source.indexOf("    public void selectAudioOutput(@Nullable AudioDeviceKind kind)", selectStart);
    if (selectStart < 0 || selectEnd < selectStart) throw new Error(`${PLUGIN_NAME}: selection anchors changed.`);
    source = source.slice(0, selectStart) + `    public void selectAudioOutput(@NonNull Class<? extends AudioDevice> audioDeviceClass) {
        ownedSession.runUnowned(() -> selectAudioOutputClassOnMainThread(audioDeviceClass));
    }

    private boolean selectAudioOutputClassOnMainThread(Class<? extends AudioDevice> audioDeviceClass) {
        if (audioSwitch == null) return false;
        for (AudioDevice device : availableAudioDevices()) {
            if (device.getClass().equals(audioDeviceClass)) {
                audioSwitch.selectDevice(device);
                return true;
            }
        }
        return false;
    }

    boolean selectAudioOutputOnMainThread(AudioDeviceKind kind) {
        return kind != null && selectAudioOutputClassOnMainThread(kind.audioDeviceClass);
    }

    public void enableSpeakerphone(boolean enable) {
        ownedSession.runUnowned(() -> audioManager.setSpeakerphoneOn(enable));
    }

` + source.slice(selectEnd);
    return source;
  }
  if (kind === "module") {
    source = replaceExactly(source, "    val audioManager = AudioSwitchManager(reactContext.applicationContext)", `    val audioManager = AudioSwitchManager(reactContext.applicationContext)
    init {
        audioManager.ownedSession.setLegacyRouteProbe(org.webrtc.audio.ChillywoodAudioTrackRoute(reactContext))
        audioManager.ownedSession.setRouteListener { receipt ->
            reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("ChillywoodAndroidAudioRouteChanged", receipt)
        }
    }`);
    source = replaceExactly(source, "    fun configureAudio(config: ReadableMap) {", `    fun configureAudio(config: ReadableMap) {
        audioManager.ownedSession.runUnowned { configureAudioUnowned(config) }
    }

    private fun configureAudioUnowned(config: ReadableMap) {`);
    source = replaceExactly(source, "    @ReactMethod\n    fun startAudioSession() {", `    @ReactMethod
    fun acquireOwnedAudioSession(owner: String, defaultOutput: String, promise: Promise) {
        audioManager.ownedSession.acquire(owner, defaultOutput, promise)
    }

    @ReactMethod
    fun releaseOwnedAudioSession(owner: String, promise: Promise) {
        audioManager.ownedSession.release(owner, promise)
    }

    @ReactMethod
    fun selectOwnedAudioOutput(owner: String, output: String, promise: Promise) {
        audioManager.ownedSession.select(owner, output, promise)
    }

    @ReactMethod
    fun readOwnedAudioRoute(owner: String, promise: Promise) {
        audioManager.ownedSession.read(owner, promise)
    }

    @ReactMethod
    fun startAudioSession() {`);
    return replaceExactly(source, "    override fun invalidate() {", "    override fun invalidate() {\n        audioManager.ownedSession.invalidate()");
  }
  if (kind === "setup") {
    source = replaceExactly(source, "        adm = JavaAudioDeviceModule.builder(context)",
      "        val routeObserver = org.webrtc.audio.ChillywoodAudioTrackRoute.Observer()\n        adm = JavaAudioDeviceModule.builder(context)");
    source = replaceExactly(source, "            .setSamplesReadyCallback(audioRecordSamplesDispatcher)",
      "            .setSamplesReadyCallback(audioRecordSamplesDispatcher)\n            .setAudioTrackStateCallback(routeObserver)");
    return replaceExactly(source, "            .createAudioDeviceModule()",
      "            .createAudioDeviceModule()\n        routeObserver.bind(adm!!)");
  }
  throw new Error(`${PLUGIN_NAME}: unsupported source.`);
}

function transformSource(kind, source) {
  const definition = definitions[kind];
  const current = digest(source);
  if (current === definition.patchedSha256) return source;
  if (current !== definition.originalSha256) throw new Error(`${PLUGIN_NAME}: unreviewed ${kind} source digest.`);
  const next = transformKnownSource(kind, source);
  if (digest(next) !== definition.patchedSha256) throw new Error(`${PLUGIN_NAME}: generated ${kind} digest mismatch.`);
  return next;
}

function packageRootFor(projectRoot, name, version) {
  // SDK 2.10.0 hides package.json in exports and its default export omits a
  // Node-resolvable extension. Resolve package search roots without loading it.
  const search = createRequire(path.join(projectRoot, "package.json")).resolve.paths(name) || [];
  const packagePath = search.map((root) => path.join(root, name, "package.json"))
    .find((candidate) => fs.existsSync(candidate));
  if (!packagePath) throw new Error(`${PLUGIN_NAME}: pinned SDK package is missing.`);
  const sdk = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (sdk.name !== name || sdk.version !== version) {
    throw new Error(`${PLUGIN_NAME}: review required for SDK version ${sdk.version}.`);
  }
  return path.dirname(packagePath);
}

function applyOwnedAudioPatch(projectRoot) {
  const packageRoot = packageRootFor(projectRoot, "@livekit/react-native", SDK_VERSION);
  const webRtcRoot = packageRootFor(projectRoot, "@livekit/react-native-webrtc", WEBRTC_VERSION);
  for (const [relative, known] of Object.entries(webRtcInputs)) {
    if (!known.includes(digest(fs.readFileSync(path.join(webRtcRoot, relative))))) {
      throw new Error(`${PLUGIN_NAME}: unreviewed WebRTC native input ${relative}.`);
    }
  }
  const coordinator = fs.readFileSync(require.resolve("./native/ChillywoodOwnedAudioSession.java"), "utf8");
  if (digest(coordinator) !== COORDINATOR_SHA256) throw new Error(`${PLUGIN_NAME}: coordinator digest mismatch.`);
  const changes = Object.entries(definitions).map(([kind, definition]) => {
    const filename = path.join(packageRoot, definition.relativePath);
    return [filename, transformSource(kind, fs.readFileSync(filename, "utf8"))];
  });
  const generatedSources = [
    [path.join(packageRoot, coordinatorPath), coordinator, COORDINATOR_SHA256],
    [path.join(packageRoot, trackProbePath), fs.readFileSync(require.resolve("./native/ChillywoodAudioTrackRoute.java"), "utf8"), TRACK_PROBE_SHA256],
    [path.join(webRtcRoot, accessorPath), fs.readFileSync(require.resolve("./native/ChillywoodAudioModuleAccessor.java"), "utf8"), ACCESSOR_SHA256],
  ];
  for (const [filename, source, expected] of generatedSources) {
    if (digest(source) !== expected) throw new Error(`${PLUGIN_NAME}: generated helper digest mismatch.`);
    if (fs.existsSync(filename) && digest(fs.readFileSync(filename)) !== expected) {
      throw new Error(`${PLUGIN_NAME}: unreviewed existing coordinator or helper.`);
    }
  }
  // Verify every input before writing any generated source.
  for (const [filename, source] of changes) fs.writeFileSync(filename, source);
  for (const [filename, source] of generatedSources) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  }
  return { sdkVersion: SDK_VERSION, webRtcVersion: WEBRTC_VERSION, nativeWebRtcVersion: "144.7559.01",
    managerSha256: definitions.manager.patchedSha256, moduleSha256: definitions.module.patchedSha256,
    setupSha256: definitions.setup.patchedSha256, coordinatorSha256: COORDINATOR_SHA256,
    trackProbeSha256: TRACK_PROBE_SHA256, accessorSha256: ACCESSOR_SHA256 };
}

module.exports = createRunOncePlugin((config) => withDangerousMod(config, ["android", (next) => {
  applyOwnedAudioPatch(next.modRequest.projectRoot);
  return next;
}]), PLUGIN_NAME, "1.0.0");
module.exports.__test = { SDK_VERSION, definitions, coordinatorPath, COORDINATOR_SHA256, digest,
  WEBRTC_VERSION, webRtcInputs, trackProbePath, accessorPath, TRACK_PROBE_SHA256, ACCESSOR_SHA256,
  transformKnownSource, transformSource, applyOwnedAudioPatch };
