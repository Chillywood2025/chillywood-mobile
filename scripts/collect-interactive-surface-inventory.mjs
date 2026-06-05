#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["app", "components"];
const interactivePatterns = [
  /\b<TouchableOpacity\b/g,
  /\b<Pressable\b/g,
  /\b<Button\b/g,
  /\b<Switch\b/g,
  /\b<TextInput\b/g,
  /\bonPress\s*=/g,
  /\bonLongPress\s*=/g,
  /\bonValueChange\s*=/g,
  /\brouter\.(push|replace|back)\s*\(/g,
  /\bhref\s*=/g,
  /\btestID\s*=/g,
  /\baccessibilityRole\s*=\s*["']button["']/g,
];

const routeFiles = [];
const rows = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx|ts|jsx|js)$/.test(entry.name)) continue;
    const rel = path.relative(root, full);
    const text = fs.readFileSync(full, "utf8");
    if (rel.startsWith("app/")) routeFiles.push(rel);
    const counts = {};
    for (const pattern of interactivePatterns) {
      pattern.lastIndex = 0;
      const key = pattern.source
        .replaceAll("\\b", "")
        .replaceAll("\\s*", "")
        .replaceAll("\\s", "")
        .replaceAll("[\"']", "")
        .replaceAll("=", "")
        .replaceAll("\\", "")
        .replaceAll("(", "")
        .replaceAll(")", "")
        .slice(0, 40);
      const matches = text.match(pattern);
      if (matches?.length) counts[key] = matches.length;
    }
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total > 0) rows.push({ file: rel, total, counts });
  }
}

for (const scanRoot of scanRoots) walk(path.join(root, scanRoot));

rows.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
routeFiles.sort();

const now = new Date().toISOString();
const totalInteractiveHits = rows.reduce((sum, row) => sum + row.total, 0);

function mdEscape(value) {
  return String(value).replaceAll("|", "\\|");
}

const lines = [];
lines.push("# Interactive Surface Inventory");
lines.push("");
lines.push(`Generated: ${now}`);
lines.push("");
lines.push("This is a static inventory seed for manual/device QA. It counts interactive JSX markers and route/navigation markers so the QA matrix can track what must be tested. It is not proof that a control works.");
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push(`- Route files: ${routeFiles.length}`);
lines.push(`- Files with interactive markers: ${rows.length}`);
lines.push(`- Total marker hits: ${totalInteractiveHits}`);
lines.push("");
lines.push("## Route Files");
lines.push("");
for (const file of routeFiles) lines.push(`- \`${file}\``);
lines.push("");
lines.push("## Interactive Files");
lines.push("");
lines.push("| File | Marker hits | Top markers |");
lines.push("| --- | ---: | --- |");
for (const row of rows) {
  const topMarkers = Object.entries(row.counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  lines.push(`| \`${mdEscape(row.file)}\` | ${row.total} | ${mdEscape(topMarkers)} |`);
}
lines.push("");

const outputPath = process.argv.includes("--write")
  ? process.argv[process.argv.indexOf("--write") + 1]
  : "";

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
} else {
  process.stdout.write(`${lines.join("\n")}\n`);
}
