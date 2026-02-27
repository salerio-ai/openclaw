import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

type CliLogger = {
  info?: (message: string) => void;
  error?: (message: string) => void;
};

export type CliInvocation = {
  command: string;
  args: string[];
  isMjs: boolean;
  nodePath?: string;
};

function uniqueExistingPaths(candidates: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value || seen.has(value) || !existsSync(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizePlatform(value: string): "mac" | "windows" | "linux" | null {
  if (value === "darwin") {return "mac";}
  if (value === "win32") {return "windows";}
  if (value === "linux") {return "linux";}
  return null;
}

function normalizeArch(value: string): "arm64" | "x64" | null {
  if (value === "arm64") {return "arm64";}
  if (value === "x64") {return "x64";}
  return null;
}

function getOpenClawCliCandidates(): string[] {
  return [
    resolve(process.resourcesPath, "openclaw.mjs"),
    resolve(__dirname, "../../../openclaw.mjs"),
    resolve(__dirname, "../../../../openclaw.mjs"),
    resolve(__dirname, "../../../dist/cli.js"),
    resolve(__dirname, "../../dist/cli.js"),
  ];
}

export function resolveOpenClawCliPath(logger?: CliLogger): string | null {
  for (const candidate of getOpenClawCliCandidates()) {
    const exists = existsSync(candidate);
    logger?.info?.(`[CLI] check ${candidate} -> ${exists ? "found" : "missing"}`);
    if (exists) {
      logger?.info?.(`Found OpenClaw CLI at: ${candidate}`);
      return candidate;
    }
  }

  logger?.error?.("OpenClaw CLI not found in bundled locations");
  return null;
}

export function resolveNodeBinary(options?: { includeBundled?: boolean }): string | null {
  const bundledCandidates: string[] = [];
  const discoveredCandidates: Array<string | null> = [];

  if (options?.includeBundled ?? true) {
    const platform = normalizePlatform(process.platform);
    const arch = normalizeArch(process.arch);
    const binaryName = process.platform === "win32" ? "node.exe" : "node";
    const canonicalTarget = platform && arch ? `${platform}-${arch}` : null;
    const platformAliases =
      process.platform === "darwin"
        ? ["mac", "darwin"]
        : process.platform === "win32"
          ? ["windows", "win32"]
          : process.platform === "linux"
            ? ["linux"]
            : [];
    const targetCandidates = canonicalTarget
      ? [canonicalTarget, ...platformAliases.map((p) => `${p}-${arch}`)]
      : [];

    bundledCandidates.push(
      ...targetCandidates.flatMap((targetKey) => [
        resolve(process.resourcesPath, "node", targetKey, "bin", binaryName),
        resolve(process.resourcesPath, "node", targetKey, binaryName),
      ]),
      resolve(process.resourcesPath, "node", "bin", binaryName),
      resolve(process.resourcesPath, "node", "bin", "node"),
      resolve(process.resourcesPath, "node", "bin", "node.exe"),
      resolve(process.resourcesPath, "node", binaryName),
      resolve(process.resourcesPath, "node"),
    );
  }

  try {
    const which = spawnSync("/usr/bin/which", ["node"], { encoding: "utf-8" });
    discoveredCandidates.push(which.stdout?.trim() || null);
  } catch {
    // ignore
  }

  try {
    const shell = process.env.SHELL?.trim() || "/bin/zsh";
    const resolved = spawnSync(shell, ["-lc", "command -v node"], { encoding: "utf-8" });
    discoveredCandidates.push(resolved.stdout?.trim() || null);
  } catch {
    // ignore
  }

  const pathEnvCandidates = (process.env.PATH ?? "")
    .split(":")
    .map((dir) => dir.trim())
    .filter(Boolean)
    .map((dir) => resolve(dir, "node"));

  const commonCandidates = [
    "/opt/homebrew/bin/node",
    "/opt/homebrew/opt/node@22/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];

  const candidates = uniqueExistingPaths([
    ...bundledCandidates,
    ...discoveredCandidates,
    ...pathEnvCandidates,
    ...commonCandidates,
  ]);

  return candidates[0] ?? null;
}

export function resolveCliInvocation(
  cliPath: string,
  args: string[],
  options?: { includeBundledNode?: boolean },
): CliInvocation | null {
  const isMjs = cliPath.endsWith(".mjs");
  if (!isMjs) {
    return { command: cliPath, args, isMjs };
  }

  const nodePath = resolveNodeBinary({ includeBundled: options?.includeBundledNode ?? true });
  if (!nodePath) {
    return null;
  }

  return { command: nodePath, args: [cliPath, ...args], isMjs, nodePath };
}
