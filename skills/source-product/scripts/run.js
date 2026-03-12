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
    const user = raw?.user || {};
    const supabase = raw?.supabase || {};
    return {
      supabaseUrl: supabase.url || "",
      supabaseAnonKey: supabase.anonKey || "",
      supabaseToken: user.userAccessToken || "",
      workspaceId: user.workspaceId || "",
    };
  } catch {
    return null;
  }
}

function loadConfig() {
  const oauth = loadBustlyOauthConfig();
  const cfg = {
    supabaseUrl:
      oauth?.supabaseUrl ||
      process.env.SEARCH_DATA_SUPABASE_URL ||
      process.env.SUPABASE_URL,
    supabaseAnonKey:
      oauth?.supabaseAnonKey ||
      process.env.SEARCH_DATA_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY,
    supabaseToken:
      oauth?.supabaseToken ||
      process.env.SEARCH_DATA_SUPABASE_ACCESS_TOKEN ||
      process.env.SEARCH_DATA_TOKEN ||
      process.env.SUPABASE_TOKEN,
    workspaceId:
      oauth?.workspaceId ||
      process.env.SEARCH_DATA_WORKSPACE_ID ||
      process.env.WORKSPACE_ID,
  };

  const missing = [];
  if (!cfg.supabaseUrl) missing.push("supabase.url");
  if (!cfg.supabaseAnonKey) missing.push("supabase.anonKey");
  if (!cfg.supabaseToken) missing.push("user.userAccessToken");
  if (missing.length) {
    throw new Error(
      `Missing required Supabase configuration: ${missing.join(", ")}. ` +
        "Please login via Bustly OAuth in the desktop app, or set env vars.",
    );
  }
  return cfg;
}

function parseAliExpressProductId(url) {
  if (!url || !String(url).trim()) throw new Error("URL is required");
  const match = String(url).match(/\/item\/(\d+)(?:-\d+)?\.html/);
  if (!match || !match[1]) {
    throw new Error(
      "Could not parse product ID from URL. Expected format: " +
        "https://www.aliexpress.com/item/1234567890.html",
    );
  }
  return match[1];
}

async function callEdgeFunction(config, functionName, body) {
  const url = `${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.supabaseToken}`,
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify({
      ...body,
      workspace_id: config.workspaceId,
      access_token: config.supabaseToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function HTTP error: ${response.status} ${response.statusText}\n${text}`);
  }
  const result = await response.json();
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(result.error);
  }
  return result;
}

async function getAliExpressAccounts(config) {
  if (!config.workspaceId) {
    throw new Error("user.workspaceId is required for get:accounts");
  }
  const supabaseUrl = config.supabaseUrl.replace(/\/$/, "");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/workspace_aliexpress_mappings?workspace_id=eq.${config.workspaceId}&status=eq.1&select=*`,
    {
      method: "GET",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseToken}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to query workspace mappings: ${response.statusText}`);
  }
  const mappings = await response.json();
  if (!mappings || mappings.length === 0) {
    return {
      workspace_id: config.workspaceId,
      accounts: [],
      message: "No AliExpress accounts found for this workspace",
    };
  }
  return {
    workspace_id: config.workspaceId,
    mappings: mappings.map((m) => ({
      aliexpress_account_id: m.aliexpress_account_id,
      account_id: m.account_id,
      account_name: m.account_name,
      shop_name: m.shop_name,
      status: m.status,
    })),
  };
}

async function testAccessToken(config) {
  const supabaseUrl = config.supabaseUrl.replace(/\/$/, "");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.supabaseToken}`,
      apikey: config.supabaseAnonKey,
    },
  });
  if (!response.ok) {
    return {
      valid: false,
      message: `Access token invalid: ${response.status} ${response.statusText}`,
    };
  }
  const user = await response.json();
  return {
    valid: true,
    user_id: user.id,
    email: user.email,
    workspace_id: config.workspaceId,
    message: "Access token is valid.",
  };
}

function fileToBase64(filePath) {
  const imageBuffer = readFileSync(filePath);
  const base64 = imageBuffer.toString("base64");
  const ext = filePath.toLowerCase().split(".").pop();
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  };
  const mimeType = mimeTypes[ext || ""] || "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

function isUrl(input) {
  return String(input).startsWith("http://") || String(input).startsWith("https://");
}

function isFilePath(input) {
  return (
    !isUrl(input) &&
    !String(input).startsWith("--") &&
    (String(input).includes("/") || String(input).includes("\\"))
  );
}

function displayProducts(products) {
  products.forEach((product, index) => {
    console.log(`${index + 1}. ${product.title}`);
    console.log(
      `   Price: $${product.price.current}` +
        `${product.price.original !== product.price.current ? ` (was $${product.price.original})` : ""}`,
    );
    if (product.rating) console.log(`   Rating: ${product.rating}`);
    if (product.sales_volume) console.log(`   Sales: ${product.sales_volume}`);
    if (product.similarity_score !== undefined) {
      console.log(`   Similarity: ${(product.similarity_score * 100).toFixed(1)}%`);
    }
    console.log(`   Product URL: ${product.url}`);
    console.log(`   Image: ${product.image_url}`);
    console.log("");
  });
}

function displayRawProductInfo(result, showRawResponse) {
  console.log("=== AliExpress Product Raw Data ===\n");
  console.log(`Success: ${result.success}`);
  console.log(`Source: ${result.source}`);
  console.log(`Product ID: ${result.product_id}`);

  if (result.data) {
    const aeItem = result.data.ae_item_base_info_dto || {};
    const subject = aeItem.subject || "N/A";
    const detail = aeItem.detail || "N/A";
    console.log("\n=== Quick Reference ===");
    console.log(`Title: ${subject}`);

    const multimedia = result.data.ae_multimedia_info_dto || {};
    if (multimedia.image_urls) {
      const images = multimedia.image_urls.split(";").filter((url) => url.trim());
      console.log(`\nImages (${images.length}):`);
      images.slice(0, 5).forEach((url, index) => console.log(`  ${index + 1}. ${url}`));
      if (images.length > 5) console.log(`  ... and ${images.length - 5} more`);
    }

    if (detail && detail !== "N/A") {
      const preview = detail.length > 500 ? `${detail.substring(0, 500)}...` : detail;
      console.log(`\nDescription Preview:\n${preview}`);
    }

    const skuInfo = result.data.ae_item_sku_info_dtos;
    if (
      skuInfo &&
      skuInfo.ae_item_sku_info_d_t_o &&
      Array.isArray(skuInfo.ae_item_sku_info_d_t_o)
    ) {
      console.log(`\nSKU Variants: ${skuInfo.ae_item_sku_info_d_t_o.length}`);
    }

    console.log("\n=== Full Raw Data (JSON) ===");
    console.log(JSON.stringify(result.data, null, 2));
  }

  if (showRawResponse) {
    console.log("\n=== Complete API Response ===");
    console.log(JSON.stringify(result.raw_response, null, 2));
  }
}

function printHelp() {
  console.log(`Usage:
  node skills/source-product/scripts/run.js get:accounts
  node skills/source-product/scripts/run.js test:token
  node skills/source-product/scripts/run.js search:text "<query>" [--page <n>] [--pageSize <n>] [--sort <v>] [--category <id>] [--country <code>]
  node skills/source-product/scripts/run.js search:image "<image_url_or_path>" [--ship-to <code>] [--sort-type <v>] [--sort-order <v>] [--search-type <v>]
  node skills/source-product/scripts/run.js search:image --base64 "<base64>"
  node skills/source-product/scripts/run.js get:product --url "<url>" [--country <code>] [--currency <code>] [--language <code>] [--raw-response]
  node skills/source-product/scripts/run.js get:product --product-id "<id>" [--country <code>] [--currency <code>] [--language <code>] [--raw-response]
`);
}

async function runSearchText(config, args) {
  const query = args[0];
  if (!query)
    throw new Error('Usage: search:text "<query>" [--page <n>] [--pageSize <n>] [--sort <v>]');
  const params = {
    query,
    locale: "en_US",
    country_code: "US",
    category_id: "",
    sort_by: "orders,desc",
    page_size: 20,
    page_index: 1,
    currency: "USD",
  };
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) continue;
    if (key === "page") params.page_index = Number.parseInt(value, 10);
    if (key === "pageSize") params.page_size = Number.parseInt(value, 10);
    if (key === "sort") params.sort_by = value;
    if (key === "category") params.category_id = value;
    if (key === "country") params.country_code = value;
    i += 1;
  }
  const result = await callEdgeFunction(config, "aliexpress-text-search", params);
  const products = Array.isArray(result.products) ? result.products : [];
  if (products.length === 0) {
    console.log("No products found.");
    return;
  }
  console.log(`Found ${products.length} products:\n`);
  displayProducts(products);
}

async function runSearchImage(config, args) {
  if (args.length === 0) {
    throw new Error(
      'Usage: search:image "<image_url_or_path>" or search:image --base64 "<base64>"',
    );
  }
  const params = {
    ship_to: "US",
    sort_type: "orders",
    sort_order: "desc",
    currency: "USD",
    search_type: "similar",
  };
  let inputSet = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--base64") {
      const value = args[i + 1];
      if (!value) throw new Error("--base64 requires a value");
      params.image_base64 = value;
      inputSet = true;
      i += 1;
      continue;
    }
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (!value || value.startsWith("--")) continue;
      if (key === "ship-to") params.ship_to = value;
      if (key === "sort-type") params.sort_type = value;
      if (key === "sort-order") params.sort_order = value;
      if (key === "search-type") params.search_type = value;
      i += 1;
      continue;
    }
    if (!inputSet) {
      if (isUrl(arg)) params.image_url = arg;
      else if (isFilePath(arg)) params.image_base64 = fileToBase64(arg);
      else params.image_base64 = arg;
      inputSet = true;
    }
  }
  if (!params.image_url && !params.image_base64) {
    throw new Error("No image input provided. Use URL, file path, or --base64.");
  }
  const result = await callEdgeFunction(config, "aliexpress-image-search", params);
  const products = Array.isArray(result.products) ? result.products : [];
  if (products.length === 0) {
    console.log("No similar products found.");
    return;
  }
  console.log(`Found ${products.length} similar products:\n`);
  displayProducts(products);
}

async function runGetProduct(config, args) {
  const params = {
    ship_to_country: "US",
    target_currency: "USD",
    target_language: "en",
  };
  let showRawResponse = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--raw-response") {
      showRawResponse = true;
      continue;
    }
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) continue;
    if (key === "url") params.url = value;
    if (key === "product-id" || key === "productId") params.product_id = value;
    if (key === "country") params.ship_to_country = value;
    if (key === "currency") params.target_currency = value;
    if (key === "language") params.target_language = value;
    i += 1;
  }
  if (!params.url && !params.product_id) {
    throw new Error("Either --url or --product-id is required");
  }
  if (params.url && !params.product_id) {
    params.product_id = parseAliExpressProductId(params.url);
  }
  const result = await callEdgeFunction(config, "aliexpress-product-info", params);
  if (result && result.error) throw new Error(result.error);
  if (!result || result.success !== true) throw new Error("API request failed");
  displayRawProductInfo(result, showRawResponse);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  const config = loadConfig();
  if (command === "get:accounts") {
    console.log(JSON.stringify(await getAliExpressAccounts(config), null, 2));
    return;
  }
  if (command === "test:token") {
    console.log(JSON.stringify(await testAccessToken(config), null, 2));
    return;
  }
  if (command === "search:text") {
    await runSearchText(config, args.slice(1));
    return;
  }
  if (command === "search:image") {
    await runSearchImage(config, args.slice(1));
    return;
  }
  if (command === "get:product") {
    await runGetProduct(config, args.slice(1));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
