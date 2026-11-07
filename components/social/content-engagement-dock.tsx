import React from "react";
import { useIsFocused } from "@react-navigation/native";
import { useContentSocialEngagement } from "../../hooks/use-content-social-engagement";
import { EngagementBar } from "./engagement-bar";

export function ContentEngagementDock({ kind, id, enabled = true, onComments, onShare, compact = false }: {
  kind: "creator_video" | "title";
  id: string;
  enabled?: boolean;
  onComments?: () => void;
  onShare?: () => void;
  compact?: boolean;
}) {
  const focused = useIsFocused();
  const engagement = useContentSocialEngagement({ kind, id, enabled: enabled && focused });
  return <EngagementBar
    compact={compact}
    likes={engagement.likeCount}
    comments={engagement.commentCount}
    commentsLabel={kind === "creator_video" ? "Discussions" : "Comments"}
    shares={engagement.shareCount}
    liked={engagement.liked}
    reposted={engagement.reposted}
    busy={engagement.busy}
    error={engagement.error}
    onLike={engagement.canLike && !engagement.loading ? () => { void engagement.toggleLike(); } : undefined}
    onRepost={engagement.canRepost && !engagement.loading ? () => { void engagement.toggleRepost(); } : undefined}
    onComments={onComments}
    onShare={onShare}
    onRetry={() => { void engagement.refresh(); }}
  />;
}
