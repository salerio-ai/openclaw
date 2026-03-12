#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 800;
const REQUEST_TIMEOUT_MS = 45000;
const DEFAULT_CORE_OPS_FUNCTION = process.env.COMMERCE_CORE_OPS_FUNCTION || "commerce-core-ops";

const PLATFORM_ALIASES = {
  shopify: "shopify",
  bigcommerce: "bigcommerce",
  bc: "bigcommerce",
  woocommerce: "woocommerce",
  woo: "woocommerce",
  wc: "woocommerce",
  magento: "magento",
  adobe: "magento",
  "adobe-commerce": "magento",
};

const ENTITY_TABLES = {
  shopify: {
    shop_info: "semantic.dm_shop_info_shopify",
    products: "semantic.dm_products_shopify",
    variants: "semantic.dm_variants_shopify",
    inventory: "semantic.dm_variants_shopify",
    customers: "semantic.dm_customers_shopify",
    orders: "semantic.dm_orders_shopify",
    order_items: "semantic.dm_order_items_shopify",
  },
  bigcommerce: {
    shop_info: "semantic.dm_shop_info_bigcommerce",
    products: "semantic.dm_products_bigcommerce",
    variants: "semantic.dm_variants_bigcommerce",
    inventory: "semantic.dm_variants_bigcommerce",
    customers: "semantic.dm_customers_bigcommerce",
    orders: "semantic.dm_orders_bigcommerce",
    order_items: "semantic.dm_order_items_bigcommerce",
  },
  woocommerce: {
    shop_info: "semantic.dm_shop_info_woocommerce",
    products: "semantic.dm_products_woocommerce",
    variants: "semantic.dm_variants_woocommerce",
    inventory: "semantic.dm_variants_woocommerce",
    customers: "semantic.dm_customers_woocommerce",
    orders: "semantic.dm_orders_woocommerce",
    order_items: "semantic.dm_order_items_woocommerce",
  },
  magento: {
    shop_info: "semantic.dm_shop_info_magento",
    products: "semantic.dm_products_magento",
    variants: "semantic.dm_variants_magento",
    inventory: "semantic.dm_variants_magento",
    customers: "semantic.dm_customers_magento",
    orders: "semantic.dm_orders_magento",
    order_items: "semantic.dm_order_items_magento",
  },
};

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
    const search = raw?.bustlySearchData || {};
    const user = raw?.user || {};
    return {
      SEARCH_DATA_SUPABASE_URL: search.SEARCH_DATA_SUPABASE_URL || "",
      SEARCH_DATA_SUPABASE_ANON_KEY: search.SEARCH_DATA_SUPABASE_ANON_KEY || "",
      SEARCH_DATA_SUPABASE_ACCESS_TOKEN:
        user.userAccessToken ||
        search.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
        search.SEARCH_DATA_TOKEN ||
        "",
      SEARCH_DATA_WORKSPACE_ID: user.workspaceId || search.SEARCH_DATA_WORKSPACE_ID || "",
      SEARCH_DATA_USER_ID: user.userId || "",
      SEARCH_DATA_USER_EMAIL: user.userEmail || "",
    };
  } catch {
    return null;
  }
}

function loadConfig() {
  const oauth = loadBustlyOauthConfig();
  const config = {
    supabaseUrl:
      oauth?.SEARCH_DATA_SUPABASE_URL ||
      process.env.SEARCH_DATA_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "",
    supabaseAnonKey:
      oauth?.SEARCH_DATA_SUPABASE_ANON_KEY ||
      process.env.SEARCH_DATA_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "",
    supabaseToken:
      oauth?.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
      process.env.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
      process.env.SEARCH_DATA_TOKEN ||
      process.env.SUPABASE_TOKEN ||
      "",
    workspaceId:
      oauth?.SEARCH_DATA_WORKSPACE_ID ||
      process.env.SEARCH_DATA_WORKSPACE_ID ||
      process.env.WORKSPACE_ID ||
      "",
    userId:
      oauth?.SEARCH_DATA_USER_ID || process.env.SEARCH_DATA_USER_ID || process.env.USER_ID || "",
    userEmail:
      oauth?.SEARCH_DATA_USER_EMAIL ||
      process.env.SEARCH_DATA_USER_EMAIL ||
      process.env.USER_EMAIL ||
      "",
  };

  const missing = [];
  if (!config.supabaseUrl) missing.push("SEARCH_DATA_SUPABASE_URL");
  if (!config.supabaseAnonKey) missing.push("SEARCH_DATA_SUPABASE_ANON_KEY");
  if (!config.supabaseToken) missing.push("SEARCH_DATA_SUPABASE_ACCESS_TOKEN");
  if (missing.length) {
    throw new Error(
      `Missing required Supabase configuration: ${missing.join(", ")}. ` +
        "Please login via Bustly OAuth, or set env vars manually.",
    );
  }

  return config;
}

function extractArgs(argv) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    if (withoutPrefix.startsWith("no-")) {
      flags[withoutPrefix.slice(3)] = false;
      continue;
    }

    const eqIndex = withoutPrefix.indexOf("=");
    if (eqIndex !== -1) {
      const key = withoutPrefix.slice(0, eqIndex);
      const value = withoutPrefix.slice(eqIndex + 1);
      flags[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[withoutPrefix] = true;
      continue;
    }

    flags[withoutPrefix] = next;
    i += 1;
  }

  return { flags, positional };
}

function normalizePlatform(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  return PLATFORM_ALIASES[value] || "";
}

function normalizeEntity(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  if (["product", "products"].includes(value)) return "products";
  if (["variant", "variants"].includes(value)) return "variants";
  if (["inventory", "stock"].includes(value)) return "inventory";
  if (["customer", "customers"].includes(value)) return "customers";
  if (["order", "orders"].includes(value)) return "orders";
  if (["order_item", "order_items", "items", "line_items"].includes(value)) return "order_items";
  if (["shop", "shop_info", "store", "store_info"].includes(value)) return "shop_info";
  return "";
}

function parseJsonSafely(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid JSON for ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getJsonInput(flags, options = {}) {
  const inlineKey = options.inlineKey || "payload";
  const fileKey = options.fileKey || "payload-file";
  const defaultValue = options.defaultValue;

  if (typeof flags[inlineKey] === "string" && flags[inlineKey].trim()) {
    return parseJsonSafely(flags[inlineKey], `--${inlineKey}`);
  }

  if (typeof flags[fileKey] === "string" && flags[fileKey].trim()) {
    const path = flags[fileKey];
    if (!existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    }
    return parseJsonSafely(readFileSync(path, "utf-8"), `--${fileKey}`);
  }

  return defaultValue;
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function ensureIdentifier(value, label) {
  const normalized = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_\.]*$/.test(normalized)) {
    throw new Error(`${label} contains unsupported characters: ${value}`);
  }
  return normalized;
}

function decodeJwtPayload(token) {
  if (!token || token.split(".").length < 2) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function buildUrl(base, path) {
  return `${String(base).replace(/\/$/, "")}${path}`;
}

function functionUrl(config, slugOrUrl) {
  if (/^https?:\/\//i.test(String(slugOrUrl || ""))) {
    return String(slugOrUrl);
  }
  return buildUrl(config.supabaseUrl, `/functions/v1/${String(slugOrUrl || "").trim()}`);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function getRetryDelay(attempt) {
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
}

async function requestWithRetry(url, init = {}, options = {}) {
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const retries = options.retries ?? MAX_RETRIES;
  const retryStatuses = options.retryStatuses || [429, 500, 502, 503, 504];

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok && retryStatuses.includes(response.status) && attempt < retries) {
        await sleep(getRetryDelay(attempt));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      const retryable = error?.name === "AbortError";
      if (retryable && attempt < retries) {
        await sleep(getRetryDelay(attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("Request failed");
}

async function rpc(config, functionName, params = {}) {
  const url = buildUrl(config.supabaseUrl, `/rest/v1/rpc/${functionName}`);
  const response = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseToken}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase RPC error (${response.status}): ${text}`);
  }

  return response.json();
}

async function restSelect(config, table, options = {}) {
  const params = new URLSearchParams();
  params.set("select", options.select || "*");

  const filters = options.filters || {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  if (options.order) params.set("order", String(options.order));
  if (options.limit !== undefined && options.limit !== null)
    params.set("limit", String(options.limit));

  const url = buildUrl(config.supabaseUrl, `/rest/v1/${table}?${params.toString()}`);
  const response = await requestWithRetry(url, {
    method: "GET",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST error (${response.status}) for ${table}: ${text}`);
  }

  return response.json();
}

async function fetchAuthUser(config) {
  const url = buildUrl(config.supabaseUrl, "/auth/v1/user");
  const response = await requestWithRetry(url, {
    method: "GET",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`JWT validation failed (${response.status}): ${text}`);
  }

  return response.json();
}

function isActiveStatus(status) {
  if (status === undefined || status === null || status === "") return true;
  if (status === 1 || status === true) return true;
  const normalized = String(status).toUpperCase();
  return ["ACTIVE", "1", "TRUE", "ENABLED"].includes(normalized);
}

function parseTimestampMs(value) {
  if (value === undefined || value === null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function isActiveBillingWindow(window, nowMs) {
  if (!isActiveStatus(window?.status)) return false;
  const validFromMs = parseTimestampMs(window?.valid_from);
  const validToMs = parseTimestampMs(window?.valid_to);
  if (validFromMs === null || validToMs === null) return false;
  return validFromMs <= nowMs && validToMs > nowMs;
}

async function verifyWorkspaceMembership(config, workspaceId, userId) {
  const rows = await restSelect(config, "workspace_members", {
    select: "workspace_id,user_id,role,status",
    filters: {
      workspace_id: `eq.${workspaceId}`,
      user_id: `eq.${userId}`,
    },
    limit: 1,
  });

  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row) {
    throw new Error(`User ${userId} is not a member of workspace ${workspaceId}`);
  }
  if (!isActiveStatus(row.status)) {
    throw new Error(`User ${userId} is not ACTIVE in workspace ${workspaceId}`);
  }
  return row;
}

async function verifyWorkspaceIsActive(config, workspaceId) {
  const rows = await restSelect(config, "workspaces", {
    select: "id,name,status,owner_id",
    filters: {
      id: `eq.${workspaceId}`,
    },
    limit: 1,
  });

  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  if (!isActiveStatus(row.status)) {
    throw new Error(`Workspace ${workspaceId} is not ACTIVE`);
  }
  return row;
}

async function verifyWorkspaceSubscription(config, workspaceId) {
  const rows = await restSelect(config, "workspace_billing_windows", {
    select:
      "id,workspace_id,billing_policy_id,status,valid_from,valid_to,internal_budget_microusd,internal_used_microusd",
    filters: {
      workspace_id: `eq.${workspaceId}`,
    },
    order: "valid_to.desc",
    limit: 20,
  });

  const items = Array.isArray(rows) ? rows : [];
  if (items.length === 0) {
    throw new Error(`Workspace ${workspaceId} has no subscription window`);
  }

  const nowMs = Date.now();
  const active = items.find((row) => isActiveBillingWindow(row, nowMs));
  if (active) return active;

  const latest = items[0];
  const latestValidToMs = parseTimestampMs(latest?.valid_to);
  if (latestValidToMs !== null && latestValidToMs <= nowMs) {
    throw new Error(
      `Workspace ${workspaceId} subscription is expired (valid_to=${latest.valid_to})`,
    );
  }

  throw new Error(`Workspace ${workspaceId} subscription is not ACTIVE for current time window`);
}

async function ensureAuthContext(config, flags = {}, options = {}) {
  const workspaceId =
    String(flags["workspace-id"] || flags.workspace_id || config.workspaceId || "").trim() || "";
  if (!workspaceId) {
    throw new Error(
      "workspace_id is required. Set SEARCH_DATA_WORKSPACE_ID or pass --workspace-id.",
    );
  }

  if (flags["skip-auth-check"]) {
    return {
      workspaceId,
      userId: String(flags["user-id"] || config.userId || "").trim(),
      skipped: true,
      membership: null,
      workspace: null,
      subscription: null,
      authUser: null,
    };
  }

  const authUser = await fetchAuthUser(config);
  const tokenPayload = decodeJwtPayload(config.supabaseToken) || {};
  const tokenUserId = String(
    tokenPayload.sub || tokenPayload.user_id || tokenPayload.userId || "",
  ).trim();
  const authUserId = String(authUser?.id || "").trim();
  const configuredUserId = String(config.userId || "").trim();
  const flagUserId = String(flags["user-id"] || "").trim();

  if (!authUserId) {
    throw new Error("auth/v1/user did not return user id");
  }

  if (tokenUserId && tokenUserId !== authUserId) {
    throw new Error(`JWT subject mismatch: token sub=${tokenUserId}, auth user=${authUserId}`);
  }

  if (configuredUserId && configuredUserId !== authUserId) {
    throw new Error(
      `Configured userId mismatch: config=${configuredUserId}, auth user=${authUserId}`,
    );
  }

  if (flagUserId && flagUserId !== authUserId) {
    throw new Error(`--user-id mismatch: flag=${flagUserId}, auth user=${authUserId}`);
  }

  let membership = null;
  if (!flags["skip-membership-check"] && options.requireMembership !== false) {
    membership = await verifyWorkspaceMembership(config, workspaceId, authUserId);
  }

  let workspace = null;
  if (!flags["skip-workspace-status-check"] && options.requireWorkspaceStatus !== false) {
    workspace = await verifyWorkspaceIsActive(config, workspaceId);
  }

  let subscription = null;
  if (!flags["skip-subscription-check"] && options.requireSubscription !== false) {
    subscription = await verifyWorkspaceSubscription(config, workspaceId);
  }

  return {
    workspaceId,
    userId: authUserId,
    skipped: false,
    membership,
    workspace,
    subscription,
    authUser,
  };
}

async function callEdgeFunction(config, nameOrUrl, body, options = {}) {
  const url = functionUrl(config, nameOrUrl);
  const dryRun = options.dryRun === true;

  if (dryRun) {
    return {
      dry_run: true,
      function: nameOrUrl,
      url,
      body,
    };
  }

  const response = await requestWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.supabaseToken}`,
      apikey: config.supabaseAnonKey,
      "X-Workspace-Id": String(body.workspace_id || body.workspaceId || config.workspaceId || ""),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Edge function HTTP error (${response.status}) ${response.statusText}: ${text}`,
    );
  }

  const result = await response.json();
  if (result && typeof result === "object" && "error" in result && result.error) {
    throw new Error(String(result.error));
  }
  return result;
}

function formatAsTable(data) {
  if (!Array.isArray(data) || data.length === 0) return "No data returned.";
  const keys = Object.keys(data[0]);
  const colWidths = Object.fromEntries(keys.map((key) => [key, key.length]));

  for (const row of data) {
    for (const key of keys) {
      const value = String(row[key] ?? "");
      colWidths[key] = Math.max(colWidths[key], value.length);
    }
  }

  let output = "";
  output += "|" + keys.map((key) => ` ${key.padEnd(colWidths[key])} `).join("|") + "|\n";
  output += "|" + keys.map((key) => "-".repeat(colWidths[key] + 2)).join("|") + "|\n";

  for (const row of data.slice(0, 100)) {
    output +=
      "|" +
      keys.map((key) => ` ${String(row[key] ?? "").padEnd(colWidths[key])} `).join("|") +
      "|\n";
  }
  if (data.length > 100) {
    output += `... and ${data.length - 100} more rows\n`;
  }

  return output;
}

function formatAsCsv(data) {
  if (!Array.isArray(data) || data.length === 0) return "";
  const keys = Object.keys(data[0]);
  const lines = [keys.join(",")];

  for (const row of data) {
    const values = keys.map((key) => {
      const value = String(row[key] ?? "");
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function printData(data, format = "json") {
  const normalized = String(format || "json").toLowerCase();
  if (normalized === "table") {
    console.log(formatAsTable(asArray(data)));
    return;
  }
  if (normalized === "csv") {
    console.log(formatAsCsv(asArray(data)));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

function printHelp() {
  console.log(`Usage:
  node skills/commerce_core_ops/scripts/run.js <command> [args] [flags]

Read Commands:
  platforms
  connect:sources
  read:tables [--platform shopify|bigcommerce|woocommerce|magento|google_ads]
  read:schema <table_name>
  read:query "<sql>" [--format json|table|csv]
  read:entity --platform <platform> --entity <products|orders|customers|inventory|variants|shop_info|order_items> [--limit 50] [--since 2025-01-01]

Auth & Security:
  auth:check [--workspace-id <uuid>] [--skip-membership-check] [--skip-workspace-status-check] [--skip-subscription-check]

Write Commands:
  write:shopify "<graphql>" [--vars '{"k":"v"}'] [--vars-file ./vars.json] [--version YYYY-MM]
  write:shopify --file ./query.graphql [--vars-file ./vars.json]
  write:product --platform <platform> --op <operation> --payload '{...}' [--resource product] [--function commerce-core-ops]

Generic Edge Invocation:
  edge:invoke --function <function-name-or-url> --payload '{...}'

Common Flags:
  --workspace-id <uuid>
  --dry-run
  --skip-auth-check
  --skip-membership-check
  --skip-workspace-status-check
  --skip-subscription-check
`);
}

function validateReadSql(sql) {
  const normalized = String(sql || "")
    .trim()
    .toUpperCase();
  if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
    throw new Error("Only SELECT queries (including WITH CTE) are allowed");
  }
}

async function detectPlatformsFromTables(config) {
  const tables = await rpc(config, "get_agent_available_tables");
  const names = asArray(tables)
    .map((table) => String(table.table_name || ""))
    .join("\n")
    .toLowerCase();
  const has = (value) => names.includes(value);

  const detected = [];
  if (has("_shopify")) detected.push("shopify");
  if (has("_bigcommerce")) detected.push("bigcommerce");
  if (has("_woocommerce")) detected.push("woocommerce");
  if (has("_magento")) detected.push("magento");
  if (has("_google") || has("ads_")) detected.push("google_ads");

  return { detected, tables };
}

async function tryGetConnectedSources(config) {
  try {
    const rows = await rpc(config, "get_connect_source");
    return asArray(rows)
      .map((row) => String(row.connect_source || "").toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function handlePlatforms(config) {
  const { detected } = await detectPlatformsFromTables(config);
  const connected = await tryGetConnectedSources(config);
  const all = ["shopify", "bigcommerce", "woocommerce", "magento", "google_ads"];

  const platforms = all
    .filter((platform) => detected.includes(platform) || connected.includes(platform))
    .map((platform) => ({
      platform,
      detected_from_tables: detected.includes(platform),
      connected_source: connected.includes(platform),
    }));

  printData({
    workspace_id: config.workspaceId || null,
    total_platforms: platforms.length,
    platforms,
  });
}

async function handleConnectSources(config) {
  const connected = await tryGetConnectedSources(config);
  printData({
    workspace_id: config.workspaceId || null,
    connected_sources: connected,
  });
}

async function handleReadTables(config, flags) {
  const platform = String(flags.platform || "")
    .trim()
    .toLowerCase();
  const tables = await rpc(config, "get_agent_available_tables");
  let rows = asArray(tables);

  if (platform) {
    const normalized = normalizePlatform(platform) || platform;
    rows = rows.filter((row) =>
      String(row.table_name || "")
        .toLowerCase()
        .includes(`_${normalized}`),
    );
  }

  printData(
    {
      total: rows.length,
      tables: rows,
    },
    flags.format || "json",
  );
}

async function handleReadSchema(config, positional, flags) {
  const tableName = positional[1];
  if (!tableName) {
    throw new Error("Usage: read:schema <table_name>");
  }
  const schema = await rpc(config, "get_agent_table_schema", { p_table_name: tableName });
  printData(
    { table_name: tableName, total_columns: asArray(schema).length, schema },
    flags.format || "json",
  );
}

async function handleReadQuery(config, positional, flags) {
  const query = positional[1];
  if (!query) {
    throw new Error('Usage: read:query "<sql>" [--format json|table|csv]');
  }
  if (!config.workspaceId) {
    throw new Error("SEARCH_DATA_WORKSPACE_ID is required for read:query");
  }

  validateReadSql(query);
  const data = await rpc(config, "run_select_ws", {
    p_query: query,
    p_workspace_id: config.workspaceId,
  });
  printData(data, flags.format || "json");
}

async function resolveEntityTable(platform, entity) {
  const platformMap = ENTITY_TABLES[platform];
  if (!platformMap) return "";
  return platformMap[entity] || "";
}

function chooseDateColumn(columns) {
  const candidates = [
    "created_at",
    "updated_at",
    "order_date",
    "date_created",
    "occurred_at",
    "date",
  ];
  const set = new Set(columns.map((column) => String(column).toLowerCase()));
  return candidates.find((candidate) => set.has(candidate)) || "";
}

async function handleReadEntity(config, flags) {
  const platform = normalizePlatform(flags.platform);
  if (!platform) {
    throw new Error("--platform is required: shopify | bigcommerce | woocommerce | magento");
  }

  const entity = normalizeEntity(flags.entity);
  if (!entity) {
    throw new Error(
      "--entity is required: products | orders | customers | inventory | variants | shop_info | order_items",
    );
  }

  if (!config.workspaceId) {
    throw new Error("SEARCH_DATA_WORKSPACE_ID is required for read:entity");
  }

  const table = await resolveEntityTable(platform, entity);
  if (!table) {
    throw new Error(`Unsupported entity '${entity}' for platform '${platform}'`);
  }

  const schema = asArray(await rpc(config, "get_agent_table_schema", { p_table_name: table }));
  const columns = schema.map((column) => String(column.column_name || "")).filter(Boolean);
  if (columns.length === 0) {
    throw new Error(`Table schema not found: ${table}`);
  }

  const requestedColumns = String(flags.columns || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const selectedColumns =
    requestedColumns.length > 0
      ? requestedColumns.map((column) => {
          if (!columns.includes(column)) {
            throw new Error(`Unknown column '${column}' for table '${table}'`);
          }
          return ensureIdentifier(column, "column");
        })
      : ["*"];

  const limit = Math.max(1, Math.min(500, parseInteger(flags.limit, 50)));
  const since = String(flags.since || "").trim();
  const dateColumn = chooseDateColumn(columns);

  const where = [];
  if (since && dateColumn) {
    where.push(`${dateColumn} >= '${escapeSqlLiteral(since)}'`);
  }

  let sql = `SELECT ${selectedColumns.join(", ")} FROM ${table}`;
  if (where.length > 0) {
    sql += ` WHERE ${where.join(" AND ")}`;
  }
  if (dateColumn) {
    sql += ` ORDER BY ${dateColumn} DESC`;
  }
  sql += ` LIMIT ${limit}`;

  const rows = await rpc(config, "run_select_ws", {
    p_query: sql,
    p_workspace_id: config.workspaceId,
  });

  printData(
    {
      platform,
      entity,
      table,
      sql,
      count: asArray(rows).length,
      rows,
    },
    flags.format || "json",
  );
}

async function handleAuthCheck(config, flags) {
  const auth = await ensureAuthContext(config, flags, { requireMembership: true });
  const tokenPayload = decodeJwtPayload(config.supabaseToken) || null;

  printData({
    ok: true,
    workspace_id: auth.workspaceId,
    user_id: auth.userId,
    user_email: auth.authUser?.email || config.userEmail || null,
    membership: auth.membership,
    workspace: auth.workspace,
    subscription: auth.subscription,
    token_claims: tokenPayload,
    skipped: auth.skipped,
  });
}

function parseGraphqlInput(positional, flags) {
  if (flags.file) {
    const filePath = String(flags.file);
    if (!existsSync(filePath)) {
      throw new Error(`GraphQL file not found: ${filePath}`);
    }
    return readFileSync(filePath, "utf-8");
  }

  const inline = positional[1];
  if (!inline || !String(inline).trim()) {
    throw new Error("Missing GraphQL query. Provide inline query or use --file <path>.");
  }
  return String(inline);
}

function parseGraphqlVariables(flags) {
  if (typeof flags.vars === "string" && flags.vars.trim()) {
    return parseJsonSafely(flags.vars, "--vars");
  }
  if (typeof flags["vars-file"] === "string" && flags["vars-file"].trim()) {
    const filePath = String(flags["vars-file"]);
    if (!existsSync(filePath)) {
      throw new Error(`Variables file not found: ${filePath}`);
    }
    return parseJsonSafely(readFileSync(filePath, "utf-8"), "--vars-file");
  }
  return undefined;
}

async function handleWriteShopify(config, positional, flags) {
  const auth = await ensureAuthContext(config, flags, { requireMembership: true });
  const query = parseGraphqlInput(positional, flags);
  const variables = parseGraphqlVariables(flags);
  const body = {
    workspace_id: auth.workspaceId,
    query,
    ...(variables ? { variables } : {}),
    ...(flags.version ? { shopify_api_version: String(flags.version) } : {}),
  };

  const functionName = String(flags.function || "shopify-api");
  const result = await callEdgeFunction(config, functionName, body, {
    dryRun: flags["dry-run"] === true,
  });

  printData({
    platform: "shopify",
    function: functionName,
    result,
  });
}

function requireField(obj, key, message) {
  if (obj[key] === undefined || obj[key] === null || obj[key] === "") {
    throw new Error(message || `Missing required field: ${key}`);
  }
}

function buildShopifyProductMutation(op, payload) {
  const normalizedOp = String(op || "").toLowerCase();

  if (normalizedOp === "create") {
    const input = payload.input || payload;
    requireField(
      input,
      "title",
      "Shopify product create requires payload.title or payload.input.title",
    );
    return {
      query:
        "mutation ProductCreate($input: ProductInput!, $media: [CreateMediaInput!]) { productCreate(input: $input, media: $media) { product { id title handle status } userErrors { field message } } }",
      variables: {
        input,
        ...(payload.media ? { media: payload.media } : {}),
      },
    };
  }

  if (normalizedOp === "update") {
    const input = payload.input || payload;
    requireField(input, "id", "Shopify product update requires payload.id or payload.input.id");
    return {
      query:
        "mutation ProductUpdate($input: ProductInput!) { productUpdate(input: $input) { product { id title handle status } userErrors { field message } } }",
      variables: { input },
    };
  }

  if (normalizedOp === "delete") {
    const input = payload.input || { id: payload.id };
    requireField(input, "id", "Shopify product delete requires payload.id or payload.input.id");
    return {
      query:
        "mutation ProductDelete($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }",
      variables: { input },
    };
  }

  if (normalizedOp === "publish") {
    requireField(payload, "publicationId", "Shopify publish requires payload.publicationId");
    requireField(payload, "productIds", "Shopify publish requires payload.productIds[]");
    return {
      query:
        "mutation BulkPublishProducts($publicationId: ID!, $productIds: [ID!]!) { publishablePublish(id: $publicationId, input: { publishableIds: $productIds }) { publishable { id } userErrors { field message } } }",
      variables: {
        publicationId: payload.publicationId,
        productIds: payload.productIds,
      },
    };
  }

  if (normalizedOp === "unpublish") {
    requireField(payload, "publicationId", "Shopify unpublish requires payload.publicationId");
    requireField(payload, "productIds", "Shopify unpublish requires payload.productIds[]");
    return {
      query:
        "mutation BulkUnpublishProducts($publicationId: ID!, $productIds: [ID!]!) { publishableUnpublish(id: $publicationId, input: { publishableIds: $productIds }) { publishable { id } userErrors { field message } } }",
      variables: {
        publicationId: payload.publicationId,
        productIds: payload.productIds,
      },
    };
  }

  if (normalizedOp === "variants_bulk_update") {
    requireField(payload, "productId", "Shopify variants_bulk_update requires payload.productId");
    requireField(payload, "variants", "Shopify variants_bulk_update requires payload.variants[]");
    return {
      query:
        "mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { product { id title } productVariants { id sku price } userErrors { field message } } }",
      variables: {
        productId: payload.productId,
        variants: payload.variants,
      },
    };
  }

  if (normalizedOp === "inventory_adjust") {
    requireField(payload, "locationId", "Shopify inventory_adjust requires payload.locationId");
    requireField(payload, "changes", "Shopify inventory_adjust requires payload.changes[]");
    return {
      query:
        "mutation InventoryAdjust($input: InventoryAdjustQuantitiesInput!) { inventoryAdjustQuantities(input: $input) { userErrors { field message } } }",
      variables: {
        input: {
          reason: payload.reason || "correction",
          name: payload.name || "available",
          locationId: payload.locationId,
          changes: payload.changes,
        },
      },
    };
  }

  throw new Error(
    `Unsupported Shopify product operation '${op}'. Supported: create, update, delete, publish, unpublish, variants_bulk_update, inventory_adjust`,
  );
}

function buildCoreWritePayload(auth, platform, operation, resource, payload, flags) {
  return {
    action: "DIRECT_WRITE",
    platform,
    operation,
    resource,
    workspace_id: auth.workspaceId,
    workspaceId: auth.workspaceId,
    user_id: auth.userId,
    userId: auth.userId,
    ...(flags["request-id"] ? { request_id: String(flags["request-id"]) } : {}),
    ...(flags["idempotency-key"] ? { idempotency_key: String(flags["idempotency-key"]) } : {}),
    payload,
  };
}

async function handleWriteProduct(config, flags) {
  const platform = normalizePlatform(flags.platform);
  if (!platform) {
    throw new Error("--platform is required: shopify | bigcommerce | woocommerce | magento");
  }

  const op = String(flags.op || "").trim();
  if (!op) {
    throw new Error("--op is required");
  }

  const payload = getJsonInput(flags, { defaultValue: null });
  if (!payload || typeof payload !== "object") {
    throw new Error("--payload or --payload-file is required and must be a JSON object");
  }

  const auth = await ensureAuthContext(config, flags, { requireMembership: true });

  if (platform === "shopify") {
    const mutation = buildShopifyProductMutation(op, payload);
    const body = {
      workspace_id: auth.workspaceId,
      query: mutation.query,
      variables: mutation.variables,
    };
    const result = await callEdgeFunction(config, String(flags.function || "shopify-api"), body, {
      dryRun: flags["dry-run"] === true,
    });
    printData({ platform, op, via: "shopify-api", result });
    return;
  }

  const functionName = String(flags.function || DEFAULT_CORE_OPS_FUNCTION);
  const resource = String(flags.resource || "product");
  const body = buildCoreWritePayload(auth, platform, op, resource, payload, flags);

  const result = await callEdgeFunction(config, functionName, body, {
    dryRun: flags["dry-run"] === true,
  });

  printData({ platform, op, resource, via: functionName, result });
}

async function handleEdgeInvoke(config, flags) {
  const auth = await ensureAuthContext(config, flags, { requireMembership: true });
  const payload = getJsonInput(flags, { defaultValue: null });
  if (!payload || typeof payload !== "object") {
    throw new Error("edge:invoke requires --payload or --payload-file JSON object");
  }

  const functionName = String(flags.function || "").trim();
  if (!functionName) {
    throw new Error("edge:invoke requires --function");
  }

  const body = {
    workspace_id: payload.workspace_id || payload.workspaceId || auth.workspaceId,
    workspaceId: payload.workspaceId || payload.workspace_id || auth.workspaceId,
    user_id: payload.user_id || payload.userId || auth.userId,
    userId: payload.userId || payload.user_id || auth.userId,
    ...payload,
  };

  const result = await callEdgeFunction(config, functionName, body, {
    dryRun: flags["dry-run"] === true,
  });

  printData({
    function: functionName,
    payload: body,
    result,
  });
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
    await handlePlatforms(config);
    return;
  }

  if (command === "connect:sources") {
    await handleConnectSources(config);
    return;
  }

  if (command === "read:tables") {
    await handleReadTables(config, flags);
    return;
  }

  if (command === "read:schema") {
    await handleReadSchema(config, positional, flags);
    return;
  }

  if (command === "read:query") {
    await handleReadQuery(config, positional, flags);
    return;
  }

  if (command === "read:entity") {
    await handleReadEntity(config, flags);
    return;
  }

  if (command === "auth:check") {
    await handleAuthCheck(config, flags);
    return;
  }

  if (command === "write:shopify") {
    await handleWriteShopify(config, positional, flags);
    return;
  }

  if (command === "write:product") {
    await handleWriteProduct(config, flags);
    return;
  }

  if (command === "edge:invoke") {
    await handleEdgeInvoke(config, flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
