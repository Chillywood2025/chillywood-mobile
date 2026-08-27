#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const appPath = "app/channel-settings.tsx";
const guardPath = "scripts/guard-platform-brand-studio-policy.mjs";

let app = readFileSync(appPath, "utf8");
let guard = readFileSync(guardPath, "utf8");

const replaceExact = (source, from, to, label) => {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(from, to);
};

app = replaceExact(
  app,
`            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.channelAvatarImage} />
            ) : (`,
`            {platformBranding?.avatar?.signedUrl ? (
              <Image source={{ uri: platformBranding.avatar.signedUrl }} style={styles.channelAvatarImage} />
            ) : (`,
  "Brand Studio identity must preview the Platform avatar, not Profile photo",
);

app = replaceExact(
  app,
`          <View style={styles.brandStudioActions}>
            {renderPreviewChannelAction()}
          </View>`,
`          <View style={styles.brandStudioActions}>
            {renderPreviewChannelAction()}
            <TouchableOpacity
              style={styles.studioActionButton}
              activeOpacity={0.86}
              onPress={openDraftBrandPreview}
              testID="brand-preview-draft-platform-button"
              accessibilityLabel="Preview Brand Draft"
            >
              <Text style={styles.studioActionButtonText}>Preview Brand Draft</Text>
              <Text style={styles.studioActionButtonCopy}>Owner-only saved draft view</Text>
            </TouchableOpacity>
          </View>`,
  "Brand Studio must expose both public and draft previews in the Brand tab",
);

app = replaceExact(
  app,
`                  <TouchableOpacity
                    style={styles.eventSecondaryButton}
                    activeOpacity={0.88}
                    testID="brand-hero-reel-disabled-button"
                    accessibilityLabel="Hero Reel status"
                    onPress={() => {
                      showStudioUnavailable(
                        "Hero Reel status",
                        "Hero Video needs reviewed video processing before public autoplay can launch. Use Hero Image or choose a public upload as Spotlight content for now.",
                      );
                    }}
                  >
                    <Text style={styles.eventSecondaryButtonText}>Hero Reel status</Text>
                  </TouchableOpacity>`,
`                  <Text style={styles.permissionCopy}>
                    Hero Reel not available yet. Use Hero Image or a public Spotlight upload for now.
                  </Text>`,
  "Brand Studio must not present Hero Reel as a tappable dead-end control",
);

app = replaceExact(
  app,
`                {renderStudioActionRow({
                  title: "Watermark",
                  body: "Video watermark rendering opens this status path. Save a Brand Mark draft without changing Player behavior.",
                  value: platformBranding?.watermark ? formatPlatformBrandAssetStatus(platformBranding.watermark) : "Status path",
                  tone: "muted",
                  onPress: () => {
                    showStudioUnavailable(
                      "Watermark status",
                      "Brand Mark upload can be staged later, but public video watermark rendering is not active in Player.",
                    );
                  },
                })}`,
`                <Text style={styles.permissionCopy}>
                  Watermark not available yet. Public video watermark rendering is not active.
                </Text>`,
  "Brand Studio must not present Watermark as a tappable dead-end control",
);

app = replaceExact(
  app,
`              <View style={styles.homeSnapshotCard}>
                <Text style={styles.homeSnapshotLabel}>Status</Text>
                <Text style={styles.homeSnapshotBody}>
                  {platformBranding?.assets?.some((asset) => asset.scanStatus === "pending_scan" || asset.scanStatus === "scanning")
                    ? "Media is getting ready."
                    : platformBranding?.assets?.some((asset) => asset.scanStatus === "malware_detected" || asset.scanStatus === "scan_failed" || asset.scanStatus === "quarantined")
                      ? "One media item needs changes."
                      : "Ready."}
                </Text>
              </View>
              <View style={styles.homeSnapshotCard}>
                <Text style={styles.homeSnapshotLabel}>Publish</Text>
                <Text style={styles.homeSnapshotBody}>{brandReadyToPublishCount ? `${brandReadyToPublishCount} asset${brandReadyToPublishCount === 1 ? "" : "s"} ready.` : brandPublished ? "No draft asset waiting." : "Use Publish Changes when ready."}</Text>
              </View>`,
`              <View style={styles.homeSnapshotCard}>
                <Text style={styles.homeSnapshotLabel}>Next step</Text>
                <Text style={styles.homeSnapshotBody}>
                  {brandBlockedCount
                    ? "One or more media items cannot be published yet."
                    : brandCheckingCount
                      ? "Media is still getting ready."
                      : brandReadyToPublishCount
                        ? `${brandReadyToPublishCount} asset${brandReadyToPublishCount === 1 ? "" : "s"} ready to publish.`
                        : brandPublished
                          ? "Public Platform is current."
                          : "Save a draft or publish when ready."}
                </Text>
              </View>`,
  "Brand Studio publishing status must avoid redundant Status and Publish cards",
);

const guardAnchor = `assertIncludes(channelSettings, \`Preview Brand Draft\`, "owner-only Brand Studio draft preview action");`;
const guardAddition = `${guardAnchor}\nassertIncludes(channelSettings, \`source={{ uri: platformBranding.avatar.signedUrl }}\`, "Brand Studio identity uses Platform avatar preview");\nassertIncludes(channelSettings, \`Owner-only saved draft view\`, "Brand Studio tab exposes owner draft preview directly");\nassertNotIncludes(channelSettings, \`brand-hero-reel-disabled-button\`, "Brand Studio must not expose dead Hero Reel status button");\nassertNotIncludes(channelSettings, \`title: "Watermark"\`, "Brand Studio must not expose dead Watermark status row");\nassertIncludes(channelSettings, \`<Text style={styles.homeSnapshotLabel}>Next step</Text>\`, "Brand Studio publishing status has one canonical next-step summary");`;
guard = replaceExact(
  guard,
  guardAnchor,
  guardAddition,
  "Brand Studio guard regression anchor",
);

writeFileSync(appPath, app);
writeFileSync(guardPath, guard);
console.log("Brand Studio UI closure transformation applied.");
