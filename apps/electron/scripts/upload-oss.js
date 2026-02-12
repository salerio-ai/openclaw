#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const env = (getArg("--env") || "test").toLowerCase();
const srcArg = getArg("--src");
const platformArg = getArg("--platform");

const platformFromNode = (value) => {
  if (value === "darwin") return "macos";
  if (value === "win32") return "windows";
  return "linux";
};

const platform = platformArg || platformFromNode(process.platform);
const srcPath = resolve(srcArg || "dist/electron");

if (!existsSync(srcPath)) {
  console.error(`[upload-oss] Source path not found: ${srcPath}`);
  process.exit(1);
}

const bucket =
  env === "prod"
    ? "oss://www-salerio-global/static"
    : env === "test"
      ? "oss://test-www-salerio-global/static"
      : null;

if (!bucket) {
  console.error(`[upload-oss] Unknown env: ${env} (use test|prod)`);
  process.exit(1);
}

const dest = `${bucket}/${platform}/`;

const versionCheck = spawnSync("ossutil", ["version"], { stdio: "inherit" });
if (versionCheck.status !== 0) {
  console.error("[upload-oss] ossutil not found or failed to run.");
  process.exit(versionCheck.status ?? 1);
}

const isFileAllowed = (name) => {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".dmg") ||
    lower.endsWith(".zip") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".blockmap")
  );
};

const entries = readdirSync(srcPath, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter(isFileAllowed);

if (entries.length === 0) {
  console.error(`[upload-oss] No release artifacts found in ${srcPath}`);
  process.exit(1);
}

console.log(`[upload-oss] Uploading ${entries.length} files -> ${dest}`);
for (const file of entries) {
  const filePath = resolve(srcPath, file);
  console.log(`[upload-oss] Uploading ${file}`);
  const result = spawnSync("ossutil", ["cp", filePath, dest, "-f"], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
