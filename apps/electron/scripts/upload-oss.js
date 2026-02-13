#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const env = (getArg("--env") || "test").toLowerCase();
const srcArg = getArg("--src");
const platformArg = getArg("--platform");
const archArg = getArg("--arch");

const normalizeArch = (value) => {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "x64" || v === "amd64") return "x64";
  if (v === "arm64" || v === "aarch64") return "arm64";
  return null;
};

const platformFromNode = (value, archValue) => {
  if (value === "darwin") {
    const arch = normalizeArch(archValue) || (process.arch === "arm64" ? "arm64" : "x64");
    return `mac-${arch}`;
  }
  if (value === "win32") return "windows";
  return "linux";
};

const platform = platformArg || platformFromNode(process.platform, archArg);
const normalizedPlatform = (() => {
  if (!platform) return "";
  const v = platform.toLowerCase();
  if (v === "mac" || v === "macos" || v === "darwin") {
    const arch = normalizeArch(archArg) || (process.arch === "arm64" ? "arm64" : "x64");
    return `mac-${arch}`;
  }
  if (v === "windows" || v === "win" || v === "win32") return "windows";
  if (v === "linux") return "linux";
  if (v === "mac-x64" || v === "mac-arm64") return v;
  return v;
})();

const uploadAll = !srcArg;
if (!uploadAll && !normalizedPlatform) {
  console.error("[upload-oss] Unknown platform. Use --platform mac|mac-x64|mac-arm64|windows|linux.");
  process.exit(1);
}

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

const destBase = uploadAll ? `${bucket}/` : `${bucket}/${normalizedPlatform}/`;

const versionCheck = spawnSync("ossutil", ["version"], { stdio: "inherit" });
if (versionCheck.status !== 0) {
  console.error("[upload-oss] ossutil not found or failed to run.");
  process.exit(versionCheck.status ?? 1);
}

const isUpdateMetadata = (lower) => {
  if (!(lower.endsWith(".yml") || lower.endsWith(".yaml"))) {
    return false;
  }
  const base = lower.split("/").pop() || lower;
  if (base === "latest.yml" || base === "latest-mac.yml") return true;
  if (base.endsWith("-mac.yml") || base.endsWith("-mac.yaml")) return true;
  const channelPrefix = /^(alpha|beta|rc|dev|canary)/;
  return channelPrefix.test(base);
};

const isFileAllowed = (name) => {
  const lower = name.toLowerCase();
  return lower.endsWith(".dmg") || lower.endsWith(".zip") || isUpdateMetadata(lower);
};

const listTopLevelFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isFileAllowed(entry.name))
    .map((entry) => join(dir, entry.name));

const entries = [];
if (uploadAll) {
  const platformDirs = readdirSync(srcPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const platformDir of platformDirs) {
    const fullPath = join(srcPath, platformDir);
    for (const filePath of listTopLevelFiles(fullPath)) {
      entries.push(filePath);
    }
  }
} else {
  entries.push(...listTopLevelFiles(srcPath));
}

if (entries.length === 0) {
  console.error(`[upload-oss] No release artifacts found in ${srcPath}`);
  process.exit(1);
}

console.log(`[upload-oss] Uploading ${entries.length} files -> ${destBase}`);
for (const filePath of entries) {
  const relative = filePath.slice(srcPath.length + 1).split("/").join("/");
  const firstDir = relative.split("/")[0] || normalizedPlatform;
  const dest = `${bucket}/${firstDir}/`;
  console.log(`[upload-oss] Uploading ${relative} -> ${dest}`);
  const result = spawnSync("ossutil", ["cp", filePath, dest, "-f"], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
