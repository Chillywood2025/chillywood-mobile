#!/usr/bin/env python3
from pathlib import Path
p = Path("scripts/apply-content-card-density-v1.py")
s = p.read_text()
selector_old = "home = replace_once(home, '    borderRadius: 20,\\n    borderWidth: 1,', '    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
selector_new = "home = replace_once(home, '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 20,\\n    borderWidth: 1,', '  feedActivityCard: {\\n    width: 150,\\n    borderRadius: 14,\\n    borderWidth: 1,', \"Home discovery card radius\")"
if s.count(selector_old) != 1:
    raise SystemExit(f"selector patch expected 1 match, found {s.count(selector_old)}")
s = s.replace(selector_old, selector_new, 1)
quote_old = "  'title: \\\"Chi\\\\'lly Circle\\\"',"
quote_new = "  \"title: \\\"Chi'lly Circle\\\"\","
if s.count(quote_old) != 1:
    raise SystemExit(f"quote patch expected 1 match, found {s.count(quote_old)}")
s = s.replace(quote_old, quote_new, 1)
p.write_text(s)
print("Patched content transform selectors and guard quoting")
