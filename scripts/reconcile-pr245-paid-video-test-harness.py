#!/usr/bin/env python3
from pathlib import Path
p = Path('tests/creator-money/paid-video-playback-authority.test.mjs')
s = p.read_text()
old = 'const loadCreatorVideoRuntime = (paidContentAccess) => {\n'
new = '''const loadCreatorVideoRuntime = (paidContentAccess, vipAccess = {
  allowed: true,
  reason: "not_vip",
  vipRequired: false,
  creatorId: CREATOR_ID,
}) => {
'''
if old in s:
    s = s.replace(old, new, 1)
anchor = '''    "./creatorMonetization": {
      resolveCreatorContentAccess: async () => paidContentAccess,
    },
'''
replacement = anchor + '''    "./creatorVipPasses": {
      resolveCreatorVipVideoAccess: async () => vipAccess,
    },
'''
if '"./creatorVipPasses"' not in s:
    if anchor not in s:
        raise RuntimeError('creator monetization mock anchor missing')
    s = s.replace(anchor, replacement, 1)
p.write_text(s)
print('Adapted paid-video authority harness for VIP preflight.')
