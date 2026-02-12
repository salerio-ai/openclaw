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

const platformKey =
  process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";

const normalizeBase = (input) => input.replace(/\/+$/, "");
const resolved = (updateBaseUrl ? `${normalizeBase(updateBaseUrl)}/${platformKey}/` : "");

if (!resolved) {
  console.error(
    "[resolve-publish-url] Missing BUSTLY_UPDATE_URL or BUSTLY_UPDATE_BASE_URL",
  );
  process.exit(1);
}

process.stdout.write(resolved);
