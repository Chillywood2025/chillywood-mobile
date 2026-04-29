import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  formatSocialAttachmentFileSize,
  getReadableSocialAttachmentName,
  getSocialAttachmentKind,
  type SocialAttachment,
  type SocialAttachmentFile,
} from "../../_lib/socialAttachments";

type SocialAttachmentCardProps = {
  attachment?: SocialAttachment | null;
  file?: SocialAttachmentFile | null;
  compact?: boolean;
  onRemove?: () => void;
};

const getAttachmentIcon = (kind: ReturnType<typeof getSocialAttachmentKind>) => {
  if (kind === "image") return "image";
  if (kind === "video") return "movie";
  if (kind === "audio") return "graphic-eq";
  if (kind === "document") return "description";
  return "insert-drive-file";
};

const getAttachmentKindLabel = (kind: ReturnType<typeof getSocialAttachmentKind>) => {
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "document") return "Document";
  return "File";
};

export function SocialAttachmentCard({
  attachment,
  file,
  compact = false,
  onRemove,
}: SocialAttachmentCardProps) {
  const mimeType = attachment?.mimeType ?? file?.mimeType ?? "";
  const kind = getSocialAttachmentKind(mimeType);
  const title = attachment
    ? getReadableSocialAttachmentName({
        originalFileName: attachment.originalFileName,
        storagePath: attachment.storagePath,
      })
    : getReadableSocialAttachmentName({ name: file?.name });
  const sizeLabel = attachment
    ? formatSocialAttachmentFileSize(attachment.sizeBytes)
    : formatSocialAttachmentFileSize(file?.size);
  const imageUri = kind === "image"
    ? attachment?.signedUrl || file?.uri || ""
    : "";
  const signedUrl = attachment?.signedUrl ?? "";
  const canOpen = !!signedUrl;

  const content = (
    <>
      <View style={[styles.preview, compact && styles.previewCompact]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        ) : (
          <MaterialIcons name={getAttachmentIcon(kind)} size={compact ? 18 : 22} color="#F4F7FF" />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[getAttachmentKindLabel(kind), sizeLabel].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {onRemove ? (
        <TouchableOpacity
          style={styles.removeButton}
          activeOpacity={0.82}
          onPress={onRemove}
          accessibilityLabel="Remove attachment"
        >
          <MaterialIcons name="close" size={16} color="#F4F7FF" />
        </TouchableOpacity>
      ) : null}
    </>
  );

  if (canOpen) {
    return (
      <TouchableOpacity
        style={[styles.card, compact && styles.cardCompact]}
        activeOpacity={0.86}
        onPress={() => {
          void WebBrowser.openBrowserAsync(signedUrl);
        }}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  cardCompact: {
    minHeight: 48,
    padding: 7,
  },
  preview: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(115,134,255,0.22)",
  },
  previewCompact: {
    width: 34,
    height: 34,
    borderRadius: 9,
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: "#F4F7FF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  titleCompact: {
    fontSize: 12,
  },
  meta: {
    color: "#9DA8BD",
    fontSize: 10.5,
    fontWeight: "800",
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
});
