import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);

function replaceExact(filePath, original, replacement) {
  const source = fs.readFileSync(filePath, "utf8");
  const originalCount = source.split(original).length - 1;
  const replacementCount = source.split(replacement).length - 1;

  if (originalCount === 1 && replacementCount === 0) {
    fs.writeFileSync(filePath, source.replace(original, replacement));
    return "patched";
  }

  if (originalCount === 0 && replacementCount === 1) {
    return "already_patched";
  }

  throw new Error(
    `unexpected locked dependency source at ${path.relative(root, filePath)}`,
  );
}

const minimatchPackages = Object.entries(lock.packages ?? {})
  .filter(
    ([packagePath]) =>
      packagePath === "node_modules/minimatch" ||
      packagePath.endsWith("/node_modules/minimatch"),
  )
  .map(([packagePath, metadata]) => ({
    packagePath,
    version: metadata.version,
  }));

const expectedVersions = new Set(["3.1.5", "9.0.9", "10.2.4", "10.2.5"]);
for (const { packagePath, version } of minimatchPackages) {
  if (!expectedVersions.has(version)) {
    throw new Error(`unreviewed minimatch version in lock: ${version}`);
  }
}

const minimatch3 = minimatchPackages.filter(({ version }) => version === "3.1.5");
const minimatch9 = minimatchPackages.filter(({ version }) => version === "9.0.9");
if (minimatch3.length !== 1 || minimatch9.length !== 1) {
  throw new Error(
    `expected one minimatch 3.1.5 and one minimatch 9.0.9 install, got ${minimatch3.length}/${minimatch9.length}`,
  );
}

const minimatch3Root = path.join(root, minimatch3[0].packagePath);
replaceExact(
  path.join(minimatch3Root, "minimatch.js"),
  "var expand = require('brace-expansion')",
  [
    "var braceExpansion = require('brace-expansion')",
    "var expand = typeof braceExpansion === 'function'",
    "  ? braceExpansion",
    "  : braceExpansion.expand",
    "if (typeof expand !== 'function') {",
    "  throw new TypeError('brace-expansion export is unavailable')",
    "}",
  ].join("\n"),
);

const minimatch9Root = path.join(root, minimatch9[0].packagePath);
replaceExact(
  path.join(minimatch9Root, "dist/commonjs/index.js"),
  [
    'const brace_expansion_1 = __importDefault(require("brace-expansion"));',
    "const assert_valid_pattern_js_1 = require(\"./assert-valid-pattern.js\");",
  ].join("\n"),
  [
    'const brace_expansion_1 = require("brace-expansion");',
    "const assert_valid_pattern_js_1 = require(\"./assert-valid-pattern.js\");",
  ].join("\n"),
);
replaceExact(
  path.join(minimatch9Root, "dist/commonjs/index.js"),
  "return (0, brace_expansion_1.default)(pattern);",
  "return (0, brace_expansion_1.expand)(pattern);",
);
replaceExact(
  path.join(minimatch9Root, "dist/esm/index.js"),
  "import expand from 'brace-expansion';",
  "import { expand } from 'brace-expansion';",
);

process.stdout.write(
  "patched locked minimatch 3/9 consumers for brace-expansion 5.0.8\n",
);
