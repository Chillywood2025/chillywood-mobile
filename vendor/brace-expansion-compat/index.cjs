"use strict";

const upstream = require("brace-expansion-upstream");
const expand = upstream.expand;

if (typeof expand !== "function") {
  throw new TypeError("patched brace-expansion export is unavailable");
}

module.exports = expand;
Object.assign(module.exports, upstream);
