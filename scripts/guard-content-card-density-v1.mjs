import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const card = read("components/creator-media/creator-video-card.tsx");
const socialCard = read("components/ProfileSocialFeedCard.tsx");
const studio = read("app/channel-settings.tsx");
const home = read("app/(tabs)/index.tsx");
const explore = read("app/(tabs)/explore.tsx");
const platform = read("app/channel/[userId].tsx");
const profile = read("app/profile/[userId].tsx");
const library = read("app/(tabs)/my-list.tsx");

const requireAll = (source, needles, label) => {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      throw new Error(`${label}: missing ${JSON.stringify(needle)}`);
    }
  }
};

requireAll(card, [
  'type CreatorVideoCardVariant = "compact" | "detail";',
  'variant = "compact"',
  'compactPreview: {',
  'aspectRatio: 9 / 16',
  'creator-video-card-overflow-button',
], "shared creator content card");

requireAll(socialCard, [
  'import { CreatorVideoCard } from "./creator-media/creator-video-card";',
  'compactMediaTile: {\n    width: 150',
  'compactDiscoveryTile: {\n    width: 150,\n    aspectRatio: 9 / 16',
], "Profile social media cards");

requireAll(studio, [
  'title: "Recent Uploads"',
  'title: "Featured"',
  'title: "Published"',
  'title: "Drafts"',
  'title: "Paid Videos"',
  'key: "circle"',
  'title: "Needs Attention"',
  'content-shelf-events',
  'contentShelfCard: {',
], "Platform Studio Content shelves");

requireAll(home, [
  'followingVideoCardWrap: {\n    width: 150',
  'feedActivityCard: {\n    width: 150',
  'feedActivityThumb: {\n    width: "100%",\n    aspectRatio: 9 / 16',
  'feedEventCard: {\n    width: 150,\n    aspectRatio: 9 / 16',
], "Home content density");

requireAll(explore, [
  'import { CreatorVideoCard } from "../../components/creator-media/creator-video-card";',
  'creatorVideoTile: {\n    width: 150',
  'discoveryCard: {\n    width: 150,\n    aspectRatio: 9 / 16',
  'discoveryOverlayCopy',
], "Explore content density");

requireAll(platform, [
  'import { CreatorVideoCard } from "../../components/creator-media/creator-video-card";',
  'platformContentTile: {\n    width: 150',
  '<AppSection title="Featured"',
  'contentContainerStyle={styles.shelfRow}',
], "public Platform content density");

requireAll(profile, [
  'contentContainerStyle={styles.creatorVideoGrid}',
  'profileCreatorVideoTile: {\n    width: 150',
  '<CreatorVideoCard',
], "Profile creator content density");

requireAll(library, [
  'titleCard: {\n    width: 132',
  'posterWrap: {\n    width: "100%",\n    height: 150',
  'platformCard: {\n    width: 150',
], "Saved Library compact rows");

for (const forbidden of [
  'followingVideoCardWrap: {\n    width: 284',
  'feedActivityCard: {\n    width: 282',
  'feedEventCard: {\n    width: 282',
]) {
  if (home.includes(forbidden)) {
    throw new Error(`Home content density: legacy oversized card remains ${JSON.stringify(forbidden)}`);
  }
}

console.log("Content card density guard passed.");
