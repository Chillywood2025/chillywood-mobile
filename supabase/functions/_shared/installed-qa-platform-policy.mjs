const SUPPORTED_PLATFORMS = new Set(["shared", "ios", "android", "web"]);

export const normalizeInstalledQaPlatform = (platform, source) => {
  const normalizedPlatform = String(platform ?? "").trim().toLowerCase();
  if (SUPPORTED_PLATFORMS.has(normalizedPlatform)) return normalizedPlatform;

  const normalizedSource = String(source ?? "").trim().toLowerCase();
  if (normalizedSource === "firebase_test_lab_uploaded_artifact") return "android";

  return "unknown";
};

