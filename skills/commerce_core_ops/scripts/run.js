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

const READ_ENTITIES = [
  "products",
  "orders",
  "customers",
  "inventory",
  "variants",
  "shop_info",
  "order_items",
];

const SUPPORTED_PLATFORMS = ["shopify", "bigcommerce", "woocommerce", "magento"];

const PLATFORM_MAPPING_TABLES = {
  shopify: "workspace_shopify_mappings",
  bigcommerce: "workspace_bigcommerce_mappings",
  woocommerce: "workspace_woocommerce_mappings",
  magento: "workspace_magento_mappings",
};

const COMMAND_ALIASES = {
  read: "read:entity",
  get: "read:entity",
  write: "write:product",
  put: "write:product",
  "write-native": "write:native",
  "native-write": "write:native",
  auth: "auth:check",
  providers: "platforms",
  connections: "connect:sources",
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
  const override = process.env.BUSTLY_STATE_DIR?.trim() || process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) return resolveUserPath(override, homeDir);
  return resolve(homeDir, ".bustly");
}

function loadBustlyOauthConfig() {
  try {
    const configPath = resolve(resolveStateDir(), "bustlyOauth.json");
    if (!existsSync(configPath)) return null;
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const user = raw?.user || {};
    const supabase = raw?.supabase || {};
    const legacy = raw?.bustlySearchData || {};

    return {
      // Primary: new bustlyOauth.json shape.
      // Fallback: legacy bustlySearchData for backward compatibility.
      BUSTLY_SUPABASE_URL: supabase.url || legacy.SEARCH_DATA_SUPABASE_URL || "",
      BUSTLY_SUPABASE_ANON_KEY: supabase.anonKey || legacy.SEARCH_DATA_SUPABASE_ANON_KEY || "",
      BUSTLY_SUPABASE_ACCESS_TOKEN:
        user.userAccessToken ||
        legacy.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
        legacy.SEARCH_DATA_TOKEN ||
        "",
      BUSTLY_WORKSPACE_ID: user.workspaceId || legacy.SEARCH_DATA_WORKSPACE_ID || "",
      BUSTLY_USER_ID: user.userId || "",
      BUSTLY_USER_EMAIL: user.userEmail || "",
    };
  } catch {
    return null;
  }
}

function loadConfig() {
  const oauth = loadBustlyOauthConfig();
  const config = {
    supabaseUrl:
      oauth?.BUSTLY_SUPABASE_URL ||
      process.env.BUSTLY_SUPABASE_URL ||
      process.env.SEARCH_DATA_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "",
    supabaseAnonKey:
      oauth?.BUSTLY_SUPABASE_ANON_KEY ||
      process.env.BUSTLY_SUPABASE_ANON_KEY ||
      process.env.SEARCH_DATA_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "",
    supabaseToken:
      oauth?.BUSTLY_SUPABASE_ACCESS_TOKEN ||
      process.env.BUSTLY_SUPABASE_ACCESS_TOKEN ||
      process.env.BUSTLY_TOKEN ||
      process.env.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
      process.env.SEARCH_DATA_TOKEN ||
      process.env.SUPABASE_TOKEN ||
      "",
    workspaceId:
      oauth?.BUSTLY_WORKSPACE_ID ||
      process.env.BUSTLY_WORKSPACE_ID ||
      process.env.SEARCH_DATA_WORKSPACE_ID ||
      process.env.WORKSPACE_ID ||
      "",
    userId:
      oauth?.BUSTLY_USER_ID ||
      process.env.BUSTLY_USER_ID ||
      process.env.SEARCH_DATA_USER_ID ||
      process.env.USER_ID ||
      "",
    userEmail:
      oauth?.BUSTLY_USER_EMAIL ||
      process.env.BUSTLY_USER_EMAIL ||
      process.env.SEARCH_DATA_USER_EMAIL ||
      process.env.USER_EMAIL ||
      "",
  };

  const missing = [];
  if (!config.supabaseUrl) missing.push("BUSTLY_SUPABASE_URL");
  if (!config.supabaseAnonKey) missing.push("BUSTLY_SUPABASE_ANON_KEY");
  if (!config.supabaseToken) missing.push("BUSTLY_SUPABASE_ACCESS_TOKEN");
  if (missing.length) {
    throw new Error(
      `Missing required Supabase configuration: ${missing.join(", ")}. ` +
        "Use Bustly OAuth state (~/.bustly/bustlyOauth.json) or set env vars manually.",
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
    throw new Error(
      `BILLING_WINDOW_MISSING: workspace ${workspaceId} has no billing window configured`,
    );
  }

  const nowMs = Date.now();
  const active = items.find((row) => isActiveBillingWindow(row, nowMs));
  if (active) return active;

  const latest = items[0];
  const latestValidToMs = parseTimestampMs(latest?.valid_to);
  if (latestValidToMs !== null && latestValidToMs <= nowMs) {
    throw new Error(
      `BILLING_WINDOW_EXPIRED: workspace ${workspaceId} billing window expired at ${latest.valid_to}`,
    );
  }

  throw new Error(
    `BILLING_WINDOW_INACTIVE: workspace ${workspaceId} has no ACTIVE billing window for current time`,
  );
}

function classifyError(message) {
  const text = String(message || "");
  const rules = [
    {
      code: "BILLING_WINDOW_MISSING",
      patterns: [
        /BILLING_WINDOW_MISSING/i,
        /no billing window configured/i,
        /no active billing window/i,
        /subscription window not found/i,
      ],
      summary: "Billing is not initialized for this workspace.",
      next_action:
        "Create an active workspace_billing_window for this workspace before running commerce reads/writes.",
      not_caused_by: "store connections",
    },
    {
      code: "BILLING_WINDOW_EXPIRED",
      patterns: [/BILLING_WINDOW_EXPIRED/i, /subscription is expired/i, /billing window expired/i],
      summary: "Workspace billing window is expired.",
      next_action: "Renew/extend the billing window, then retry.",
      not_caused_by: "store connections",
    },
    {
      code: "BILLING_WINDOW_INACTIVE",
      patterns: [
        /BILLING_WINDOW_INACTIVE/i,
        /subscription is not active/i,
        /no ACTIVE billing window/i,
      ],
      summary: "Workspace billing is present but not currently active.",
      next_action: "Set billing window status/time range to active and current, then retry.",
      not_caused_by: "store connections",
    },
    {
      code: "WORKSPACE_HEADER_MISSING",
      patterns: [/Missing X-Workspace-Id/i],
      summary: "Workspace header is missing.",
      next_action: "Populate workspace_id in bustly OAuth state and pass X-Workspace-Id.",
      not_caused_by: null,
    },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule;
    }
  }
  return null;
}

async function ensureAuthContext(config, flags = {}, options = {}) {
  const workspaceId =
    String(flags["workspace-id"] || flags.workspace_id || config.workspaceId || "").trim() || "";
  if (!workspaceId) {
    throw new Error(
      "workspace_id is required. Set BUSTLY_WORKSPACE_ID/SEARCH_DATA_WORKSPACE_ID or pass --workspace-id.",
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

Core Commands (agent-friendly aliases):
  providers                                      # alias: platforms
  connections                                    # alias: connect:sources
  auth                                           # alias: auth:check
  read --platform <platform> --entity <entity>  # alias: read:entity
  write --platform <platform> --op <op> --payload '{...}'  # alias: write:product

Read Commands:
  read:entity --platform <platform> --entity <${READ_ENTITIES.join("|")}> [--limit 50] [--since 2025-01-01] [--cursor <cursor>] [--filter '{"k":"v"}']
  read:entity <platform> <entity> [--limit 50] [--since 2025-01-01]
  all platforms route to /functions/v1/commerce-core-ops (DIRECT_READ)

Write Commands:
  write:product --platform <platform> --op <operation> --payload '{...}' [--resource product] [--function commerce-core-ops]
  all platforms route to /functions/v1/commerce-core-ops (DIRECT_WRITE)
  write:native --platform <platform> --method <METHOD> --path </api/path> [--payload '{...}'] [--query '{"k":"v"}'] [--headers '{"x":"y"}']
  native mode: pass-through to platform API with server-side auth/token injection

Generic Edge Invocation:
  edge:invoke --function <function-name-or-url> --payload '{...}'

Common Flags:
  --workspace-id <uuid>
  --dry-run
  --skip-auth-check
  --skip-membership-check
  --skip-workspace-status-check
  --skip-subscription-check

Preferred Env:
  BUSTLY_SUPABASE_URL
  BUSTLY_SUPABASE_ANON_KEY
  BUSTLY_SUPABASE_ACCESS_TOKEN
  BUSTLY_WORKSPACE_ID
  BUSTLY_USER_ID
`);
}

function normalizeCommand(input) {
  const normalized = String(input || "")
    .trim()
    .toLowerCase();
  return COMMAND_ALIASES[normalized] || normalized;
}

function parseFilterObject(flags) {
  const inline = flags.filter;
  if (typeof inline === "string" && inline.trim()) {
    const raw = inline.trim();
    if (raw.startsWith("{")) {
      const parsed = parseJsonSafely(raw, "--filter");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("--filter JSON must be an object");
      }
      return { ...parsed };
    }
    return { search: raw };
  }

  const file = flags["filter-file"];
  if (typeof file === "string" && file.trim()) {
    if (!existsSync(file)) {
      throw new Error(`Filter file not found: ${file}`);
    }
    const parsed = parseJsonSafely(readFileSync(file, "utf-8"), "--filter-file");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("--filter-file JSON must be an object");
    }
    return { ...parsed };
  }

  return {};
}

function parseReadTarget(positional, flags) {
  const platform = normalizePlatform(flags.platform || flags.provider || positional[1]);
  if (!platform) {
    throw new Error("--platform is required: shopify | bigcommerce | woocommerce | magento");
  }

  const entity = normalizeEntity(flags.entity || flags.resource || positional[2]);
  if (!entity) {
    throw new Error(`--entity is required: ${READ_ENTITIES.join(" | ")}`);
  }

  const limit = Math.max(1, Math.min(250, parseInteger(flags.limit, 50)));
  const since = String(flags.since || "").trim() || null;
  const cursor = String(flags.cursor || "").trim() || null;
  const fields = String(flags.fields || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const filters = parseFilterObject(flags);

  if (flags["order-id"]) filters.order_id = String(flags["order-id"]);
  if (flags["product-id"]) filters.product_id = String(flags["product-id"]);
  if (flags["variant-id"]) filters.variant_id = String(flags["variant-id"]);
  if (flags.id) filters.id = String(flags.id);
  if (flags.sku) filters.sku = String(flags.sku);

  return { platform, entity, limit, since, cursor, fields, filters };
}

async function safeWorkspaceRows(config, table, workspaceId) {
  try {
    return await restSelect(config, table, {
      select: "*",
      filters: {
        workspace_id: `eq.${workspaceId}`,
      },
      order: "updated_at.desc",
      limit: 20,
    });
  } catch {
    return [];
  }
}

async function getPlatformConnectionStatus(config, workspaceId, platform) {
  const table = PLATFORM_MAPPING_TABLES[platform];
  const rows = asArray(await safeWorkspaceRows(config, table, workspaceId));
  const active = rows.find((row) => isActiveStatus(row.status)) || null;
  const latest = rows[0] || null;

  if (platform === "shopify") {
    const hasToken = Boolean(active?.access_token || active?.shopify_shop_id || active?.shop_id);
    return {
      platform,
      table,
      connected: Boolean(active) && hasToken,
      mapping_status: active?.status ?? latest?.status ?? null,
      mapping_id: active?.id ?? latest?.id ?? null,
      details: {
        shop_domain: active?.shop_domain || active?.myshopify_domain || null,
      },
    };
  }

  const integrationRows = asArray(
    await safeWorkspaceRows(config, "workspace_integrations", workspaceId),
  );
  const activeIntegration =
    integrationRows.find((row) => {
      if (!isActiveStatus(row.status)) return false;
      const value = String(row.platform || "")
        .trim()
        .toLowerCase();
      if (platform === "magento") return value === "magento" || value === "adobe-commerce";
      return value === platform;
    }) || null;

  const connectionFromMapping = String(active?.nango_connection_id || "").trim();
  const connectionFromIntegration = String(activeIntegration?.nango_connection_id || "").trim();
  const nangoConnectionId = connectionFromMapping || connectionFromIntegration || null;

  return {
    platform,
    table,
    connected: (Boolean(active) || Boolean(activeIntegration)) && Boolean(nangoConnectionId),
    mapping_status: active?.status ?? latest?.status ?? null,
    mapping_id: active?.id ?? latest?.id ?? null,
    integration_id: active?.integration_id ?? activeIntegration?.id ?? null,
    nango_connection_id: nangoConnectionId,
  };
}

async function listConnectionStatuses(config, auth) {
  return Promise.all(
    SUPPORTED_PLATFORMS.map((platform) =>
      getPlatformConnectionStatus(config, auth.workspaceId, platform),
    ),
  );
}

async function handlePlatforms(config, flags) {
  const auth = await ensureAuthContext(config, flags, { requireMembership: true });
  const statuses = await listConnectionStatuses(config, auth);

  printData({
    workspace_id: auth.workspaceId,
    total_platforms: SUPPORTED_PLATFORMS.length,
    connected_platforms: statuses.filter((row) => row.connected).map((row) => row.platform),
    platforms: statuses,
  });
}

async function handleConnectSources(config, flags) {
  const auth = await ensureAuthContext(config, flags, { requireMembership: true });
  const statuses = await listConnectionStatuses(config, auth);

  printData({
    workspace_id: auth.workspaceId,
    connected_sources: statuses.filter((row) => row.connected).map((row) => row.platform),
    statuses,
  });
}

function buildCoreReadPayload(auth, platform, entity, options, flags) {
  return {
    action: "DIRECT_READ",
    platform,
    entity,
    workspace_id: auth.workspaceId,
    workspaceId: auth.workspaceId,
    user_id: auth.userId,
    userId: auth.userId,
    limit: options.limit,
    ...(options.since ? { since: options.since } : {}),
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(options.fields.length > 0 ? { fields: options.fields } : {}),
    ...(Object.keys(options.filters).length > 0 ? { filters: options.filters } : {}),
    ...(flags["request-id"] ? { request_id: String(flags["request-id"]) } : {}),
  };
}

async function handleReadEntity(config, positional, flags) {
  const auth = await ensureAuthContext(config, flags, { requireMembership: true });
  const options = parseReadTarget(positional, flags);

  const functionName = String(flags.function || DEFAULT_CORE_OPS_FUNCTION);
  const body = buildCoreReadPayload(auth, options.platform, options.entity, options, flags);
  const result = await callEdgeFunction(config, functionName, body, {
    dryRun: flags["dry-run"] === true,
  });

  printData(
    {
      platform: options.platform,
      entity: options.entity,
      via: functionName,
      result,
    },
    flags.format || "json",
  );
}

async function handleDeprecatedReadCommand(command) {
  throw new Error(
    `${command} has been removed from commerce_core_ops. ` +
      "Use direct platform reads with: read --platform <platform> --entity <entity>.",
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

async function handleWriteShopify(config, positional, flags) {
  void config;
  void positional;
  void flags;
  throw new Error(
    "write:shopify is deprecated in commerce_core_ops. Use write --platform shopify --op <operation> --payload '{...}' so all platforms share the same DIRECT_WRITE path.",
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

function parseJsonObjectFlag(flags, inlineKey, fileKey) {
  const value = getJsonInput(flags, {
    inlineKey,
    fileKey,
    defaultValue: null,
  });
  if (value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`--${inlineKey} / --${fileKey} must be a JSON object`);
  }
  return value;
}

async function handleWriteProduct(config, positional, flags) {
  const platform = normalizePlatform(flags.platform || flags.provider || positional[1]);
  if (!platform) {
    throw new Error("--platform is required: shopify | bigcommerce | woocommerce | magento");
  }

  const op = String(flags.op || positional[2] || "").trim();
  if (!op) {
    throw new Error("--op is required");
  }

  const payload = getJsonInput(flags, { defaultValue: null });
  if (!payload || typeof payload !== "object") {
    throw new Error("--payload or --payload-file is required and must be a JSON object");
  }
  if (flags.id && payload.id === undefined) payload.id = String(flags.id);
  if (flags["product-id"] && payload.product_id === undefined) {
    payload.product_id = String(flags["product-id"]);
  }
  if (flags["variant-id"] && payload.variant_id === undefined) {
    payload.variant_id = String(flags["variant-id"]);
  }

  const auth = await ensureAuthContext(config, flags, { requireMembership: true });

  const functionName = String(flags.function || DEFAULT_CORE_OPS_FUNCTION);
  const resource = String(flags.resource || "product");
  const body = buildCoreWritePayload(auth, platform, op, resource, payload, flags);

  const result = await callEdgeFunction(config, functionName, body, {
    dryRun: flags["dry-run"] === true,
  });

  printData({ platform, op, resource, via: functionName, result });
}

async function handleWriteNative(config, positional, flags) {
  const platform = normalizePlatform(flags.platform || flags.provider || positional[1]);
  if (!platform) {
    throw new Error("--platform is required: shopify | bigcommerce | woocommerce | magento");
  }

  const path = String(flags.path || flags.endpoint || positional[2] || "").trim();
  if (!path) {
    throw new Error("--path is required for write:native");
  }

  const method = String(flags.method || "POST")
    .trim()
    .toUpperCase();

  const payload = getJsonInput(flags, { defaultValue: {} });
  if (payload === null || payload === undefined) {
    throw new Error("--payload must be a JSON value when provided");
  }

  const query = parseJsonObjectFlag(flags, "query", "query-file");
  const headers = parseJsonObjectFlag(flags, "headers", "headers-file");

  const auth = await ensureAuthContext(config, flags, { requireMembership: true });
  const functionName = String(flags.function || DEFAULT_CORE_OPS_FUNCTION);

  const body = buildCoreWritePayload(auth, platform, "native", "native", {}, flags);
  body.native_request = {
    method,
    path,
    query,
    headers,
    body: payload,
  };

  const result = await callEdgeFunction(config, functionName, body, {
    dryRun: flags["dry-run"] === true,
  });

  printData({ platform, mode: "native", method, path, via: functionName, result });
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
  const { flags, positional } = extractArgs(process.argv.slice(2));
  const rawCommand = positional[0];

  if (!rawCommand || rawCommand === "help" || rawCommand === "--help") {
    printHelp();
    return;
  }

  const command = normalizeCommand(rawCommand);
  const config = loadConfig();

  if (command === "platforms") {
    await handlePlatforms(config, flags);
    return;
  }

  if (command === "connect:sources") {
    await handleConnectSources(config, flags);
    return;
  }

  if (command === "read:tables" || command === "read:schema" || command === "read:query") {
    await handleDeprecatedReadCommand(command);
    return;
  }

  if (command === "read:entity") {
    await handleReadEntity(config, positional, flags);
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
    await handleWriteProduct(config, positional, flags);
    return;
  }

  if (command === "write:native") {
    await handleWriteNative(config, positional, flags);
    return;
  }

  if (command === "edge:invoke") {
    await handleEdgeInvoke(config, flags);
    return;
  }

  throw new Error(`Unknown command: ${rawCommand} (normalized: ${command})`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const classified = classifyError(message);
  if (classified) {
    console.error(
      JSON.stringify(
        {
          error: message,
          code: classified.code,
          summary: classified.summary,
          next_action: classified.next_action,
          ...(classified.not_caused_by ? { not_caused_by: classified.not_caused_by } : {}),
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
});
