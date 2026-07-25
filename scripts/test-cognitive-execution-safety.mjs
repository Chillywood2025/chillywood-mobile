#!/usr/bin/env node
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/cognitive-contract-suite.mjs", "execution", "test"], { stdio: "inherit" });
