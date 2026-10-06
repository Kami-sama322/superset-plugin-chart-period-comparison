/**
 * Standalone unit-test runner for this plugin: runs the dependency-free
 * *.test.ts modules outside the Superset frontend tree with plain Node.js
 * (>= 22.6), no Jest and no npm install required.
 *
 * Usage:
 *   node --experimental-strip-types scripts/run-tests.mjs src/periods.test.ts [more.test.ts ...]
 *
 * With no arguments every src/*.test.ts runs except core-coupled ones
 * (buildQuery.test.ts needs the real @superset-ui/core and must run
 * inside the Superset frontend tree instead).
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readdirSync } from "node:fs";


register("./test-hooks.mjs", pathToFileURL(import.meta.dirname + "/"));

await import("./globals.mjs");

let files = process.argv.slice(2);
if (files.length === 0) {
  const srcDir = pathToFileURL(import.meta.dirname + "/../src/").pathname;
  files = readdirSync(srcDir)
    .filter(name => name.endsWith(".test.ts") && name !== "buildQuery.test.ts")
    .sort()
    .map(name => srcDir + name);
}

let failed = false;
for (const file of files) {
  try {
    // awaiting INSIDE the loop makes ESM link errors (a moved/renamed
    // export that a module no longer provides) fail this run loudly —
    // node:test otherwise swallows them as post-run uncaughtExceptions
    await import(pathToFileURL(file).href);
  } catch (error) {
    failed = true;
    console.error(`LOAD FAILED: ${file}\n${error?.stack || error}`);
  }
}

// force-link the dependency-free modules: a module may load cleanly in
// its own test file while another importer's binding is broken — this
// catches moved/renamed exports that babel would silently compile
const pureModules = [
  "periods.ts",
  "scale.ts",
  "queryPlan.ts",
  "seriesData.ts",
  "crossFilter.ts",
];
for (const name of pureModules) {
  const file = pathToFileURL(import.meta.dirname + "/../src/" + name).href;
  try {
    await import(file);
  } catch (error) {
    failed = true;
    console.error(`LINK FAILED: ${file}\n${error?.message || error}`);
  }
}

if (failed) {
  console.error("# RUN FAILED");
  process.exit(1);
}
