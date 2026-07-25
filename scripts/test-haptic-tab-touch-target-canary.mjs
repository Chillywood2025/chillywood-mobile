#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const expectDefect = args.includes("--expect-defect");
const sourceArgument = args.find((argument) => !argument.startsWith("--"));
const sourcePath = path.resolve(sourceArgument ?? "components/haptic-tab.tsx");
const source = fs.readFileSync(sourcePath, "utf8");
const hasPlatformPressable = /<PlatformPressable\b/u.test(source);
const thresholdMatch = source.match(/minHeight\s*:\s*(\d+(?:\.\d+)?)/u);
const minimumHeight = thresholdMatch ? Number(thresholdMatch[1]) : null;
const compliant = hasPlatformPressable && minimumHeight !== null && minimumHeight >= 48;
assert.equal(
  compliant,
  !expectDefect,
  expectDefect
    ? "expected the frozen build-84 source to reproduce the sub-48dp tab target"
    : "HapticTab must enforce a minimum interactive height of 48dp",
);
console.log(JSON.stringify({
  compliant,
  expected: expectDefect ? "defect" : "compliant",
  minimumHeight,
  sourcePath: path.relative(process.cwd(), sourcePath),
}));
