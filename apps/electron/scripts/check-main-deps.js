import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pkgPath = path.resolve(projectRoot, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const deps = new Set(Object.keys(pkg.dependencies ?? {}));

const filesToCheck = [
  path.resolve(projectRoot, "dist/main/index.js"),
  path.resolve(projectRoot, "../../dist/entry.js"),
  path.resolve(projectRoot, "../../dist/cli.js"),
].filter((filePath) => existsSync(filePath));

const specifiers = new Set();
const addSpecifier = (value) => {
  if (!value) return;
  if (value.startsWith(".") || value.startsWith("/")) return;
  if (value.startsWith("node:")) return;
  specifiers.add(value);
};

const importRegex = /\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const requireRegex = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

for (const filePath of filesToCheck) {
  const source = readFileSync(filePath, "utf-8");
  let match;
  while ((match = importRegex.exec(source))) addSpecifier(match[1]);
  while ((match = dynamicImportRegex.exec(source))) addSpecifier(match[1]);
  while ((match = requireRegex.exec(source))) addSpecifier(match[1]);
}

const externals = new Set(["electron"]);

const missing = new Set();
for (const spec of specifiers) {
  const base = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  if (externals.has(base)) continue;
  if (!deps.has(base)) missing.add(base);
}

if (missing.size > 0) {
  console.error("Missing runtime dependencies in apps/electron/package.json:");
  for (const dep of Array.from(missing).sort()) {
    console.error(`- ${dep}`);
  }
  process.exit(1);
}

console.log("OK: bundle dependencies are declared.");
