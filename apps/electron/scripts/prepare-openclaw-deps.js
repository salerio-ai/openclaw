import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const targetDir = resolve(repoRoot, "apps/electron/resources/openclaw");
const stagingDir = mkdtempSync(resolve(tmpdir(), "openclaw-deps-"));

rmSync(targetDir, { recursive: true, force: true });

const deployResult = spawnSync(
  "pnpm",
  ["deploy", "--filter", "openclaw", "--prod", "--legacy", stagingDir],
  { cwd: repoRoot, stdio: "inherit" },
);

if (deployResult.status !== 0) {
  process.exit(deployResult.status ?? 1);
}

const nodeModulesDir = resolve(stagingDir, "node_modules");
if (!existsSync(nodeModulesDir)) {
  console.error("[prepare-openclaw-deps] node_modules not found after deploy.");
  process.exit(1);
}

// Replace pnpm virtual store layout with a hoisted (non-symlink) install.
rmSync(nodeModulesDir, { recursive: true, force: true });
const installResult = spawnSync(
  "pnpm",
  ["install", "--prod", "--node-linker=hoisted", "--ignore-scripts"],
  { cwd: stagingDir, stdio: "inherit" },
);
if (installResult.status !== 0) {
  process.exit(installResult.status ?? 1);
}

const removeBinDirs = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".bin") {
        rmSync(fullPath, { recursive: true, force: true });
        continue;
      }
      removeBinDirs(fullPath);
    }
  }
};

removeBinDirs(resolve(stagingDir, "node_modules"));

// Ensure any symlinks are copied as real files.
// Otherwise they can point at the temp staging dir after it is removed.
cpSync(stagingDir, targetDir, { recursive: true, dereference: true });
rmSync(stagingDir, { recursive: true, force: true });
