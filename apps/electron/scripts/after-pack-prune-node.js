import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

function normalizeArchName(rawArch) {
  if (typeof rawArch === "string") {
    return rawArch.toLowerCase();
  }
  if (rawArch === 0) {return "ia32";}
  if (rawArch === 1) {return "x64";}
  if (rawArch === 2) {return "armv7l";}
  if (rawArch === 3) {return "arm64";}
  if (rawArch === 4) {return "universal";}
  return String(rawArch ?? "").toLowerCase();
}

function resolveExpectedNodeTargets(platform, archName) {
  if (platform === "darwin" || platform === "mac") {
    if (archName === "universal") {return ["mac-arm64", "mac-x64"];}
    if (archName === "arm64") {return ["mac-arm64"];}
    if (archName === "x64") {return ["mac-x64"];}
    return [];
  }
  if (platform === "win32" || platform === "windows") {
    if (archName === "arm64") {return ["windows-arm64"];}
    if (archName === "x64") {return ["windows-x64"];}
    return [];
  }
  if (platform === "linux") {
    if (archName === "arm64") {return ["linux-arm64"];}
    if (archName === "x64") {return ["linux-x64"];}
    return [];
  }
  return [];
}

function resolveResourcesDir(appOutDir, platform) {
  if (platform === "darwin" || platform === "mac") {
    // appOutDir is usually ".../Bustly.app" on mac, but keep fallbacks for other shapes.
    const directAppBundleResources = path.join(appOutDir, "Contents", "Resources");
    if (existsSync(directAppBundleResources)) {
      return directAppBundleResources;
    }
  }
  return path.join(appOutDir, "resources");
}

export default async function afterPack(context) {
  const platform = String(context?.electronPlatformName ?? "").toLowerCase();
  const archName = normalizeArchName(context?.arch);
  const appOutDir = context?.appOutDir ?? "";
  const productName = context?.packager?.appInfo?.productFilename ?? "app";
  const resourcesCandidates = [
    resolveResourcesDir(appOutDir, platform),
    path.join(appOutDir, `${productName}.app`, "Contents", "Resources"),
  ];
  const resourcesDir = resourcesCandidates.find((candidate) => existsSync(candidate)) ?? resourcesCandidates[0];
  const nodeRoot = path.join(resourcesDir, "node");

  console.log(
    `[afterPack:prune-node] platform=${platform} arch=${archName} appOutDir=${appOutDir} resourcesDir=${resourcesDir}`,
  );

  if (!existsSync(nodeRoot)) {
    console.log(`[afterPack:prune-node] node root missing, skip: ${nodeRoot}`);
    return;
  }

  const expectedTargets = resolveExpectedNodeTargets(platform, archName);
  if (expectedTargets.length === 0) {
    console.log(`[afterPack:prune-node] no expected targets for platform=${platform} arch=${archName}, skip`);
    return;
  }

  const expectedSet = new Set(expectedTargets);
  const entries = readdirSync(nodeRoot, { withFileTypes: true });

  for (const entry of entries) {
    const keep = entry.isDirectory() && expectedSet.has(entry.name);
    if (keep) {
      continue;
    }
    const fullPath = path.join(nodeRoot, entry.name);
    rmSync(fullPath, { recursive: true, force: true });
    console.log(`[afterPack:prune-node] removed ${fullPath}`);
  }

  console.log(
    `[afterPack:prune-node] done; kept targets=${Array.from(expectedSet).join(",")} under ${nodeRoot}`,
  );
}
