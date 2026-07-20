import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (relativePath) => sha256(fs.readFileSync(path.join(ROOT, relativePath)));
const normalizePath = (value) => String(value ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const localPackageDirectory = (lockPath) => path.join(ROOT, normalizePath(lockPath));
const packageHasAndroidNativeCode = (lockPath, lockEntry) => {
  const directory = localPackageDirectory(lockPath);
  if (!fs.existsSync(directory)) return false;
  if (fs.existsSync(path.join(directory, "android"))) return true;
  if (lockEntry?.name === "expo" || lockEntry?.name === "react-native") return true;

  const expoModuleConfigPath = path.join(directory, "expo-module.config.json");
  if (fs.existsSync(expoModuleConfigPath)) {
    const expoModuleConfig = JSON.parse(fs.readFileSync(expoModuleConfigPath, "utf8"));
    return Array.isArray(expoModuleConfig?.platforms) && expoModuleConfig.platforms.includes("android")
      || Array.isArray(expoModuleConfig?.android?.modules) && expoModuleConfig.android.modules.length > 0;
  }
  return false;
};

const collectNativePackages = (packageLock) => Object.entries(packageLock.packages ?? {})
  .filter(([lockPath, lockEntry]) => lockPath.startsWith("node_modules/") && packageHasAndroidNativeCode(lockPath, lockEntry))
  .map(([lockPath, lockEntry]) => ({
    lockPath: normalizePath(lockPath),
    name: lockEntry.name ?? normalizePath(lockPath).replace(/^node_modules\//u, ""),
    version: String(lockEntry.version ?? ""),
    integrity: String(lockEntry.integrity ?? ""),
  }))
  .sort((left, right) => left.lockPath.localeCompare(right.lockPath));

const resolveAssetEvidence = (candidatePaths) => [...new Set(candidatePaths
  .map(normalizePath)
  .filter(Boolean))]
  .sort()
  .map((relativePath) => {
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return { path: relativePath, sha256: null };
    }
    return { path: relativePath, sha256: sha256File(relativePath) };
  });

const normalizeAndroidPlugin = (plugin) => {
  const [name, options] = Array.isArray(plugin) ? plugin : [plugin, undefined];
  const pluginName = String(name ?? "");
  if ([
    "./plugins/withChillyChatIosNativeCalls",
    "./plugins/withLiveKitIosStaticFrameworkCompatibility",
  ].includes(pluginName)) return null;
  if (pluginName === "expo-build-properties") {
    return [pluginName, { android: options?.android ?? {} }];
  }
  return options === undefined ? pluginName : [pluginName, options];
};

export function computeAndroidNativeCompatibility() {
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const appJson = readJson("app.json").expo;
  const easJson = readJson("eas.json");
  const nativePackages = collectNativePackages(packageLock);
  const imageManipulator = nativePackages.find((entry) => entry.name === "expo-image-manipulator");
  const combinedPlugins = [
    ...(Array.isArray(appJson.plugins) ? appJson.plugins : []),
    "expo-asset",
    "@livekit/react-native-expo-plugin",
    "./plugins/withLiveKitIosStaticFrameworkCompatibility",
    ["expo-notifications", {
      sounds: [
        "./assets/sounds/chilly-chat/chilly_ring.wav",
        "./assets/sounds/chilly-chat/skyline_pulse.wav",
        "./assets/sounds/chilly-chat/theater_bell.wav",
        "./assets/sounds/chilly-chat/velvet_knock.wav",
        "./assets/sounds/chilly-chat/quiet_buzz.wav",
        "./assets/sounds/chilly-chat/classic_phone.wav",
      ],
    }],
    "./plugins/withChillyChatNativeCallNotifications",
    "./plugins/withChillyChatIosNativeCalls",
    "@react-native-firebase/app",
    "@react-native-firebase/crashlytics",
    "@react-native-firebase/perf",
    ["expo-build-properties", { ios: { useFrameworks: "static" } }],
  ];
  const pluginMap = new Map();
  combinedPlugins.forEach((plugin) => {
    const normalized = normalizeAndroidPlugin(plugin);
    if (!normalized) return;
    const name = Array.isArray(normalized) ? normalized[0] : normalized;
    pluginMap.set(name, normalized);
  });
  const androidPlugins = [...pluginMap.values()];
  const localPluginEvidence = androidPlugins
    .map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin)
    .filter((pluginName) => pluginName.startsWith("./"))
    .map((pluginName) => {
      const candidates = [`${pluginName}.js`, `${pluginName}.ts`, pluginName];
      const relativePath = candidates.map(normalizePath).find((candidate) => fs.existsSync(path.join(ROOT, candidate)));
      if (!relativePath) return { path: normalizePath(pluginName), sha256: null };
      return { path: relativePath, sha256: sha256File(relativePath) };
    });
  const androidAssets = resolveAssetEvidence([
    appJson.icon,
    appJson.android?.adaptiveIcon?.foregroundImage,
    appJson.android?.adaptiveIcon?.backgroundImage,
    appJson.android?.adaptiveIcon?.monochromeImage,
    "assets/images/splash-icon.png",
    "google-services.json",
    "assets/sounds/chilly-chat/chilly_ring.wav",
    "assets/sounds/chilly-chat/skyline_pulse.wav",
    "assets/sounds/chilly-chat/theater_bell.wav",
    "assets/sounds/chilly-chat/velvet_knock.wav",
    "assets/sounds/chilly-chat/quiet_buzz.wav",
    "assets/sounds/chilly-chat/classic_phone.wav",
  ]);
  const input = canonicalize({
    schemaVersion: 1,
    expoSdkVersion: packageJson.dependencies?.expo ?? null,
    reactNativeVersion: packageJson.dependencies?.["react-native"] ?? null,
    androidConfig: {
      applicationId: appJson.android?.package ?? null,
      permissions: appJson.android?.permissions ?? [],
      adaptiveIcon: appJson.android?.adaptiveIcon ?? null,
      edgeToEdgeEnabled: appJson.android?.edgeToEdgeEnabled ?? null,
      predictiveBackGestureEnabled: appJson.android?.predictiveBackGestureEnabled ?? null,
      newArchEnabled: appJson.newArchEnabled ?? null,
      orientation: appJson.orientation ?? null,
      scheme: appJson.scheme ?? null,
    },
    productionBuildProfile: {
      channel: easJson.build?.production?.channel ?? null,
      distribution: easJson.build?.production?.distribution ?? null,
      environment: easJson.build?.production?.environment ?? null,
      android: easJson.build?.production?.android ?? null,
    },
    androidPlugins,
    localPluginEvidence,
    androidAssets,
    nativePackages,
  });
  return {
    digest: sha256(JSON.stringify(input)),
    input,
    summary: {
      nativePackageCount: nativePackages.length,
      expoImageManipulatorVersion: imageManipulator?.version ?? null,
      expoImageManipulatorIntegrityPresent: Boolean(imageManipulator?.integrity),
      androidPluginCount: androidPlugins.length,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = computeAndroidNativeCompatibility();
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stdout.write(`${result.digest}\n`);
}
