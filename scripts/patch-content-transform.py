#!/usr/bin/env python3
from pathlib import Path
p = Path("scripts/apply-content-card-density-v1.py")
s = p.read_text()
old = "home = replace_once(home, '    borderRadius: 20,\\n    borderWidth: 1,', '    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
new = "home = replace_once(home, '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 20,\\n    borderWidth: 1,', '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
if s.count(old) != 1:
    raise SystemExit(f"selector patch expected 1 match, found {s.count(old)}")
p.write_text(s.replace(old, new, 1))
print("Patched content transform selector")
