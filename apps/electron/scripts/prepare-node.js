import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";

const envPath = process.env.OPENCLAW_NODE_PATH;
const resolvedEnvPath = envPath ? path.resolve(envPath) : null;
const nodePath = resolvedEnvPath || execFileSync("which", ["node"], { encoding: "utf8" }).trim();

if (!nodePath) {
  throw new Error("Failed to locate node binary. Set OPENCLAW_NODE_PATH.");
}

const sourcePath = realpathSync(nodePath);
if (!existsSync(sourcePath)) {
  throw new Error(`Node binary not found at ${sourcePath}`);
}

const destDir = path.resolve("resources/node/bin");
const destPath = path.join(destDir, "node");

mkdirSync(destDir, { recursive: true });
copyFileSync(sourcePath, destPath);
chmodSync(destPath, 0o755);

console.log(`Bundled node: ${sourcePath} -> ${destPath}`);
