#!/usr/bin/env node
/**
 * sync-to-nitrostack.cjs
 *
 * Copies each MCP server out of the trademind monorepo into its own
 * standalone folder (the layout your 6 NitroCloud deploy repos use),
 * inlining @trademind/shared-types by copying the REAL source files
 * instead of hand-maintaining a duplicate. This is the step that keeps
 * the standalone repos from drifting out of sync with the monorepo.
 *
 * USAGE:
 *   1. Put this file in the root of your `trademind` repo.
 *   2. Make sure `trademind-nitrostack-mcp-servers` sits next to it
 *      (i.e. both folders share the same parent directory). If not,
 *      edit OUTPUT_ROOT below.
 *   3. Run:  node sync-to-nitrostack.cjs
 *   4. cd into each of the 6 output folders, review `git diff`, then
 *      commit + push as usual.
 */

const fs = require("fs");
const path = require("path");

// ---- CONFIG: adjust these if your folder names/locations differ ----
const MONOREPO_MCP_DIR = path.join(__dirname, "services", "mcp-servers");
const SHARED_TYPES_SRC = path.join(__dirname, "packages", "shared-types", "src");
const OUTPUT_ROOT = path.join(__dirname, "..", "trademind-nitrostack-mcp-servers");

const SERVICES = [
  "portfolio-mcp",
  "market-data-mcp",
  "risk-engine-mcp",
  "trade-records-mcp",
  "compliance-db-mcp",
  "slack-mcp",
];

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".env") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function rewriteSharedTypesImports(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteSharedTypesImports(p);
      continue;
    }
    if (!p.endsWith(".ts")) continue;
    let content = fs.readFileSync(p, "utf8");
    if (content.includes("@trademind/shared-types")) {
      const fileDir = path.dirname(p);
      const target = path.join(dir, "shared-types");
      let rel = path.relative(fileDir, target).replace(/\\/g, "/");
      if (!rel.startsWith(".")) rel = "./" + rel;
      content = content.replace(/["']@trademind\/shared-types["']/g, `"${rel}/index.js"`);
      fs.writeFileSync(p, content);
      console.log(`  rewrote import in ${path.relative(OUTPUT_ROOT, p)}`);
    }
  }
}

function stripWorkspaceDependency(pkgJsonPath) {
  if (!fs.existsSync(pkgJsonPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  if (pkg.dependencies && pkg.dependencies["@trademind/shared-types"]) {
    delete pkg.dependencies["@trademind/shared-types"];
  }
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n");
}

for (const service of SERVICES) {
  console.log(`\n== ${service} ==`);
  const src = path.join(MONOREPO_MCP_DIR, service);
  const dest = path.join(OUTPUT_ROOT, service);

  if (!fs.existsSync(src)) {
    console.log(`  SKIP: not found at ${src}`);
    continue;
  }

  copyDirRecursive(src, dest);

  const sharedTypesDest = path.join(dest, "src", "shared-types");
  copyDirRecursive(SHARED_TYPES_SRC, sharedTypesDest);

  rewriteSharedTypesImports(path.join(dest, "src"));
  stripWorkspaceDependency(path.join(dest, "package.json"));

  console.log(`  synced -> ${dest}`);
}

console.log("\nDone. cd into each output folder, check `git diff`, then commit + push.");
