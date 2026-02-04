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
  const envPath = process.env.OPENCLAW_NODE_PATH?.trim();
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  if (options?.includeBundled ?? true) {
    const bundledCandidates = [
      resolve(process.resourcesPath, "node", "bin", "node"),
      resolve(process.resourcesPath, "node"),
    ];
    for (const candidate of bundledCandidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  try {
    const which = spawnSync("/usr/bin/which", ["node"], { encoding: "utf-8" });
    const path = which.stdout?.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // ignore
  }

  try {
    const shell = process.env.SHELL?.trim() || "/bin/zsh";
    const resolved = spawnSync(shell, ["-lc", "command -v node"], { encoding: "utf-8" });
    const path = resolved.stdout?.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // ignore
  }

  const commonCandidates = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];
  for (const candidate of commonCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
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
