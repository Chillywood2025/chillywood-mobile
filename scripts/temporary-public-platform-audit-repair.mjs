#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const platformPath = "app/channel/[userId].tsx";
const routeGuardPath = "scripts/guard-route-contracts.mjs";

let platform = readFileSync(platformPath, "utf8");

const replaceExact = (from, to, label) => {
  if (!platform.includes(from)) {
    throw new Error(`Missing expected public Platform source for ${label}`);
  }
  platform = platform.replaceAll(from, to);
};

replaceExact(
  '"Channel Subscription checkout is not available right now."',
  '"Platform Subscription checkout is not available right now."',
  "subscription checkout fallback terminology",
);
replaceExact(
  'title: "Channel Subscription",',
  'title: "Platform Subscription",',
  "sandbox subscription card terminology",
);
replaceExact(
  'const unavailableCopy = "Channel Subscription is not available for this creator Platform in sandbox right now. Premium, VIP, paid videos, Watch-Party Seat Passes, and paid events stay separate.";',
  'const unavailableCopy = "Platform Subscription is not available for this creator Platform in sandbox right now. Premium, VIP, paid videos, Watch-Party Seat Passes, and paid events stay separate.";',
  "subscription unavailable terminology",
);
replaceExact(
  '<AppSection title="Channel Subscription" statusLabel={offer ? "Manage" : "Not set"} statusTone={offer ? "success" : "muted"}>',
  '<AppSection title="Platform Subscription" statusLabel={offer ? "Manage" : "Not set"} statusTone={offer ? "success" : "muted"}>',
  "owner subscription heading terminology",
);
replaceExact(
  'title="Channel Subscription"\n        statusLabel={subscribed ? "Subscribed" : unavailable ? "Unavailable" : "Sandbox"}',
  'title="Platform Subscription"\n        statusLabel={subscribed ? "Subscribed" : unavailable ? "Unavailable" : "Sandbox"}',
  "viewer subscription heading terminology",
);
replaceExact(
  'accessibilityLabel="Sandbox Test Subscribe to Creator Channel"',
  'accessibilityLabel="Sandbox Test Subscribe to Creator Platform"',
  "subscription accessibility terminology",
);

const oldEventCard = `  const renderEventCard = (event: CreatorEventSummary) => (\n    <View key={event.id} style={styles.programmingCard}>\n      <Text style={styles.cardKicker}>{formatEventStatus(event)}</Text>\n      <Text style={styles.cardTitle} numberOfLines={2}>{event.eventTitle}</Text>\n      <Text style={styles.cardBody}>{formatEventDate(event.startsAt)}</Text>\n      {event.reminder.canSetReminder ? (\n        <Text style={styles.metaText}>Reminder ready</Text>\n      ) : null}\n    </View>\n  );`;
const newEventCard = `  const renderEventCard = (event: CreatorEventSummary) => (\n    <TouchableOpacity\n      key={event.id}\n      style={styles.programmingCard}\n      activeOpacity={0.86}\n      onPress={() => router.push(\`/event/\${event.id}\` as Parameters<typeof router.push>[0])}\n      testID={event.isLiveNow ? "platform-live-event-open-button" : "platform-upcoming-event-open-button"}\n      accessibilityRole="button"\n      accessibilityLabel={\`Open \${event.eventTitle}\`}\n    >\n      <Text style={styles.cardKicker}>{formatEventStatus(event)}</Text>\n      <Text style={styles.cardTitle} numberOfLines={2}>{event.eventTitle}</Text>\n      <Text style={styles.cardBody}>{formatEventDate(event.startsAt)}</Text>\n      {event.reminder.canSetReminder ? (\n        <Text style={styles.metaText}>Reminder ready</Text>\n      ) : null}\n      <Text style={styles.metaText}>{event.isLiveNow ? "Open live event" : "View event details"}</Text>\n    </TouchableOpacity>\n  );`;
if (!platform.includes(oldEventCard)) {
  throw new Error("Missing expected public Platform event card source");
}
platform = platform.replace(oldEventCard, newEventCard);

writeFileSync(platformPath, platform);

let guard = readFileSync(routeGuardPath, "utf8");
const guardAnchor = 'assertIncludes(publicPlatform, "Support this Platform", "Public Platform viewer support surface");';
const guardInsert = `${guardAnchor}\nassertIncludes(publicPlatform, 'router.push(\\\`/event/\\\${event.id}\\\` as Parameters<typeof router.push>[0])', "Public Platform event card navigation");\nassertIncludes(publicPlatform, 'testID={event.isLiveNow ? "platform-live-event-open-button" : "platform-upcoming-event-open-button"}', "Public Platform event navigation selectors");\nassertNotIncludes(publicPlatform, 'title="Channel Subscription"', "Public Platform user-facing subscription terminology");\nassertNotIncludes(publicPlatform, '"Channel Subscription checkout is not available right now."', "Public Platform subscription fallback terminology");\nassertNotIncludes(publicPlatform, 'accessibilityLabel="Sandbox Test Subscribe to Creator Channel"', "Public Platform accessibility terminology");`;
if (!guard.includes(guardAnchor)) {
  throw new Error("Missing route guard public Platform anchor");
}
guard = guard.replace(guardAnchor, guardInsert);
writeFileSync(routeGuardPath, guard);

console.log("Public Platform audit repairs applied.");
