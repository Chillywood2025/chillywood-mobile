#!/usr/bin/env python3
from pathlib import Path
p = Path("scripts/apply-content-card-density-v1.py")
s = p.read_text()
selector_old = "home = replace_once(home, '    borderRadius: 20,\\n    borderWidth: 1,', '    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
selector_new = "home = replace_once(home, '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 20,\\n    borderWidth: 1,', '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
if s.count(selector_old) != 1:
    raise SystemExit(f"selector patch expected 1 match, found {s.count(selector_old)}")
s = s.replace(selector_old, selector_new, 1)
lines = s.splitlines()
guard_start = next((i for i, line in enumerate(lines) if line.startswith("guard_add =")), -1)
if guard_start < 0:
    raise SystemExit("guard_add marker missing")
quote_matches = [i for i, line in enumerate(lines) if i > guard_start and "title:" in line and "Chi" in line and "Circle" in line]
if len(quote_matches) != 1:
    raise SystemExit(f"quote patch expected 1 guard candidate, found {len(quote_matches)}")
i = quote_matches[0]
lines[i] = "  'key: \\\"circle\\\"',"
s = "\n".join(lines) + ("\n" if s.endswith("\n") else "")
p.write_text(s)
print("Patched content transform selectors and safe Circle shelf guard needle")
