from pathlib import Path


def replace_once(path, old, new):
    text = Path(path).read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, found {count}: {old[:80]!r}")
    Path(path).write_text(text.replace(old, new, 1))


def replace_between(path, start, end, replacement):
    text = Path(path).read_text()
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{path}: missing start marker {start!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{path}: missing end marker {end!r}")
    Path(path).write_text(text[:start_index] + replacement + text[end_index:])


circle = "app/chilly-circle.tsx"
replace_once(
    circle,
    '''        <View style={[styles.avatar, styles.officialAvatar, styles.officialAvatarCompact]}>
          <Text style={[styles.avatarInitial, styles.officialAvatarInitial]}>R</Text>
        </View>''',
    '''        <View style={[styles.avatar, styles.officialAvatar]}>
          {RACHI_OFFICIAL_ACCOUNT.avatarUrl ? (
            <Image source={{ uri: RACHI_OFFICIAL_ACCOUNT.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarInitial, styles.officialAvatarInitial]}>R</Text>
          )}
        </View>''',
)
replace_once(
    circle,
    '''  officialAvatarCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
''',
    "",
)
replace_once(
    circle,
    '''  officialAvatarInitial: {
    fontSize: 10,
  },''',
    '''  officialAvatarInitial: {
    fontSize: 15,
  },''',
)
replace_once(
    circle,
    '''  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },''',
    '''  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },''',
)

profile = "app/profile/[userId].tsx"
replace_once(
    profile,
    '''  readUserProfile,
  readUserProfileByUserId,
  type ProfileAppearanceFitMode,''',
    '''  readUserProfile,
  readUserProfileByUserId,
  saveUserProfile,
  type ProfileAppearanceFitMode,''',
)
replace_once(
    profile,
    '''  const [reminderActionLoading, setReminderActionLoading] = useState<string | null>(null);
  const [reminderActionNotice, setReminderActionNotice] = useState<string | null>(null);''',
    '''  const [reminderActionLoading, setReminderActionLoading] = useState<string | null>(null);
  const [reminderActionNotice, setReminderActionNotice] = useState<string | null>(null);
  const [aboutDraft, setAboutDraft] = useState("");
  const [aboutBusy, setAboutBusy] = useState(false);
  const [aboutNotice, setAboutNotice] = useState<string | null>(null);''',
)
replace_once(
    profile,
    '''  const visibleProfileBackgroundOverlay = profile.profileBackgroundOverlayStrength;

  useEffect(() => {''',
    '''  const visibleProfileBackgroundOverlay = profile.profileBackgroundOverlayStrength;

  useEffect(() => {
    setAboutDraft(profile.tagline ?? "");
    setAboutNotice(null);
  }, [profile.tagline, userId]);

  useEffect(() => {''',
)
replace_once(
    profile,
    '''  const publicEventCount = publicEvents.length;
  const liveEventCount = publicEvents.filter((event) => event.isLiveNow).length;''',
    '''  const currentPublicEvents = publicEvents.filter((event) => (
    event.isLiveNow || event.isUpcoming || event.replay.isReplayAvailableNow
  ));
  const publicEventCount = currentPublicEvents.length;
  const liveEventCount = publicEvents.filter((event) => event.isLiveNow).length;''',
)
replace_once(
    profile,
    '''  const contentCreatorEventsBody = isOfficialProfile
    ? "Official programming stays public-safe and managed by Chi'llywood."
    : publicEventsReady
      ? publicEventCount
        ? `${publicEventCount} public creator event${publicEventCount === 1 ? "" : "s"} can appear here when scheduled or live.`
        : "No public creator live or watch-party events are scheduled yet."
      : "Loading this Platform's creator events.";''',
    '''  const contentCreatorEventsBody = isOfficialProfile
    ? "Official programming stays public-safe and managed by Chi'llywood."
    : publicEventsReady
      ? publicEventCount
        ? `${publicEventCount} current public event${publicEventCount === 1 ? "" : "s"} ${publicEventCount === 1 ? "is" : "are"} live, upcoming, or replay-ready.`
        : "No public creator live or watch-party events are scheduled right now."
      : "Loading this Platform's creator events.";''',
)

replace_between(
    profile,
    '  const liveTabSections: readonly ProfileSurfaceCard[] = [',
    '  const publicAudienceVisibilitySections: readonly ProfileSurfaceCard[] = useMemo(() => {',
    '''  const liveTabSections: readonly ProfileSurfaceCard[] = [
    {
      title: liveNowEvent ? "Live Now" : "Live",
      kicker: "LIVE",
      body: liveNowEvent
        ? `${liveNowEvent.eventTitle} is live now. Tap the live entry to watch.`
        : "Nothing is live right now.",
      accent: liveNowEvent ? "live" : "default",
    },
    {
      title: "Upcoming",
      kicker: "SCHEDULE",
      body: nextUpcomingEvent
        ? `${nextUpcomingEvent.eventTitle} starts ${formatEventDate(nextUpcomingEvent.startsAt)}.`
        : "No upcoming public events are scheduled.",
    },
    {
      title: "Replays",
      kicker: "WATCH LATER",
      body: replayReadyEvents.length
        ? `${replayReadyEvents.length} replay${replayReadyEvents.length === 1 ? " is" : "s are"} available now.`
        : "No event replays are available right now.",
    },
  ];
''',
)

replace_between(
    profile,
    '  const communityTabSections: readonly ProfileSurfaceCard[] = [',
    '  const aboutTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile',
    '''  const communityTabSections: readonly ProfileSurfaceCard[] = [
    {
      title: "Connections",
      kicker: "COMMUNITY",
      body: isSelfProfile
        ? "Your public community stays here while direct conversations live in Chi'lly Chat and closer connections live in Chi'lly Circle."
        : isOfficialProfile
          ? "Official updates stay public while direct private conversations remain separate."
          : "Follow public activity here, use Chi'lly Chat for direct conversation, and Chi'lly Circle for approved closer connections.",
    },
    ...publicAudienceVisibilitySections,
  ];
''',
)

replace_between(
    profile,
    '  const aboutTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile',
    '  const activeTabSections = activeTab === "home"',
    '''  const aboutTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Identity",
          kicker: profile.platformOwnershipLabel ?? "PLATFORM OWNED",
          body: officialAccount?.conciergeHeadline
            ? `${officialAccount.conciergeHeadline} ${profile.displayName} is Chi'llywood's verified public account.`
            : `${profile.displayName} is Chi'llywood's verified public account.`,
          accent: "official",
        },
      ]
    : [
        {
          title: `About ${profile.displayName}`,
          kicker: "ABOUT",
          body: profile.tagline?.trim()
            || (isSelfProfile ? "Add a short bio so people know who you are and what you share." : "No bio has been added yet."),
        },
        {
          title: "At a glance",
          kicker: "PROFILE",
          body: [profile.handle ? `@${profile.handle.replace(/^@/, "")}` : null, roleLabel].filter(Boolean).join(" · "),
        },
      ];

  const onSaveAbout = async () => {
    if (!isSelfProfile || !channelAccessProfile || aboutBusy) return;
    const normalizedAbout = aboutDraft.trim().slice(0, 160);
    const nextProfile: UserProfile = {
      ...channelAccessProfile,
      tagline: normalizedAbout || undefined,
    };
    setAboutBusy(true);
    setAboutNotice(null);
    try {
      await saveUserProfile(nextProfile);
      setChannelAccessProfile(nextProfile);
      setAboutDraft(normalizedAbout);
      setAboutNotice(normalizedAbout ? "About updated." : "About cleared.");
    } catch {
      setAboutNotice("Unable to update About right now.");
    } finally {
      setAboutBusy(false);
    }
  };
''',
)

replace_once(profile, '          {activeTab === "about" ? renderOwnerHandoffCard() : null}\n', '')

replace_between(
    profile,
    '''          {activeTab === "about" ? (
            <>
              <View style={styles.channelGuideCard}>''',
    '''          ) : null}
          {activeTab === "content" ? (''',
    '''          {activeTab === "about" ? (
            <>
              {isSelfProfile && !isOfficialProfile ? (
                <View style={styles.sectionCard}>
                  <AppText scale="caption" style={styles.sectionKicker}>EDIT ABOUT</AppText>
                  <AppText scale="title3" style={styles.sectionTitle}>Tell people a little about you</AppText>
                  <TextInput
                    style={styles.profilePostCommentInput}
                    value={aboutDraft}
                    onChangeText={(value) => {
                      setAboutDraft(value.slice(0, 160));
                      setAboutNotice(null);
                    }}
                    placeholder="What should people know about you?"
                    placeholderTextColor="#8A93A8"
                    multiline
                    maxLength={160}
                    editable={!aboutBusy}
                  />
                  <View style={styles.secondaryActionRow}>
                    <AppText scale="caption" style={styles.actionFootnote}>{aboutDraft.length}/160</AppText>
                    <TouchableOpacity
                      style={[styles.actionChip, styles.actionChipConnected, aboutBusy && styles.actionChipPlaceholder]}
                      activeOpacity={0.86}
                      disabled={aboutBusy}
                      onPress={() => { void onSaveAbout(); }}
                    >
                      <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                        {aboutBusy ? "Saving…" : "Save About"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {aboutNotice ? <AppText scale="footnote" style={styles.sectionBody}>{aboutNotice}</AppText> : null}
                </View>
              ) : null}
              {isOfficialProfile ? (
                <>
                  <View style={styles.channelGuideCard}>
                    <AppText scale="caption" style={styles.channelGuideKicker}>{channelHelper.kicker}</AppText>
                    <AppText scale="subhead" style={styles.channelGuideTitle}>{channelHelper.title}</AppText>
                    <AppText scale="footnote" style={styles.channelGuideBody}>{channelHelper.body}</AppText>
                    {officialGuidanceTopics.length ? (
                      <View style={styles.officialTopicRow}>
                        {officialGuidanceTopics.map((topic) => (
                          <View key={topic} style={styles.officialTopicChip}>
                            <AppText scale="caption" style={styles.officialTopicChipText}>{topic}</AppText>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.accessCard}>
                    <AppText scale="caption" style={styles.accessKicker}>PLATFORM ACCESS</AppText>
                    <AppText scale="subhead" style={styles.accessTitle}>{accessPosture.title}</AppText>
                    <AppText scale="footnote" style={styles.accessBody}>{accessPosture.body}</AppText>
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          {activeTab === "content" ? (''',
)

replace_once(
    profile,
    '''              {publicEventsReady && publicEvents.length ? (
                publicEvents.map((event) => {''',
    '''              {publicEventsReady && currentPublicEvents.length ? (
                currentPublicEvents.map((event) => {''',
)

profile_text = Path(profile).read_text()
required_feed_tokens = [
    "buildOwnProfileSocialFeed({",
    "buildPublicProfileActivityFeed({",
    "circlePosts: profileSocialFeedExtras.circlePosts",
    "followedPosts: profileSocialFeedExtras.followedPosts",
    "circleVideos: profileSocialFeedExtras.circleVideos",
    "followedVideos: profileSocialFeedExtras.followedVideos",
    "discoveryItems: profileSocialFeedExtras.discoveryItems",
    "notifications: profileSocialFeedExtras.notifications",
]
missing = [token for token in required_feed_tokens if token not in profile_text]
if missing:
    raise SystemExit(f"profile social/news feed regression: missing {missing}")
