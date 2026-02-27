#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveUserPath(input, homeDir) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return resolve(trimmed.replace(/^~(?=$|[\\/])/, homeDir));
  }
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
  if (missing.length) {
    throw new Error(
      `Missing required Supabase configuration: ${missing.join(", ")}. ` +
        "Please login via Bustly OAuth in the desktop app, or set env vars.",
    );
  }
  return cfg;
}

function getRetryDelay(attempt) {
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
}

async function rpc(config, functionName, params = {}) {
  const url = `${config.supabaseUrl}/rest/v1/rpc/${functionName}`;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseToken}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = response.status >= 500 || response.status === 429;
        const err = new Error(`Supabase RPC error (${response.status}): ${errorText}`);
        err.retryable = retryable;
        if (retryable && attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt);
          await sleep(delay);
          continue;
        }
        throw err;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      const retryable = error?.name === "AbortError" || error?.retryable === true;
      if (retryable && attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("Unknown RPC error");
}

function formatTableInfo(tables) {
  if (!Array.isArray(tables) || tables.length === 0) return "No tables available.";
  const grouped = {};
  for (const table of tables) {
    const prefix = String(table.table_name || "").split(".")[0] || "other";
    grouped[prefix] ||= [];
    grouped[prefix].push(table);
  }

  let output = "\nAvailable Tables:\n\n";
  for (const [prefix, tableList] of Object.entries(grouped)) {
    output += `${prefix.toUpperCase()}\n`;
    for (const table of tableList) {
      const desc = table.description ? ` - ${table.description}` : "";
      output += `  - ${table.table_name}${desc}\n`;
    }
    output += "\n";
  }
  return output;
}

function formatColumnInfo(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return "No columns found.";
  return JSON.stringify(columns, null, 2);
}

function formatAsTable(data) {
  if (!Array.isArray(data) || data.length === 0) return "No data returned.";
  const keys = Object.keys(data[0]);
  const colWidths = Object.fromEntries(keys.map((k) => [k, k.length]));
  for (const row of data) {
    for (const key of keys) {
      const value = String(row[key] ?? "");
      colWidths[key] = Math.max(colWidths[key], value.length);
    }
  }

  let output = "";
  output += "|" + keys.map((k) => ` ${k.padEnd(colWidths[k])} `).join("|") + "|\n";
  output += "|" + keys.map((k) => "-".repeat(colWidths[k] + 2)).join("|") + "|\n";
  for (const row of data.slice(0, 50)) {
    output +=
      "|" + keys.map((k) => ` ${String(row[k] ?? "").padEnd(colWidths[k])} `).join("|") + "|\n";
  }
  if (data.length > 50) output += `... and ${data.length - 50} more rows\n`;
  return output;
}

function formatAsCSV(data) {
  if (!Array.isArray(data) || data.length === 0) return "";
  const keys = Object.keys(data[0]);
  const lines = [keys.join(",")];
  for (const row of data) {
    const values = keys.map((k) => {
      const v = String(row[k] ?? "");
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

function extractArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[arg.slice(2)] = true;
      } else {
        flags[arg.slice(2)] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printHelp() {
  console.log(`Usage:
  node skills/bustly-search-data/scripts/run.js <command> [args] [--format json|table|csv]

Commands:
  platforms
  get_tables
  get_schema <table_name>
  query "<sql>"
`);
}

async function main() {
  const config = loadConfig();
  const { flags, positional } = extractArgs(process.argv.slice(2));
  const command = positional[0];
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "platforms") {
    const tables = await rpc(config, "get_agent_available_tables");
    const names = tables
      .map((t) => t.table_name || "")
      .join("\n")
      .toLowerCase();
    const has = (s) => names.includes(s);
    const platforms = [];
    if (has("_shopify")) platforms.push({ name: "Shopify", type: "ecommerce" });
    if (has("_bigcommerce")) platforms.push({ name: "BigCommerce", type: "ecommerce" });
    if (has("_woocommerce")) platforms.push({ name: "WooCommerce", type: "ecommerce" });
    if (has("_magento")) platforms.push({ name: "Magento", type: "ecommerce" });
    if (has("_google") || has("ads_")) platforms.push({ name: "Google Ads", type: "advertising" });
    console.log(JSON.stringify({ totalPlatforms: platforms.length, platforms }, null, 2));
    return;
  }

  if (command === "get_tables") {
    const tables = await rpc(config, "get_agent_available_tables");
    console.log(formatTableInfo(tables));
    console.log(`Total: ${tables.length} tables`);
    return;
  }

  if (command === "get_schema") {
    const tableName = positional[1];
    if (!tableName) {
      throw new Error(
        "Usage: node skills/bustly-search-data/scripts/run.js get_schema <table_name>",
      );
    }
    const schema = await rpc(config, "get_agent_table_schema", { p_table_name: tableName });
    console.log(formatColumnInfo(schema));
    console.log(`Total: ${schema.length} columns`);
    return;
  }

  if (command === "query") {
    const query = positional[1];
    if (!query) {
      throw new Error(
        'Usage: node skills/bustly-search-data/scripts/run.js query "<sql_query>" [--format json|table|csv]',
      );
    }
    const normalized = query.trim().toUpperCase();
    if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
      throw new Error("Only SELECT queries (including WITH CTE) are allowed");
    }
    const data = await rpc(config, "run_select_ws", {
      p_query: query,
      p_workspace_id: config.workspaceId,
    });
    const format = String(flags.format || process.env.FORMAT || "json");
    if (format === "table") {
      console.log(formatAsTable(data));
    } else if (format === "csv") {
      console.log(formatAsCSV(data));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
