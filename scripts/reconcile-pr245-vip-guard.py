#!/usr/bin/env python3
from pathlib import Path
p = Path('scripts/guard-vip-video-shelf-v1.mjs')
s = p.read_text()
old = 'need(videos, \'resolveCreatorVipVideoAccess(parsedWithAccess.id)\', "Player VIP authority");\n'
new = '''need(videos, 'resolveCreatorVipVideoAccess(normalizedVideoId)', "Player VIP pre-row authority");
const vipAuthorityIndex = videos.indexOf('resolveCreatorVipVideoAccess(normalizedVideoId)');
const protectedRowReadIndex = videos.indexOf('.from("videos")', vipAuthorityIndex);
if (vipAuthorityIndex < 0 || protectedRowReadIndex < 0 || vipAuthorityIndex > protectedRowReadIndex) {
  throw new Error("VIP authority must resolve before protected creator-video row selection");
}
'''
if old not in s:
    raise RuntimeError('old VIP guard expectation missing')
s = s.replace(old, new, 1)
p.write_text(s)
print('Adapted VIP guard to require pre-row entitlement authority.')
