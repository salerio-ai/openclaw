import { existsSync } from "node:fs";
import path from "node:path";

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
  return null;
};

const hostPlatform = normalizePlatform(process.platform) ?? "mac";
const hostArch = normalizeArch(process.arch) ?? "arm64";
const targetPlatform = normalizePlatform(getArg("--platform")) ?? hostPlatform;
const targetArch = normalizeArch(getArg("--arch")) ?? hostArch;

const targetKey = `${targetPlatform}-${targetArch}`;
const nodeName = targetPlatform === "windows" ? "node.exe" : "node";
const destDir = path.resolve("resources/node", targetKey, "bin");
const destPath = path.join(destDir, nodeName);

if (existsSync(destPath)) {
  console.log(`Bundled node (${targetKey}) already present: ${destPath}`);
  process.exit(0);
}
throw new Error(
  `Bundled node missing for ${targetKey}: ${destPath}. Run "pnpm run fetch:node" first.`,
);
