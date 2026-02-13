#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const loadEnvFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const [key, ...rest] = trimmed.split("=");
      const value = rest.join("=").trim();
      if (key && value && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore
  }
};

const cwd = process.cwd();
loadEnvFile(path.resolve(cwd, ".env"));

const updateBaseUrl = process.env.BUSTLY_UPDATE_BASE_URL?.trim();

const normalizeArch = (value) => {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (v === "x64" || v === "amd64") return "x64";
  if (v === "arm64" || v === "aarch64") return "arm64";
  return null;
};

const normalizePlatform = (value, archValue) => {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (v === "mac" || v === "macos" || v === "darwin") {
    const arch = normalizeArch(archValue) || (process.arch === "arm64" ? "arm64" : "x64");
    return `mac-${arch}`;
  }
  if (v === "windows" || v === "win" || v === "win32") return "windows";
  if (v === "linux") return "linux";
  if (v === "mac-x64" || v === "mac-arm64") return v;
  return v;
};

const platformOverride = process.env.BUSTLY_UPDATE_PLATFORM?.trim();
const archOverride = process.env.BUSTLY_UPDATE_ARCH?.trim();

const platformKey =
  normalizePlatform(platformOverride, archOverride) ??
  (process.platform === "darwin"
    ? `mac-${process.arch === "arm64" ? "arm64" : "x64"}`
    : process.platform === "win32"
      ? "windows"
      : "linux");

const normalizeBase = (input) => input.replace(/\/+$/, "");
const resolved = (updateBaseUrl ? `${normalizeBase(updateBaseUrl)}/${platformKey}/` : "");

if (!resolved) {
  console.error(
    "[resolve-publish-url] Missing BUSTLY_UPDATE_URL or BUSTLY_UPDATE_BASE_URL",
  );
  process.exit(1);
}

process.stdout.write(resolved);
