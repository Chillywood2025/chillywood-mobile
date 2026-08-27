#!/usr/bin/env python3
from pathlib import Path

path = Path("app/profile/[userId].tsx")
text = path.read_text()

def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)

old = '''                <View style={styles.creatorVideoGrid}>
                  {creatorVideos.map((video) => (
                    <CreatorVideoCard
                      key={video.id}
                      video={video}
                      mode={isSelfProfile ? "owner" : "public"}
                      onOpen={() => openCreatorVideo(video)}
                      onShare={!isSelfProfile && isCreatorVideoPubliclyShareable(video) ? () => {
                        void shareCreatorVideo(video);
                      } : undefined}
                    />
                  ))}
                </View>'''
new = '''                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.creatorVideoGrid}
                >
                  {creatorVideos.map((video) => (
                    <View key={video.id} style={styles.profileCreatorVideoTile}>
                      <CreatorVideoCard
                        video={video}
                        mode={isSelfProfile ? "owner" : "public"}
                        onOpen={() => openCreatorVideo(video)}
                        onShare={!isSelfProfile && isCreatorVideoPubliclyShareable(video) ? () => {
                          void shareCreatorVideo(video);
                        } : undefined}
                      />
                    </View>
                  ))}
                </ScrollView>'''
text = replace_once(text, old, new, "Profile creator content shelf")
text = replace_once(
    text,
    '  creatorVideoGrid: {\n    gap: 10,\n  },\n',
    '  creatorVideoGrid: {\n    gap: 9,\n    paddingRight: 4,\n  },\n  profileCreatorVideoTile: {\n    width: 150,\n  },\n',
    "Profile creator content tile style",
)
path.write_text(text)
print("Applied compact horizontal creator content shelf to Profile content tab.")
