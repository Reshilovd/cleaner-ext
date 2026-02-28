#!/usr/bin/env node
"use strict";

/**
 * One-time script: read content.js and write src/01-core.js ... 08-init.js
 * by exact line ranges. Run once: node split-content.js
 */

const fs = require("fs");
const path = require("path");

const CONTENT_PATH = path.join(__dirname, "content.js");
const SRC_DIR = path.join(__dirname, "src");

const raw = fs.readFileSync(CONTENT_PATH, "utf8");
const lines = raw.split(/\r?\n/);

function extract(ranges) {
    const out = [];
    for (const [a, b] of ranges) {
        for (let i = a; i <= b; i++) {
            out.push(lines[i - 1]);
        }
    }
    return out.join("\n");
}

// Partition so concatenation 01..08 reproduces original file order.
// Ranges are [startLine, endLine] 1-based inclusive. 08-init runs state inits + init() + })(); at the end.
const modules = {
    "01-core.js": [[1, 130], [137, 2028]],             // IIFE, guard, constants, state; then init() and all through uniqStrings (exclude 131-136)
    "02-storage.js": [[2029, 2065]],                   // loadStoredState, saveStoredState
    "03-styles.js": [[2066, 2443]],                    // injectStyles
    "04-verify.js": [[2445, 2861]],                    // resolveVerifyRowContext through collectOpenEndsGroupsFromPage
    "05-storage.js": [[2862, 3135]],                   // loadManualBfridsState through setupManualPageIntegration
    "06-openends.js": [[3136, 4164]],                  // applyManualBfridsToTextarea through setupVerifyRowExclusiveCheckboxes
    "07-openends-ui.js": [[4165, 5294]],               // buildPanel through last function
    "08-init.js": [[131, 136], [5295, 5295]]          // let manualBfridsState = ...; init(); })();
};

if (!fs.existsSync(SRC_DIR)) {
    fs.mkdirSync(SRC_DIR, { recursive: true });
}

for (const [name, ranges] of Object.entries(modules)) {
    const content = extract(ranges);
    const outPath = path.join(SRC_DIR, name);
    fs.writeFileSync(outPath, content, "utf8");
    console.log("[split] Wrote", name);
}

console.log("[split] Done. Run: node build-content.js");
