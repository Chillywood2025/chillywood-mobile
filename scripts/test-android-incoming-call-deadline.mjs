import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Executes generated Kotlin, not a JavaScript reimplementation or a source-text
// assertion. JVM mode uses a local Kotlin compiler and JUnit4/stdlib classpath
// without downloads. --android uses the locked Gradle wrapper and declared test
// dependencies. Neither mode builds, installs or publishes a mobile app.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { nativeFiles } = require("../plugins/withChillyChatNativeCallNotifications.js").__test;
const android = process.argv.includes("--android");
assert(process.argv.slice(2).every((arg) => arg === "--android"), "Only --android is supported.");
const compileClasspath = process.env.CHILLY_KOTLIN_COMPILER_CLASSPATH;
const testClasspath = process.env.CHILLY_ANDROID_JVM_TEST_CLASSPATH;
if (!android) assert(testClasspath, "Set CHILLY_ANDROID_JVM_TEST_CLASSPATH to local Kotlin stdlib, JUnit4 and Hamcrest jars, or use --android.");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-android-deadline-"));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
const write = (relative, text) => {
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
};
const runAndroid = () => {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  assert(sdk && fs.existsSync(path.join(sdk, "platforms/android-36/android.jar")), "--android requires Android SDK platform36 (hosted ubuntu-24.04 Android SDK) and Java17+.");
  assert(fs.existsSync(path.join(sdk, "build-tools/36.0.0/source.properties")), "--android requires the repository's Android SDK build-tools36.0.0.");
  const javaHome = process.env.JAVA_HOME;
  assert(javaHome && fs.existsSync(path.join(javaHome, "bin/javac")), "--android requires JAVA_HOME to point to a full Java17+ JDK, including javac; a JRE alone cannot run Android compilation.");
  // Wrapper bytes come from the npm-locked Expo template, not a downloaded
  // executable script. The Gradle distribution additionally has a pinned digest.
  const template = path.join(root, "node_modules/expo/template.tgz");
  for (const file of ["gradlew", "gradle/wrapper/gradle-wrapper.jar", "gradle/wrapper/gradle-wrapper.properties"]) {
    const extracted = run("tar", ["-xOf", template, `package/android/${file}`], { encoding: null });
    write(file, extracted);
  }
  const propertiesPath = path.join(output, "gradle/wrapper/gradle-wrapper.properties");
  const properties = fs.readFileSync(propertiesPath, "utf8");
  assert(properties.includes("gradle-8.14.3-bin.zip"), "Review the native test harness when the locked Expo Gradle version changes.");
  fs.appendFileSync(propertiesPath, "\ndistributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531\n");
  const versions = fs.readFileSync(path.join(root, "node_modules/@react-native/gradle-plugin/gradle/libs.versions.toml"), "utf8");
  assert(versions.includes('agp = "8.11.0"') && versions.includes('kotlin = "2.1.20"'), "Review native test harness compiler versions after a React Native dependency update.");
  write("local.properties", `sdk.dir=${sdk.replaceAll("\\", "\\\\")}\n`);
  write("gradle.properties", "android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2g\n");
  write("settings.gradle.kts", `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "chillywood-incoming-call-native-tests"
`);
  write("build.gradle.kts", `plugins {
  id("com.android.library") version "8.11.0"
  id("org.jetbrains.kotlin.android") version "2.1.20"
}
android {
  namespace = "com.chillywood.mobile"
  compileSdk = 36
  buildToolsVersion = "36.0.0"
  defaultConfig { minSdk = 24 }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
  testOptions { unitTests.isIncludeAndroidResources = true }
}
dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.lifecycle:lifecycle-process:2.8.7")
  testImplementation("junit:junit:4.13.2")
  testImplementation("androidx.test:core:1.6.1")
  testImplementation("org.robolectric:robolectric:4.13")
}
tasks.withType<Test>().configureEach {
  systemProperty("robolectric.dependency.repo.url", "https://repo.maven.apache.org/maven2")
  testLogging { events("passed", "failed", "skipped") }
}
`);
  write("src/main/AndroidManifest.xml", `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
<application><receiver android:name=".ChillyChatCallNotificationActionReceiver" android:exported="false" /></application>
</manifest>\n`);
  // A local test resource supplies R.mipmap without copying product icon pixels.
  // AndroidX resources are merged by AGP, so CallStyle uses its real layouts.
  write("src/main/res/mipmap/ic_launcher.xml", '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#ffffff" android:pathData="M0,0h24v24h-24z" /></vector>\n');
  for (const name of ["ChillyChatIncomingCallDeadline.kt", "ChillyChatCallNotifications.kt", "ChillyChatCallNotificationActionReceiver.kt", "ChillyChatNativeCallActionStore.kt"]) {
    write(`src/main/java/com/chillywood/mobile/${name}`, nativeFiles[name]);
  }
  for (const name of ["ChillyChatIncomingCallDeadlineTest.kt", "ChillyChatIncomingCallNotificationTest.kt"]) {
    write(`src/test/java/com/chillywood/mobile/${name}`, fs.readFileSync(path.join(root, "tools/android-native-call-harness", name)));
  }
  console.log("Compiling generated Android notification/receiver/deadline source and running focused Robolectric/JUnit regressions.");
  process.stdout.write(run("bash", [path.join(output, "gradlew"), "testDebugUnitTest", "--no-daemon", "--console=plain"], { cwd: output, timeout: 20 * 60_000 }));
  for (const name of ["ChillyChatIncomingCallDeadlineTest", "ChillyChatIncomingCallNotificationTest"]) {
    const report = fs.readFileSync(path.join(output, `build/test-results/testDebugUnitTest/TEST-com.chillywood.mobile.${name}.xml`), "utf8");
    assert.match(report, /failures="0"/u);
    assert.match(report, /errors="0"/u);
    assert.match(report, /skipped="0"/u);
  }
  console.log("Generated Android notification compile and lifecycle integration tests passed. No APK, installation, or physical qualification was performed.");
};
try {
  if (android) {
    runAndroid();
  } else {
  const generated = path.join(output, "ChillyChatIncomingCallDeadline.kt");
  fs.writeFileSync(generated, nativeFiles["ChillyChatIncomingCallDeadline.kt"]);
  const jar = path.join(output, "deadline-tests.jar");
  const args = ["-no-stdlib", "-no-reflect", "-classpath", testClasspath, "-d", jar, generated,
    path.join(root, "tools/android-native-call-harness/ChillyChatIncomingCallDeadlineTest.kt")];
  if (compileClasspath) {
    run("java", ["-cp", compileClasspath, "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", ...args]);
  } else {
    run(process.env.KOTLINC ?? "kotlinc", args);
  }
  const result = run("java", ["-cp", [jar, testClasspath].join(path.delimiter), "org.junit.runner.JUnitCore",
    "com.chillywood.mobile.ChillyChatIncomingCallDeadlineTest"]);
  assert.match(result, /OK \(6 tests\)/u);
  process.stdout.write(result);
  console.log("Generated Android deadline: Kotlin/JVM passed; Android notification integration and installed binary proof are separate.");
  }
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
