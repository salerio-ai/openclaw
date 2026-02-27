#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

function resolveUserPath(input, homeDir) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) return resolve(trimmed.replace(/^~(?=$|[\\/])/, homeDir));
  return resolve(trimmed);
}

function resolveStateDir() {
  const homeDir = homedir();
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) return resolveUserPath(override, homeDir);
  return resolve(homeDir, ".bustly");
}

function loadBustlyOauthConfig() {
  try {
    const configPath = resolve(resolveStateDir(), "bustlyOauth.json");
    if (!existsSync(configPath)) return null;
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const cfg = raw?.bustlySearchData;
    if (!cfg) return null;
    return {
      SEARCH_DATA_SUPABASE_URL: cfg.SEARCH_DATA_SUPABASE_URL || "",
      SEARCH_DATA_SUPABASE_ANON_KEY: cfg.SEARCH_DATA_SUPABASE_ANON_KEY || "",
      SEARCH_DATA_SUPABASE_ACCESS_TOKEN: cfg.SEARCH_DATA_SUPABASE_ACCESS_TOKEN || "",
      SEARCH_DATA_WORKSPACE_ID: cfg.SEARCH_DATA_WORKSPACE_ID || "",
    };
  } catch {
    return null;
  }
}

function loadConfig() {
  const oauth = loadBustlyOauthConfig();
  const cfg = {
    supabaseUrl:
      oauth?.SEARCH_DATA_SUPABASE_URL ||
      process.env.SEARCH_DATA_SUPABASE_URL ||
      process.env.SUPABASE_URL,
    supabaseAnonKey:
      oauth?.SEARCH_DATA_SUPABASE_ANON_KEY ||
      process.env.SEARCH_DATA_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY,
    supabaseToken:
      oauth?.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
      process.env.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
      process.env.SEARCH_DATA_TOKEN ||
      process.env.SUPABASE_TOKEN,
    workspaceId:
      oauth?.SEARCH_DATA_WORKSPACE_ID ||
      process.env.SEARCH_DATA_WORKSPACE_ID ||
      process.env.WORKSPACE_ID,
  };

  const missing = [];
  if (!cfg.supabaseUrl) missing.push("SEARCH_DATA_SUPABASE_URL");
  if (!cfg.supabaseAnonKey) missing.push("SEARCH_DATA_SUPABASE_ANON_KEY");
  if (!cfg.supabaseToken) missing.push("SEARCH_DATA_SUPABASE_ACCESS_TOKEN");
  if (!cfg.workspaceId) missing.push("SEARCH_DATA_WORKSPACE_ID");
  if (missing.length) {
    throw new Error(
      `Missing required configuration: ${missing.join(", ")}. ` +
        "Please login via Bustly OAuth in the desktop app, or set env vars.",
    );
  }
  return cfg;
}

function parseArgs(argv) {
  const out = { query: "", file: "", vars: "", varsFile: "", version: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") out.file = argv[i + 1] || "";
    else if (arg === "--vars") out.vars = argv[i + 1] || "";
    else if (arg === "--vars-file") out.varsFile = argv[i + 1] || "";
    else if (arg === "--version") out.version = argv[i + 1] || "";
    else if (!arg.startsWith("--") && !out.query) out.query = arg;

    if (["--file", "--vars", "--vars-file", "--version"].includes(arg)) i += 1;
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node skills/shopify-api/scripts/run.js "<graphql query>" [--vars '{"k":"v"}'] [--version YYYY-MM]
  node skills/shopify-api/scripts/run.js --file ./query.graphql [--vars-file ./vars.json]
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("help")) {
    printHelp();
    return;
  }

  const config = loadConfig();
  const parsed = parseArgs(args);
  const query = parsed.file ? readFileSync(parsed.file, "utf-8") : parsed.query;
  if (!query || !query.trim()) {
    throw new Error("Missing query. Provide inline query or use --file <path>.");
  }

  let variables;
  if (parsed.vars) {
    variables = JSON.parse(parsed.vars);
  } else if (parsed.varsFile) {
    variables = JSON.parse(readFileSync(parsed.varsFile, "utf-8"));
  }

  const url = `${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/shopify-api`;
  const body = {
    workspace_id: config.workspaceId,
    query,
    ...(variables ? { variables } : {}),
    ...(parsed.version ? { shopify_api_version: parsed.version } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.supabaseToken}`,
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function HTTP error: ${response.status} ${response.statusText}\n${text}`);
  }

  const result = await response.json();
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(result.error);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
