#!/usr/bin/env python3
from pathlib import Path


def one(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)

p = Path("_lib/creatorVideos.ts")
s = p.read_text()
s = one(
    s,
    "vipAccessRequired: row.vip_access_required === true,",
    "vipAccessRequired: (row as CreatorVideoRow & { vip_access_required?: boolean }).vip_access_required === true,",
    "typed videos VIP column",
)
p.write_text(s)

p = Path("app/channel-settings.tsx")
s = p.read_text()
s = one(s, "await refreshCreatorVideos();", "await loadCreatorVideos();", "reload creator videos after VIP toggle")
p.write_text(s)

p = Path("components/creator-media/CreatorContentActionSheet.tsx")
s = p.read_text()
s = one(
    s,
    "  onSetVipAccess: (video: CreatorVideo, required: boolean) => void;\n",
    "  onSetVipAccess?: (video: CreatorVideo, required: boolean) => void;\n",
    "optional VIP action",
)
old = '''            <SheetAction
              label={video?.vipAccessRequired ? "Remove from VIP shelf" : "Add to VIP shelf"}
              disabled={!video || busy || (!video.vipAccessRequired && video.visibility !== "public")}
              detail={!video?.vipAccessRequired && video?.visibility !== "public" ? "Make this video Public first" : "VIP replaces per-video paid unlock for this item"}
              onPress={() => run((selected) => onSetVipAccess(selected, !selected.vipAccessRequired))}
            />
'''
new = '''            {onSetVipAccess ? (
              <SheetAction
                label={video?.vipAccessRequired ? "Remove from VIP shelf" : "Add to VIP shelf"}
                disabled={!video || busy || (!video.vipAccessRequired && video.visibility !== "public")}
                detail={!video?.vipAccessRequired && video?.visibility !== "public" ? "Make this video Public first" : "VIP replaces per-video paid unlock for this item"}
                onPress={() => run((selected) => onSetVipAccess(selected, !selected.vipAccessRequired))}
              />
            ) : null}
'''
s = one(s, old, new, "conditional VIP owner action")
p.write_text(s)

print("Fixed VIP shelf TypeScript and owner-action boundaries.")
