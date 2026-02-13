#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const normalizePlatform = (value) => {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "mac" || v === "darwin" || v === "macos") return "mac";
  if (v === "win" || v === "windows" || v === "win32") return "windows";
  if (v === "linux") return "linux";
  return null;
};

const normalizeArch = (value) => {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "x64" || v === "amd64") return "x64";
  if (v === "arm64" || v === "aarch64") return "arm64";
  if (v === "universal") return "universal";
  return null;
};

const envName = (getArg("--env") || "test").toLowerCase();
const platform = normalizePlatform(getArg("--platform") || process.platform);
const arch = normalizeArch(getArg("--arch") || (platform === "mac" ? process.arch : null));
const signMode = (getArg("--sign") || "auto").toLowerCase();

if (!platform) {
  console.error("[build-release] Unknown platform. Use --platform mac|windows|linux.");
  process.exit(1);
}

if (envName !== "test" && envName !== "prod") {
  console.error("[build-release] Unknown env. Use --env test|prod.");
  process.exit(1);
}
if (!["auto", "on", "off"].includes(signMode)) {
  console.error("[build-release] Unknown sign mode. Use --sign auto|on|off.");
  process.exit(1);
}

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const nodeCmd = process.platform === "win32" ? "node.exe" : "node";

const run = (cmd, cmdArgs, opts = {}) => {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: "inherit",
    cwd: appDir,
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const capture = (cmd, cmdArgs, opts = {}) => {
  const result = spawnSync(cmd, cmdArgs, {
    encoding: "utf-8",
    cwd: appDir,
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return (result.stdout || "").trim();
};

run(pnpmCmd, ["run", "prepare:openclaw-deps"]);
run(pnpmCmd, ["run", "prepare:node"]);
run(pnpmCmd, ["run", "build"]);

const updatePlatformKey =
  platform === "mac"
    ? `mac-${arch === "x64" || arch === "arm64" ? arch : "arm64"}`
    : platform === "windows"
      ? "windows"
      : "linux";

const publishUrl = capture(nodeCmd, ["scripts/resolve-publish-url.js"], {
  env: {
    ...process.env,
    BUSTLY_UPDATE_PLATFORM: updatePlatformKey,
  },
});

let outputDir = "dist/electron";
if (platform === "mac") {
  const resolvedArch = arch === "arm64" || arch === "x64" ? arch : "arm64";
  outputDir = `dist/electron/mac-${resolvedArch}`;
} else if (platform === "windows") {
  outputDir = "dist/electron/windows";
} else if (platform === "linux") {
  outputDir = "dist/electron/linux";
}

const builderArgs = [];
if (platform === "mac") {
  builderArgs.push("--mac");
  if (arch === "x64") builderArgs.push("--x64");
  if (arch === "arm64") builderArgs.push("--arm64");
  if (arch === "universal") builderArgs.push("--universal");
}
if (platform === "windows") builderArgs.push("--win");
if (platform === "linux") builderArgs.push("--linux");

builderArgs.push(
  "--publish=always",
  "-c.publish.provider=generic",
  `-c.publish.url=${publishUrl}`,
  `-c.directories.output=${outputDir}`,
);

const extraEnv = {};
if (signMode === "off" || (signMode === "auto" && envName === "test")) {
  extraEnv.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  builderArgs.push("-c.mac.identity=null");
}

run(pnpmCmd, ["dlx", "electron-builder", ...builderArgs], { env: extraEnv });

if (envName === "prod" && platform === "mac") {
  run(nodeCmd, ["scripts/notarize-mac-artifacts.js", "--dir", outputDir]);
}
