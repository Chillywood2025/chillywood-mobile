import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const patch = require("../../plugins/withIosPickerDismissal.js").__test;

export function createPickerFixture(root, destination) {
  const lock = { packages: {} };
  for (const sdk of patch.specification.packages) {
    const packageRoot = path.join(destination, "node_modules", sdk.name);
    fs.mkdirSync(path.join(packageRoot, "ios"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ name: sdk.name, version: sdk.version }));
    lock.packages[`node_modules/${sdk.name}`] = { version: sdk.version, integrity: sdk.integrity };
    for (const definition of sdk.files) {
      const installed = fs.readFileSync(path.join(root, "node_modules", sdk.name, definition.path), "utf8");
      fs.writeFileSync(path.join(packageRoot, definition.path), patch.transformSource(definition, installed, true));
    }
  }
  fs.writeFileSync(path.join(destination, "package-lock.json"), JSON.stringify(lock));
  return destination;
}
