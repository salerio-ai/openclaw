#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const dirArgIndex = args.indexOf("--dir");
const dirArg = dirArgIndex === -1 ? null : args[dirArgIndex + 1];
const artifactDir = resolve(dirArg || process.env.ARTIFACT_DIR || "dist/electron");

const keychainProfile = process.env.NOTARYTOOL_PROFILE?.trim() || "bustly-notary";

const walk = (dir, results) => {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(fullPath, results);
      continue;
    }
    if (entry.endsWith(".dmg") || entry.endsWith(".zip")) {
      results.push(fullPath);
    }
  }
};

const artifacts = [];
walk(artifactDir, artifacts);

if (artifacts.length === 0) {
  console.error(`[notarize-mac] No .dmg/.zip artifacts found in ${artifactDir}`);
  process.exit(1);
}

console.log("[notarize-mac] Artifacts:");
for (const artifact of artifacts) {
  console.log(`  ${artifact}`);
}

const run = (cmd, cmdArgs) => {
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[notarize-mac] Command failed: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(result.status ?? 1);
  }
};

for (const artifact of artifacts) {
  run("/usr/bin/xcrun", [
    "notarytool",
    "submit",
    artifact,
    "--keychain-profile",
    keychainProfile,
    "--wait",
  ]);

  if (artifact.endsWith(".dmg")) {
    run("/usr/bin/xcrun", ["stapler", "staple", artifact]);
    run("/usr/bin/xcrun", ["stapler", "validate", artifact]);
  } else {
    console.log(`[notarize-mac] Skipping stapler for ${artifact}`);
  }
}
