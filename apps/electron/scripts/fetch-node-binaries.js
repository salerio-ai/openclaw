#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);

const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) {return null;}
  return args[idx + 1] ?? null;
};

const normalizeVersion = (value) => {
  if (!value) {return null;}
  return value.startsWith("v") ? value : `v${value}`;
};

const DEFAULT_TARGETS = ["mac-arm64", "mac-x64", "windows-x64"];
const allowedTargets = new Set([
  "mac-arm64",
  "mac-x64",
  "windows-x64",
  "windows-arm64",
  "linux-x64",
  "linux-arm64",
]);

const parseTargets = () => {
  const raw = getArg("--targets");
  if (!raw) {return DEFAULT_TARGETS;}
  const parsed = raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (parsed.length === 0) {
    throw new Error("No targets provided to --targets.");
  }
  for (const t of parsed) {
    if (!allowedTargets.has(t)) {
      throw new Error(
        `Unsupported target "${t}". Allowed: ${Array.from(allowedTargets).join(", ")}`,
      );
    }
  }
  return parsed;
};

const resolveDistInfo = (target, version) => {
  const [platform, arch] = target.split("-");
  if (!platform || !arch) {
    throw new Error(`Invalid target format: ${target}`);
  }

  if (platform === "mac") {
    const file = `node-${version}-darwin-${arch}.tar.gz`;
    return {
      archiveFile: file,
      extractType: "tar",
      binaryName: "node",
    };
  }

  if (platform === "windows") {
    const file = `node-${version}-win-${arch}.zip`;
    return {
      archiveFile: file,
      extractType: "zip",
      binaryName: "node.exe",
    };
  }

  if (platform === "linux") {
    const file = `node-${version}-linux-${arch}.tar.xz`;
    return {
      archiveFile: file,
      extractType: "tar",
      binaryName: "node",
    };
  }

  throw new Error(`Unsupported platform in target: ${target}`);
};

const downloadFile = async (url, destPath) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  writeFileSync(destPath, body);
};

const run = (cmd, cmdArgs) => {
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${cmdArgs.join(" ")}`);
  }
};

const findBinaryRecursive = (rootDir, binaryName) => {
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {break;}
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name === binaryName) {
        if (binaryName === "node" && !full.includes(`${path.sep}bin${path.sep}`)) {
          continue;
        }
        return full;
      }
    }
  }
  return null;
};

const main = async () => {
  const version =
    normalizeVersion(getArg("--version")) || normalizeVersion(process.env.OPENCLAW_NODE_VERSION) || "v22.19.0";
  const targets = parseTargets();
  const resourcesRoot = path.resolve("resources", "node");
  const workDir = mkdtempSync(path.join(tmpdir(), "openclaw-node-fetch-"));

  try {
    mkdirSync(resourcesRoot, { recursive: true });

    for (const target of targets) {
      const info = resolveDistInfo(target, version);
      const url = `https://nodejs.org/dist/${version}/${info.archiveFile}`;
      const archivePath = path.join(workDir, info.archiveFile);
      const extractDir = path.join(workDir, target);

      console.log(`[fetch-node] Downloading ${url}`);
      await downloadFile(url, archivePath);

      mkdirSync(extractDir, { recursive: true });
      if (info.extractType === "tar") {
        run("tar", ["-xf", archivePath, "-C", extractDir]);
      } else {
        run("unzip", ["-q", archivePath, "-d", extractDir]);
      }

      const binaryPath = findBinaryRecursive(extractDir, info.binaryName);
      if (!binaryPath || !existsSync(binaryPath) || !statSync(binaryPath).isFile()) {
        throw new Error(`Failed to locate ${info.binaryName} in extracted archive for ${target}`);
      }

      const destDir = path.join(resourcesRoot, target, "bin");
      const destPath = path.join(destDir, info.binaryName);
      mkdirSync(destDir, { recursive: true });
      copyFileSync(binaryPath, destPath);
      if (info.binaryName === "node") {
        chmodSync(destPath, 0o755);
      }

      console.log(`[fetch-node] Bundled ${target}: ${binaryPath} -> ${destPath}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(`[fetch-node] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
