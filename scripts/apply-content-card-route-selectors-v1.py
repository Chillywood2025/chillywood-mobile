#!/usr/bin/env python3
from pathlib import Path

card_path = Path("components/creator-media/creator-video-card.tsx")
card = card_path.read_text()

def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)

card = replace_once(
    card,
    '  onOpen: () => void;\n',
    '  onOpen: () => void;\n  testID?: string;\n',
    "shared card testID prop",
)
card = replace_once(
    card,
    '  onOpen,\n  onEdit,\n',
    '  onOpen,\n  testID,\n  onEdit,\n',
    "shared card testID destructure",
)
card = replace_once(
    card,
    '        accessibilityLabel={ownerMode ? `Open ${displayTitle}. Hold for content actions.` : `Open ${publicDisplayTitle}`}\n',
    '        accessibilityLabel={ownerMode ? `Open ${displayTitle}. Hold for content actions.` : `Open ${publicDisplayTitle}`}\n        testID={testID}\n',
    "shared card pressable testID",
)
card_path.write_text(card)

platform_path = Path("app/channel/[userId].tsx")
platform = platform_path.read_text()
needle = '        mode={showOwnerControls ? "owner" : "public"}\n'
if platform.count(needle) != 2:
    raise RuntimeError(f"public Platform shared card selector expected 2 cards, found {platform.count(needle)}")
platform = platform.replace(
    needle,
    needle + '        testID="platform-content-open-button"\n',
)
platform_path.write_text(platform)
print("Preserved the Public Platform content open selector on compact shared cards.")
