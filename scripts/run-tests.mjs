/**
 * Standalone unit-test runner for this plugin: runs the dependency-free
 * *.test.ts modules outside the Superset frontend tree with plain Node.js
 * (>= 22.6), no Jest and no npm install required.
 *
 * Usage:
 *   node --experimental-strip-types scripts/run-tests.mjs src/periods.test.ts [more.test.ts ...]
 *
 * Core-coupled tests (buildQuery.test.ts) need the real @superset-ui/core
 * and must run inside the Superset frontend tree instead.
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

for (const file of files) {
  await import(pathToFileURL(file).href);
}
