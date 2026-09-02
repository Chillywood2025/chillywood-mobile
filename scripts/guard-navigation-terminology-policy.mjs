#!/usr/bin/env node

import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { readFileSync } from "node:fs";
import path from "node:path";

const traverse = traverseModule.default ?? traverseModule;

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Navigation terminology policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const parseSource = (source) => parse(source, {
  sourceType: "unambiguous",
  plugins: ["typescript", "jsx", "decorators-legacy", "classProperties", "classPrivateProperties", "classPrivateMethods", "importAttributes"],
});

const evaluateStringPath = (nodePath) => {
  const evaluated = nodePath?.evaluate?.();
  return evaluated?.confident && typeof evaluated.value === "string" ? evaluated.value : null;
};

const staleChannelPattern = /\bchannels?\b/iu;

const getPropertyKey = (propertyPath) => {
  const keyPath = propertyPath.get("key");
  return !propertyPath.node.computed && keyPath.isIdentifier()
    ? keyPath.node.name
    : evaluateStringPath(keyPath);
};

const resolveContainerProperty = (containerPath, propertyKey, visitedBindings) => {
  const resolvedContainer = resolveConstantPath(containerPath, visitedBindings);
  if (resolvedContainer.isObjectExpression()) {
    let resolvedProperty = null;
    for (const propertyPath of resolvedContainer.get("properties")) {
      if (propertyPath.isObjectProperty() && getPropertyKey(propertyPath) === propertyKey) {
        resolvedProperty = resolveConstantPath(propertyPath.get("value"), visitedBindings);
      } else if (propertyPath.isSpreadElement()) {
        resolvedProperty = resolveContainerProperty(propertyPath.get("argument"), propertyKey, visitedBindings)
          ?? resolvedProperty;
      }
    }
    if (resolvedProperty) return resolvedProperty;
  }
  if (resolvedContainer.isArrayExpression() && /^\d+$/u.test(String(propertyKey))) {
    const elementPath = resolvedContainer.get("elements")[Number(propertyKey)];
    if (elementPath?.node) return resolveConstantPath(elementPath, visitedBindings);
  }
  return null;
};

function resolveConstantPath(nodePath, visitedBindings = new Set()) {
  if (!nodePath?.node) return nodePath;
  if (
    nodePath.isParenthesizedExpression?.()
    || nodePath.isTSAsExpression?.()
    || nodePath.isTSTypeAssertion?.()
    || nodePath.isTSSatisfiesExpression?.()
    || nodePath.isTSNonNullExpression?.()
  ) {
    return resolveConstantPath(nodePath.get("expression"), visitedBindings);
  }
  if (nodePath.isMemberExpression() || nodePath.isOptionalMemberExpression?.()) {
    const propertyPath = nodePath.get("property");
    const propertyKey = !nodePath.node.computed && propertyPath.isIdentifier()
      ? propertyPath.node.name
      : evaluateStringPath(propertyPath);
    if (propertyKey !== null) {
      return resolveContainerProperty(nodePath.get("object"), propertyKey, visitedBindings) ?? nodePath;
    }
  }
  if (!nodePath.isIdentifier() || !nodePath.isReferencedIdentifier()) return nodePath;
  const binding = nodePath.scope.getBinding(nodePath.node.name);
  if (!binding?.constant || !binding.path.isVariableDeclarator() || visitedBindings.has(binding)) return nodePath;
  const initPath = binding.path.get("init");
  if (!initPath?.node) return nodePath;
  const nextVisited = new Set(visitedBindings);
  nextVisited.add(binding);
  const idPath = binding.path.get("id");
  if (idPath.isIdentifier()) return resolveConstantPath(initPath, nextVisited);
  if (idPath.isObjectPattern()) {
    for (const propertyPath of idPath.get("properties")) {
      if (!propertyPath.isObjectProperty()) continue;
      const valuePath = propertyPath.get("value");
      const boundIdentifierPath = valuePath.isAssignmentPattern() ? valuePath.get("left") : valuePath;
      if (!boundIdentifierPath.isIdentifier({ name: nodePath.node.name })) continue;
      const sourceKey = getPropertyKey(propertyPath);
      if (sourceKey !== null) {
        return resolveContainerProperty(initPath, sourceKey, nextVisited)
          ?? (valuePath.isAssignmentPattern() ? resolveConstantPath(valuePath.get("right"), nextVisited) : nodePath);
      }
    }
  }
  if (idPath.isArrayPattern()) {
    const elementPaths = idPath.get("elements");
    for (let index = 0; index < elementPaths.length; index += 1) {
      const elementPath = elementPaths[index];
      if (!elementPath?.node) continue;
      const boundIdentifierPath = elementPath.isAssignmentPattern() ? elementPath.get("left") : elementPath;
      if (!boundIdentifierPath.isIdentifier({ name: nodePath.node.name })) continue;
      return resolveContainerProperty(initPath, String(index), nextVisited)
        ?? (elementPath.isAssignmentPattern() ? resolveConstantPath(elementPath.get("right"), nextVisited) : nodePath);
    }
  }
  return nodePath;
}

const collectStringFragments = (nodePath, visitedBindings = new Set()) => {
  const resolvedPath = resolveConstantPath(nodePath, visitedBindings);
  if (resolvedPath !== nodePath) return collectStringFragments(resolvedPath, visitedBindings);
  const evaluated = evaluateStringPath(nodePath);
  if (evaluated !== null) return [evaluated];
  const fragments = [];
  const collectReferencedBinding = (identifierPath) => {
    if (!identifierPath.isReferencedIdentifier()) return;
    if (identifierPath.parentPath?.isMemberExpression() && identifierPath.key === "object") return;
    const resolvedBindingPath = resolveConstantPath(identifierPath, visitedBindings);
    if (resolvedBindingPath !== identifierPath) {
      fragments.push(...collectStringFragments(resolvedBindingPath, visitedBindings));
    }
  };
  if (nodePath.isStringLiteral()) fragments.push(nodePath.node.value);
  if (nodePath.isTemplateLiteral()) {
    nodePath.get("quasis").forEach((templatePath) => {
      fragments.push(templatePath.node.value.cooked ?? templatePath.node.value.raw ?? "");
    });
  }
  if (nodePath.isIdentifier()) collectReferencedBinding(nodePath);
  nodePath.traverse({
    MemberExpression(memberPath) {
      const resolvedMemberPath = resolveConstantPath(memberPath, visitedBindings);
      if (resolvedMemberPath !== memberPath) {
        fragments.push(...collectStringFragments(resolvedMemberPath, visitedBindings));
        memberPath.skip();
      }
    },
    OptionalMemberExpression(memberPath) {
      const resolvedMemberPath = resolveConstantPath(memberPath, visitedBindings);
      if (resolvedMemberPath !== memberPath) {
        fragments.push(...collectStringFragments(resolvedMemberPath, visitedBindings));
        memberPath.skip();
      }
    },
    StringLiteral(stringPath) {
      fragments.push(stringPath.node.value);
    },
    TemplateElement(templatePath) {
      fragments.push(templatePath.node.value.cooked ?? templatePath.node.value.raw ?? "");
    },
    ReferencedIdentifier: collectReferencedBinding,
  });
  return fragments;
};

const pathContainsChannelText = (nodePath) => {
  const fragments = collectStringFragments(nodePath);
  return fragments.some((fragment) => staleChannelPattern.test(fragment))
    || staleChannelPattern.test(fragments.join(""));
};

const hasStaleStaticChannelMessage = (source) => {
  const ast = parseSource(source);
  let stale = false;
  traverse(ast, {
    StringLiteral(stringPath) {
      if (staleChannelPattern.test(stringPath.node.value)) stale = true;
    },
    TemplateElement(templatePath) {
      const value = templatePath.node.value.cooked ?? templatePath.node.value.raw ?? "";
      if (staleChannelPattern.test(value)) stale = true;
    },
    "BinaryExpression|TemplateLiteral"(expressionPath) {
      const value = evaluateStringPath(expressionPath);
      if (value !== null && staleChannelPattern.test(value)) stale = true;
    },
    ObjectProperty(propertyPath) {
      if (stale) return;
      const key = getPropertyKey(propertyPath);
      if (key === "message" && pathContainsChannelText(propertyPath.get("value"))) stale = true;
    },
    AssignmentExpression(assignmentPath) {
      if (stale || assignmentPath.node.operator !== "=") return;
      const leftPath = assignmentPath.get("left");
      if (!leftPath.isMemberExpression()) return;
      const propertyPath = leftPath.get("property");
      const key = !leftPath.node.computed && propertyPath.isIdentifier()
        ? propertyPath.node.name
        : evaluateStringPath(propertyPath);
      if (key === "message" && pathContainsChannelText(assignmentPath.get("right"))) stale = true;
    },
    ObjectMethod(methodPath) {
      if (stale || getPropertyKey(methodPath) !== "message") return;
      methodPath.traverse({
        ReturnStatement(returnPath) {
          const argumentPath = returnPath.get("argument");
          if (argumentPath?.node && pathContainsChannelText(argumentPath)) stale = true;
        },
      });
    },
  });
  return stale;
};

const approvedCircleErrors = new Set([
  "Chi'lly Circle status is unavailable right now.",
  "Choose a person to update Chi'lly Circle.",
  "Official accounts appear as pinned Chi'lly Circle connections and are not managed as normal requests.",
  "Chi'lly Circle requires a signed-in user.",
  "You cannot update Chi'lly Circle with yourself.",
  "Chi'lly Circle is unavailable while a Platform audience block exists between these accounts.",
  "Unable to update Chi'lly Circle right now.",
  "Chi'lly Circle could not load right now.",
  "You cannot request yourself.",
]);

const findUnsafeThrownErrors = (source) => {
  const ast = parseSource(source);
  const unsafe = [];
  traverse(ast, {
    ThrowStatement(throwPath) {
      const argumentPath = throwPath.get("argument");
      const calleePath = argumentPath.isNewExpression() ? argumentPath.get("callee") : null;
      const argumentPaths = argumentPath.isNewExpression() ? argumentPath.get("arguments") : [];
      const message = calleePath?.isIdentifier({ name: "Error" })
        ? evaluateStringPath(argumentPaths[0])
        : null;
      if (message === null || !approvedCircleErrors.has(message)) unsafe.push(throwPath.node.type);
    },
  });
  return unsafe;
};

const assertStaticMessagesUsePlatformTerminology = (source, label) => {
  if (hasStaleStaticChannelMessage(source)) {
    fail(`${label} exposes stale Channel terminology in a customer-facing message`);
  }
};

const tabs = read("app/(tabs)/_layout.tsx");
const liveTab = read("app/(tabs)/live.tsx");
const profileTab = read("app/(tabs)/profile.tsx");
const libraryTab = read("app/(tabs)/my-list.tsx");
const explore = read("app/(tabs)/explore.tsx");
const home = read("app/(tabs)/index.tsx");
const homeRoute = read("app/home.tsx");
const libraryRoute = read("app/library.tsx");
const player = read("app/player/[id].tsx");
const watchPartyIndex = read("app/watch-party/index.tsx");
const channelAudience = read("_lib/channelAudience.ts");
const channelSubscriptions = read("_lib/channelSubscriptions.ts");
const creatorVipPasses = read("_lib/creatorVipPasses.ts");
const profilePrivacy = read("_lib/profilePrivacy.ts");
const friendGraph = read("_lib/friendGraph.ts");
const channelReadModels = read("_lib/channelReadModels.ts");
const accessEntitlements = read("_lib/accessEntitlements.ts");
const dmca = read("_lib/dmca.ts");
const channelSubscriptionRoute = read("app/channel-subscription/[creatorId].tsx");
const vipPassRoute = read("app/vip-pass/[creatorId].tsx");
const mainTabTopBar = read("components/navigation/main-tab-top-bar.tsx");
const iconSymbol = read("components/ui/icon-symbol.tsx");
const masterVision = read("MASTER_VISION.md");
const architectureRules = read("ARCHITECTURE_RULES.md");
const roomBlueprint = read("ROOM_BLUEPRINT.md");
const navDoc = read("docs/NAVIGATION_TERMINOLOGY_MAP.md");

[
  "title: 'Home'",
  "title: 'Explore'",
  "title: 'Live'",
  "title: 'Saved'",
].forEach((label) => assertIncludes(tabs, label, "bottom navigation"));

assertIncludes(tabs, 'name="profile"', "hidden Profile tab route registration");
assertIncludes(tabs, "href: null", "Profile hidden from bottom navigation");
assertNotIncludes(tabs, "Admin", "normal bottom navigation");
assertNotIncludes(tabs, "My List", "bottom navigation label");
assertNotIncludes(tabs, "title: 'Library'", "bottom navigation label");
assertNotIncludes(tabs, "title: 'Profile'", "normal bottom navigation label");
assertIncludes(iconSymbol, "'play.circle.fill': 'live-tv'", "Live bottom-nav icon");

assertIncludes(liveTab, "heroHeader", "Live screen Hero header pattern");
assertIncludes(liveTab, "quickActions", "Live screen quick actions pattern");
assertIncludes(liveTab, "primaryButton", "Live screen primary action pattern");
assertIncludes(liveTab, "secondaryButton", "Live screen secondary actions pattern");
assertIncludes(liveTab, "statusPill", "Live screen Status pills pattern");
assertIncludes(liveTab, "disclosureCard", "Live screen Progressive disclosure pattern");
assertIncludes(liveTab, "emptyState", "Live screen Empty state pattern");
assertIncludes(liveTab, "Watch what is live now, see upcoming events, start a people-first room, or enter a Watch-Party code.", "Live hub user copy");
assertIncludes(liveTab, "Start Live opens the people-first Live Watch-Party path.", "Live Watch-Party user copy");
assertIncludes(liveTab, "Enter Code joins an existing Watch-Party Live room.", "Watch-Party Live user copy");
assertIncludes(liveTab, "Upcoming Events opens the exact Event so viewers can see its access and schedule.", "exact Event user copy");
assertIncludes(liveTab, "requireLiveFirstPremium", "Live tab Premium/runtime preflight");
assertIncludes(liveTab, 'params: { mode: "live", source: "bottom-live-tab" }', "Live tab route mapping");
assertIncludes(liveTab, "CHILLYWOOD_BACKGROUND_SOURCE", "Live tab Chi'llywood background");
[
  "This opens the existing Live Waiting Room",
  "keeps Live Stage ownership unchanged",
  "New Watch-Party Live rooms still start from a title",
  "Browse titles first, then start Watch-Party Live from the title or Player when access is allowed",
].forEach((needle) => assertNotIncludes(liveTab, needle, "Live screen user copy"));

assertIncludes(profileTab, "Profile is your social identity", "Profile/Platform separation");
assertIncludes(profileTab, "Platform and Platform Studio stay separate", "Profile tab creator surface separation");
assertIncludes(libraryTab, "My Library", "Library screen header");
assertIncludes(libraryTab, "Saved titles, watch progress, followed Platforms, and saved replays live here.", "Library saved scope copy");
assertNotIncludes(libraryTab, "creator-owned draft", "viewer Library must not become creator Content Library");
assertIncludes(libraryTab, "readMergedWatchProgress", "Library backed continue watching");
assertIncludes(libraryTab, "readFollowedChannelUserIds", "Library backed followed Platforms");
assertIncludes(libraryTab, "CHILLYWOOD_BACKGROUND_SOURCE", "Library Chi'llywood background");
assertIncludes(explore, "Search titles, public people, Platforms, creator videos, Originals, events, and replays.", "Explore backed scope copy");
assertIncludes(explore, "EXPLORE_SEARCH_SCOPES", "Explore search scope list");
assertIncludes(explore, 'label: "People"', "Explore People search scope");
assertIncludes(explore, 'label: "Originals"', "Explore Originals search scope");
assertIncludes(explore, 'testID="explore-typeahead-results"', "Explore typeahead results");
assertIncludes(explore, "EXPLORE_SEARCH_DEBOUNCE_MS", "Explore debounced search");
assertIncludes(explore, "searchPublicPeople", "Explore public people search source");
assertIncludes(explore, 'testID="explore-people-search-section"', "Explore People results section");
assertIncludes(explore, "readRankedPublicDiscoveryFeedItems({ surface: \"home\"", "Explore ranked public discovery feed source");
assertIncludes(explore, "readLatestPublicCreatorVideos", "Explore public creator video source");
assertIncludes(explore, "readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId", "Explore Rachi Originals source");
assertIncludes(explore, "No public replays yet", "Explore honest replay empty state");
assertIncludes(explore, "Search Chi'llywood", "Explore unified search copy");
assertIncludes(explore, "CHILLYWOOD_BACKGROUND_SOURCE", "Explore Chi'llywood fallback background");
["fake", "mock row", "sample row", "dummy row"].forEach((needle) => {
  assertNotIncludes(explore, needle, "Explore backed data surface");
  assertNotIncludes(libraryTab, needle, "Library backed data surface");
});
assertIncludes(home, 'accessibilityLabel="Open your Profile"', "Home Profile affordance");
assertIncludes(homeRoute, '<Redirect href="/(tabs)" />', "Home user-facing route alias");
assertIncludes(libraryRoute, '<Redirect href="/(tabs)/my-list" />', "Library user-facing route alias");
assertIncludes(home, 'testID="main-tab-home-profile-entry"', "Home top Profile entry test id");
assertIncludes(home, 'testID="main-tab-home-settings-action"', "Home top Settings test id");
assertIncludes(home, 'accessibilityLabel="Settings"', "Home icon-only Settings accessibility label");
assertNotIncludes(home, 'accessibilityLabel="Open settings"', "Home Settings outdated accessibility label");
assertNotIncludes(home, "utilitySettingsText", "Home Settings visible text style");
assertIncludes(home, 'pathname: "/profile/[userId]"', "Home top Profile route");
assertIncludes(home, "CHILLYWOOD_BACKGROUND_SOURCE", "Home branded background");
assertIncludes(home, "homeHeroWrap", "Home cinematic hero wrapper");
assertIncludes(home, 'testID="home-branded-hero"', "Home branded hero fallback");
assertIncludes(home, 'testID="home-continue-watching-hero"', "Home Continue Watching hero");
assertIncludes(home, 'testID="home-continue-watching-hero-action"', "Home Continue Watching hero action");
assertIncludes(home, "const continueWatchingHeroItem = canShowContinueWatching ? continueCandidates[0] ?? null : null", "Home hero reads only eligible Continue Watching candidates");
assertIncludes(home, "HOME_CONTINUE_MIN_POSITION_MILLIS = 10_000", "Home Continue Watching minimum watch threshold");
assertIncludes(home, "HOME_CONTINUE_COMPLETION_THRESHOLD = 0.94", "Home Continue Watching completion threshold");
assertIncludes(home, "isEligibleContinueWatchingProgress", "Home Continue Watching eligibility helper");
assertIncludes(home, "position < HOME_CONTINUE_MIN_POSITION_MILLIS", "Home tiny progress excluded");
assertIncludes(home, "position / duration < HOME_CONTINUE_COMPLETION_THRESHOLD", "Home completed titles excluded");
assertIncludes(home, "isAvailableContinueWatchingTitle", "Home Continue Watching title availability helper");
assertIncludes(home, "HOME_CONTINUE_BLOCKED_TITLE_STATUSES", "Home blocked title status set");
assertIncludes(home, "HOME_CONTINUE_BLOCKED_ACCESS_RULES", "Home blocked access rule set");
assertIncludes(home, "getContinueLastWatchedAt", "Home last watched sort helper");
assertIncludes(home, "return bLastWatchedAt - aLastWatchedAt", "Home Continue Watching most recent sort");
assertIncludes(home, "getContinueWatchingProgressPercent", "Home Continue Watching progress bar helper");
assertIncludes(explore, 'surface="explore"', "Explore top Profile/Settings entry");
assertIncludes(liveTab, 'surface="live"', "Live top Profile/Settings entry");
assertIncludes(libraryTab, 'surface="library"', "Library top Profile/Settings entry");
assertIncludes(mainTabTopBar, 'testID={`main-tab-${surface}-profile-entry`}', "shared top Profile entry");
assertIncludes(mainTabTopBar, 'testID={`main-tab-${surface}-settings-action`}', "shared top Settings entry");
assertIncludes(mainTabTopBar, "style={styles.labelGroup}", "shared top Settings aligns with tab label like Home");
assertIncludes(mainTabTopBar, "<Text style={styles.kicker}>{label}</Text>", "shared top tab label stays with Settings icon");
assertIncludes(mainTabTopBar, "flexShrink: 1", "shared top label group avoids header overlap");
["Top Picks", "Favorites", "Latest Public Uploads", "Platforms You Follow"].forEach((needle) => {
  assertNotIncludes(home, needle, "Home redundant bottom-tab section cleanup");
});
assertNotIncludes(home, '|| "Browse"', "Home Browse rail fallback");
assertNotIncludes(home, 'railKey === "browse"', "Home Browse rail");
assertNotIncludes(home, 'railKey === "top_picks"', "Home Top Picks rail");
assertNotIncludes(home, 'railKey === "favorites"', "Home Favorites rail");
assertNotIncludes(home, "spotlightItem", "Home random title spotlight");
assertNotIncludes(home, "programmedHeroItem", "Home latest/programmed title hero fallback");
assertNotIncludes(home, "latestTitles[0] ?? null", "Home latest title hero fallback");
assertNotIncludes(home, 'testID="home-discovery-pulse"', "Home dashboard first card");
assertNotIncludes(home, "discoveryPulse", "Home dashboard first-card styles");
assertNotIncludes(home, ["Your night", " at a glance"].join(""), "Home old dashboard first-card copy");
assertNotIncludes(home, 'testID="home-continue-watching-section"', "Home compact Continue Watching rail");
assertNotIncludes(home, 'testID="home-continue-watching-card"', "Home compact Continue Watching rail card");
assertNotIncludes(home, "Loading tonight's picks", "Home title-picks loading copy");
assertNotIncludes(home, "readMyListIds", "Home saved/favorites data source");
assertIncludes(player, "type PlayerSurfaceMode", "Player surface mode type");
assertIncludes(player, "resolvePlayerSurfaceMode", "Player surface mode resolver");
assertIncludes(player, '"watch-party-live-shared"', "Player Watch-Party Live shared mode");
assertIncludes(player, '"standalone-creator-video"', "Player creator video mode");
assertIncludes(player, 'surfaceLabel="Watch-Party Live"', "Player Watch-Party Live surface label");
assertIncludes(player, "Audio Mix", "Player Watch-Party Live audio mix label");
assertIncludes(player, "This room belongs to Live Watch-Party, not Watch-Party Live.", "Player live naming split");
assertIncludes(player, "Open Party Room", "Player Party Room compatibility action");
assertIncludes(watchPartyIndex, "HOST PREFLIGHT", "Watch-Party host preflight");
assertIncludes(watchPartyIndex, "Live Watch-Party", "Watch-Party Live/Live Watch-Party label split");
assertIncludes(watchPartyIndex, "Watch-Party Live", "Watch-Party Live label");

assertIncludes(masterVision, "Watch-Party Live", "locked Watch-Party Live label");
assertIncludes(masterVision, "Live Watch-Party", "locked Live Watch-Party label");
assertIncludes(masterVision, "Party Room", "locked Party Room label");
assertIncludes(architectureRules, "Public Platform surface: `/channel/[userId]`", "route compatibility doctrine");
assertIncludes(roomBlueprint, "Party Room must not hand off to Live Stage", "Party Room route separation");

[
  "Viewer mode",
  "Creator mode",
  "Owner/Admin mode",
  "Home / Explore / Live / Library",
  "top Profile/avatar entry",
  "Watch-Party Live = content/player-driven watch-together flow",
  "Live Watch-Party = people-first live room",
  "Party Room = canonical room shell",
  "Platform Studio stays out of normal viewer bottom navigation",
].forEach((needle) => assertIncludes(navDoc, needle, "navigation terminology map"));

[
  "Mini Platform",
  "mini platform",
  "Open your channel",
  "manage your channel",
  "Channel customization",
  "Profile / Channel",
].forEach((needle) => {
  [
    ["app/(tabs)/index.tsx", home],
    ["app/(tabs)/live.tsx", liveTab],
    ["app/(tabs)/profile.tsx", profileTab],
    ["app/(tabs)/my-list.tsx", libraryTab],
    ["app/(tabs)/explore.tsx", explore],
    ["app/(tabs)/_layout.tsx", tabs],
  ].forEach(([label, source]) => assertNotIncludes(source, needle, label));
});

[
  [channelAudience, "Platform followed.", "Platform follow confirmation"],
  [channelAudience, "You cannot follow your own Platform.", "Platform self-follow copy"],
  [channelAudience, "Only the Platform owner or an authorized admin can review this audience request.", "Platform audience authority copy"],
  [channelSubscriptions, "Platform Subscription received. Waiting for verified access to finish syncing.", "Platform Subscription sync copy"],
  [creatorVipPasses, "Creator-specific VIP access for this Platform only.", "VIP Platform isolation copy"],
  [profilePrivacy, "A Platform audience block prevents full profile access between these accounts.", "Profile privacy Platform copy"],
  [friendGraph, "Chi'lly Circle is unavailable while a Platform audience block exists between these accounts.", "Chi'lly Circle Platform copy"],
  [friendGraph, "Chi'lly Circle status is unavailable right now.", "Chi'lly Circle safe read-error copy"],
  [friendGraph, "Unable to update Chi'lly Circle right now.", "Chi'lly Circle safe mutation-error copy"],
  [friendGraph, "Chi'lly Circle could not load right now.", "Chi'lly Circle safe list-error copy"],
  [friendGraph, "Choose a person to update Chi'lly Circle.", "Chi'lly Circle missing-person copy"],
  [channelReadModels, "This Platform could not be identified.", "Platform read-model error copy"],
  [accessEntitlements, "The Platform owner or profile defaults are still missing.", "Platform access diagnostic copy"],
  [accessEntitlements, "No explicit Platform profile was available, so access fell back to open defaults.", "Platform access fallback copy"],
  [dmca, "Warn a user or Platform that active copyright strikes have triggered review.", "copyright Platform copy"],
  [channelSubscriptionRoute, "Back to Platform", "Platform Subscription return action"],
  [channelSubscriptionRoute, "Back to creator Platform", "Platform Subscription return accessibility label"],
  [vipPassRoute, "Back to Platform", "VIP return action"],
  [vipPassRoute, "Back to creator Platform", "VIP return accessibility label"],
].forEach(([source, needle, label]) => assertIncludes(source, needle, label));

assertStaticMessagesUsePlatformTerminology(channelAudience, "Platform audience copy");
if (findUnsafeThrownErrors(friendGraph).length > 0) {
  fail("Chi'lly Circle must throw only approved, static customer-safe errors");
}

[
  [channelAudience, "Channel follow requires a channel user id.", "Platform audience copy"],
  [channelAudience, "String(error.message", "Platform audience raw provider error copy"],
  [channelAudience, "String(error?.message", "Platform audience raw provider error copy"],
  [channelSubscriptions, "verified channel status", "Platform Subscription copy"],
  [creatorVipPasses, "for this channel only", "VIP copy"],
  [profilePrivacy, "channel audience block", "Profile privacy copy"],
  [friendGraph, "channel audience block", "Chi'lly Circle copy"],
  [friendGraph, "target user id", "Chi'lly Circle developer-facing identifier copy"],
  [channelReadModels, "Channel user id is required.", "Platform read-model copy"],
  [accessEntitlements, "Channel user id or profile defaults", "Platform access diagnostic copy"],
  [accessEntitlements, "No explicit channel profile row", "Platform access fallback copy"],
  [dmca, "Warn a user or channel", "copyright copy"],
  [channelSubscriptionRoute, "Back to channel", "Platform Subscription return action"],
  [channelSubscriptionRoute, "Back to creator channel", "Platform Subscription return accessibility label"],
  [vipPassRoute, "Back to channel", "VIP return action"],
  [vipPassRoute, "Back to creator channel", "VIP return accessibility label"],
].forEach(([source, needle, label]) => assertNotIncludes(source, needle, label));

[
  'message: "You cannot follow your own channel."',
  'message : "You cannot follow your own channel."',
  'message:\n    "You cannot follow your own channel."',
  'message: "You cannot follow your own chan" + "nel."',
  'message: "You cannot follow your own ch\\u0061nnel."',
  'message: (`This ${"chan" + "nel"} is unavailable.`)',
  '["message"]: "This channel is unavailable."',
  'message: "Creator channels are unavailable."',
  'message: ("This channel is unavailable." satisfies string)',
  'message: ("This channel is unavailable."!)',
  'message: "Only the channel owner can review this request."',
  "message: 'Channel follow failed.'",
  "message: `This channel is unavailable.`",
].forEach((mutant) => {
  if (!hasStaleStaticChannelMessage(`({ ${mutant} })`)) {
    fail(`Platform audience guard accepted stale-message mutant: ${mutant}`);
  }
});

[
  'const stale = "This channel is unavailable."; ({ message: stale });',
  'const key = "message"; ({ [key]: "This channel is unavailable." });',
  '({ message: `Open ${creatorName} channel.` });',
  '({ message: "This channel is " + status });',
  '({ ["message"]: `Open ${creatorName} channel.` });',
  'const stale = "channel"; ({ message: "Open " + stale + status });',
  'const stale = "channel"; ({ message: `Open ${stale} ${status}` });',
  'const left = "chan"; const right = "nel"; ({ message: left + status + right });',
  'const COPY = { stale: "This channel is unavailable." }; ({ message: COPY.stale });',
  'const { stale } = { stale: "This channel is unavailable." }; ({ message: stale });',
  'const COPY = { stale: "This channel is unavailable." }; const result = {}; result.message = COPY.stale;',
  '({ get message() { return "This channel is unavailable."; } });',
  'const left = "chan"; const right = "nel"; const result = {}; result.message = left + status + right;',
  'const left = "chan"; const right = "nel"; ({ get message() { return left + status + right; } });',
  'const COPY = { left: "chan", right: "nel" }; ({ message: COPY.left + status + COPY.right });',
  'const COPY = { left: "chan", right: "nel" }; const { left, right } = COPY; ({ message: left + status + right });',
  'const COPY = ({ left: "chan", right: "nel" } as const); ({ message: COPY.left + status + COPY.right });',
  'const COPY = ({ left: "chan", right: "nel" } satisfies Record<string, string>); ({ message: COPY.left + status + COPY.right });',
  'const COPY = { ...{ left: "chan", right: "nel" } }; ({ message: COPY.left + status + COPY.right });',
  'const COPY = ["chan", "nel"] as const; const [left, right] = COPY; ({ message: left + status + right });',
  'const { left = "chan", right = "nel" } = {}; ({ message: left + status + right });',
  'const COPY = { left: "chan", right: "nel" }; ({ message: COPY?.left + status + COPY?.right });',
].forEach((mutant) => {
  if (!hasStaleStaticChannelMessage(mutant)) {
    fail(`Platform audience guard accepted binding/dynamic stale-message mutant: ${mutant}`);
  }
});

[
  "throw error;",
  "if (error) { throw error; }",
  "const providerError = error; throw providerError;",
  "throw new Error(error.message);",
  "throw new Error(`Provider: ${error.message}`);",
].forEach((mutant) => {
  if (findUnsafeThrownErrors(`const run = () => { ${mutant} };`).length === 0) {
    fail(`Chi'lly Circle error guard accepted unsafe-throw mutant: ${mutant}`);
  }
});

if (process.exitCode) {
  process.exit();
}

console.log("Navigation terminology policy guard passed.");
