#!/usr/bin/env node
"use strict";

/**
 * Build script: concatenate src/*.js (alphabetical order) into content.js.
 * Usage: npm run build   or   node build-content.js
 * To regenerate src/ from content.js: npm run split   or   node split-content.js
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "src");
const OUT_FILE = path.join(__dirname, "content.js");

const files = fs.readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();

const parts = [];
for (const name of files) {
    const filePath = path.join(SRC_DIR, name);
    const content = fs.readFileSync(filePath, "utf8");
    parts.push(content);
}

const output = parts.join("\n");
fs.writeFileSync(OUT_FILE, output, "utf8");
console.log("[build] Wrote", OUT_FILE, "from", files.length, "modules:", files.join(", "));
