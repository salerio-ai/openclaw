import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Separate from /functions/v1/skills/* proxy routes:
// this function is the secure direct-read/direct-write backend for commerce_core_ops.

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const NANGO_SECRET_KEY = requiredEnv("NANGO_SECRET_KEY");

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Platform = "shopify" | "bigcommerce" | "woocommerce" | "magento";
type Action = "DIRECT_WRITE" | "DIRECT_READ";
type NormalizedOperation =
  | "create"
  | "update"
  | "upsert"
  | "delete"
  | "inventory_adjust"
  | "publish"
  | "unpublish"
  | "variants_bulk_update"
  | "native";
type ReadEntity =
  | "products"
  | "orders"
  | "customers"
  | "inventory"
  | "variants"
  | "shop_info"
  | "order_items";

interface DirectWriteRequest {
  action: string;
  platform: string;
  operation: string;
  resource?: string;
  mode?: string;
  write_mode?: string;
  workspace_id?: string;
  workspaceId?: string;
  user_id?: string;
  userId?: string;
  request_id?: string;
  requestId?: string;
  idempotency_key?: string;
  idempotencyKey?: string;
  native_request?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

interface ParsedNativeRequest {
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  body: unknown;
}

interface DirectReadRequest {
  action: string;
  platform: string;
  entity: string;
  workspace_id?: string;
  workspaceId?: string;
  user_id?: string;
  userId?: string;
  request_id?: string;
  requestId?: string;
  limit?: number;
  since?: string;
  cursor?: string;
  filters?: Record<string, unknown>;
  fields?: string[];
}

interface ParsedRequest {
  platform: Platform;
  operation: NormalizedOperation;
  resource: "product" | "native";
  workspaceId: string;
  userId: string;
  requestId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  nativeRequest: ParsedNativeRequest | null;
}

interface ParsedReadRequest {
  platform: Platform;
  entity: ReadEntity;
  workspaceId: string;
  userId: string;
  requestId: string;
  limit: number;
  since: string;
  cursor: string;
  filters: Record<string, unknown>;
  fields: string[];
}

interface ConnectionContext {
  platform: Platform;
  workspaceId: string;
  integrationId: number | null;
  nangoConnectionId: string;
  shopifyShopId?: string;
  shopDomain?: string;
  shopAccessToken?: string;
  storeHash?: string;
  siteUrl?: string;
  siteId?: string;
  magentoBaseUrl?: string;
  magentoStoreId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const bearerToken = parseBearerToken(req.headers.get("authorization") || "");
    if (!bearerToken) {
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    const rawBody = (await req.json()) as DirectWriteRequest | DirectReadRequest;
    const action = normalizeAction(rawBody.action);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "DIRECT_WRITE") {
      const parsed = parseDirectWriteRequest(rawBody as DirectWriteRequest);
      const authUser = await verifyJwtUser(supabase, bearerToken);
      if (authUser.id !== parsed.userId) {
        return jsonResponse({ error: "user_id does not match JWT subject" }, 403);
      }

      await assertWorkspaceAccess(supabase, parsed.workspaceId, parsed.userId);
      const context = await resolveConnectionContext(supabase, parsed.platform, parsed.workspaceId);
      const result = await performProductWrite(context, parsed);

      return jsonResponse({
        success: true,
        action: "DIRECT_WRITE",
        platform: parsed.platform,
        resource: parsed.resource,
        operation: parsed.operation,
        workspace_id: parsed.workspaceId,
        user_id: parsed.userId,
        request_id: parsed.requestId,
        idempotency_key: parsed.idempotencyKey || null,
        result,
      });
    }

    const parsed = parseDirectReadRequest(rawBody as DirectReadRequest);
    const authUser = await verifyJwtUser(supabase, bearerToken);
    if (authUser.id !== parsed.userId) {
      return jsonResponse({ error: "user_id does not match JWT subject" }, 403);
    }

    await assertWorkspaceAccess(supabase, parsed.workspaceId, parsed.userId);
    const context = await resolveConnectionContext(supabase, parsed.platform, parsed.workspaceId);
    const result = await performDirectRead(context, parsed);

    return jsonResponse({
      success: true,
      action: "DIRECT_READ",
      platform: parsed.platform,
      entity: parsed.entity,
      workspace_id: parsed.workspaceId,
      user_id: parsed.userId,
      request_id: parsed.requestId,
      result,
    });
  } catch (error) {
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() || "";
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseBearerToken(authorizationHeader: string): string {
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) return "";
  return token;
}

function normalizeAction(value: unknown): Action {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "DIRECT_WRITE" || normalized === "DIRECT_READ") return normalized;
  throw new Error("action must be one of: DIRECT_READ, DIRECT_WRITE");
}

function parseDirectWriteRequest(input: DirectWriteRequest): ParsedRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Request body must be an object");
  }
  if (normalizeAction(input.action) !== "DIRECT_WRITE") {
    throw new Error("Only action=DIRECT_WRITE is supported");
  }

  const platform = normalizePlatform(input.platform);
  const payload = (input.payload || {}) as Record<string, unknown>;
  const nativeRequest = parseNativeWriteRequest(input, payload);
  const operation = nativeRequest ? "native" : normalizeOperation(input.operation);
  const resource = nativeRequest ? "native" : normalizeResource(input.resource);

  const workspaceId = pickString(input.workspace_id, input.workspaceId);
  const userId = pickString(input.user_id, input.userId);
  const requestId = pickString(input.request_id, input.requestId, crypto.randomUUID());
  const idempotencyKey = pickString(input.idempotency_key, input.idempotencyKey, "");

  if (!workspaceId) throw new Error("workspace_id is required");
  if (!userId) throw new Error("user_id is required");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("payload must be a JSON object");
  }

  return {
    platform,
    operation,
    resource,
    workspaceId,
    userId,
    requestId,
    idempotencyKey,
    payload,
    nativeRequest,
  };
}

function parseDirectReadRequest(input: DirectReadRequest): ParsedReadRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Request body must be an object");
  }
  if (normalizeAction(input.action) !== "DIRECT_READ") {
    throw new Error("Only action=DIRECT_READ is supported");
  }

  const platform = normalizePlatform(input.platform);
  const entity = normalizeReadEntity(input.entity);
  const workspaceId = pickString(input.workspace_id, input.workspaceId);
  const userId = pickString(input.user_id, input.userId);
  const requestId = pickString(input.request_id, input.requestId, crypto.randomUUID());
  const limit = parseIntegerInRange(input.limit, 50, 1, 250);
  const since = pickString(input.since);
  const cursor = pickString(input.cursor);
  const filters = normalizeObject(input.filters);
  const fields = normalizeStringArray(input.fields);

  if (!workspaceId) throw new Error("workspace_id is required");
  if (!userId) throw new Error("user_id is required");

  return {
    platform,
    entity,
    workspaceId,
    userId,
    requestId,
    limit,
    since,
    cursor,
    filters,
    fields,
  };
}

function normalizePlatform(value: unknown): Platform {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "shopify" ||
    normalized === "bigcommerce" ||
    normalized === "woocommerce" ||
    normalized === "magento"
  ) {
    return normalized;
  }
  throw new Error("platform must be one of: shopify, bigcommerce, woocommerce, magento");
}

function normalizeOperation(value: unknown): NormalizedOperation {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) throw new Error("operation is required");

  if (normalized === "create" || normalized === "insert" || normalized === "import")
    return "create";
  if (normalized === "update" || normalized === "patch") return "update";
  if (normalized === "upsert") return "upsert";
  if (normalized === "delete" || normalized === "remove") return "delete";
  if (
    normalized === "inventory_adjust" ||
    normalized === "inventory" ||
    normalized === "stock_adjust"
  ) {
    return "inventory_adjust";
  }
  if (normalized === "publish") return "publish";
  if (normalized === "unpublish") return "unpublish";
  if (normalized === "variants_bulk_update" || normalized === "variant_bulk_update") {
    return "variants_bulk_update";
  }
  if (
    normalized === "native" ||
    normalized === "raw" ||
    normalized === "proxy" ||
    normalized === "passthrough"
  ) {
    return "native";
  }

  throw new Error(
    "operation must be one of: create, update, upsert, delete, inventory_adjust, publish, unpublish, variants_bulk_update, native",
  );
}

function normalizeReadEntity(value: unknown): ReadEntity {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "products" || normalized === "product") return "products";
  if (normalized === "orders" || normalized === "order") return "orders";
  if (normalized === "customers" || normalized === "customer") return "customers";
  if (normalized === "inventory" || normalized === "stock") return "inventory";
  if (normalized === "variants" || normalized === "variant") return "variants";
  if (normalized === "shop_info" || normalized === "shop" || normalized === "store")
    return "shop_info";
  if (normalized === "order_items" || normalized === "order_item" || normalized === "line_items") {
    return "order_items";
  }
  throw new Error(
    "entity must be one of: products, orders, customers, inventory, variants, shop_info, order_items",
  );
}

function normalizeResource(value: unknown): "product" {
  const normalized = String(value || "product")
    .trim()
    .toLowerCase();
  if (normalized === "product" || normalized === "products") return "product";
  throw new Error("Only resource=product is supported");
}

function normalizeWriteMode(value: unknown): "native" | "" {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "native" ||
    normalized === "raw" ||
    normalized === "proxy" ||
    normalized === "passthrough" ||
    normalized === "pass_through"
  ) {
    return "native";
  }
  return "";
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("filters must be a JSON object");
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeHeaderMap(value: unknown): Record<string, string> {
  const source = asObject(value);
  if (!source) return {};
  const restricted = new Set([
    "authorization",
    "x-shopify-access-token",
    "x-auth-token",
    "provider-config-key",
    "connection-id",
  ]);
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;
    if (restricted.has(key.toLowerCase())) continue;
    if (rawValue === null || rawValue === undefined) continue;
    out[key] = String(rawValue);
  }
  return out;
}

function parseNativeWriteRequest(
  input: DirectWriteRequest,
  payload: Record<string, unknown>,
): ParsedNativeRequest | null {
  const directNative = asObject(input.native_request);
  const payloadNative = asObject(payload.native_request);
  const writeMode = normalizeWriteMode(
    pickString(input.write_mode, input.mode, payload.write_mode, payload.mode),
  );
  const op = normalizeWriteMode(input.operation);
  const useNative =
    Boolean(directNative || payloadNative) || writeMode === "native" || op === "native";
  if (!useNative) return null;

  const source = directNative || payloadNative || payload;
  const method = String(source.method || source.http_method || "POST")
    .trim()
    .toUpperCase();
  const path = pickString(source.path, source.endpoint);

  if (!path) throw new Error("native_request.path is required");
  if (/^https?:\/\//i.test(path)) {
    throw new Error("native_request.path must be a relative API path (not full URL)");
  }

  return {
    method,
    path: path.startsWith("/") ? path : `/${path}`,
    query: normalizeObject(source.query),
    headers: normalizeHeaderMap(source.headers),
    body: source.body ?? source.payload ?? source.data ?? null,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter((item) => item.length > 0);
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "bigint") return value.toString();
  }
  return "";
}

function parseIntegerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function isActiveStatus(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number") return value === 1;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toUpperCase();
  return (
    normalized === "ACTIVE" ||
    normalized === "ENABLED" ||
    normalized === "1" ||
    normalized === "TRUE"
  );
}

function parseTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isActiveBillingWindow(window: Record<string, unknown>, nowMs: number): boolean {
  if (!isActiveStatus(window.status)) return false;
  const validFromMs = parseTimestampMs(window.valid_from);
  const validToMs = parseTimestampMs(window.valid_to);
  if (validFromMs === null || validToMs === null) return false;
  return validFromMs <= nowMs && validToMs > nowMs;
}

async function verifyJwtUser(supabase: SupabaseClient, jwt: string) {
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user?.id) {
    throw new Error(`JWT validation failed: ${error?.message || "missing user id"}`);
  }
  return data.user;
}

async function assertWorkspaceAccess(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await assertWorkspaceMembership(supabase, workspaceId, userId);
  await assertWorkspaceIsActive(supabase, workspaceId);
  await assertWorkspaceSubscriptionActive(supabase, workspaceId);
}

async function assertWorkspaceMembership(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,user_id,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(20);

  if (error) {
    throw new Error(`workspace_members query failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const active = rows.find((row) => isActiveStatus(row.status));
  if (!active) {
    throw new Error("user is not an active member of this workspace");
  }
}

async function assertWorkspaceIsActive(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id,status")
    .eq("id", workspaceId)
    .limit(1);

  if (error) {
    throw new Error(`workspaces query failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    throw new Error("workspace not found");
  }

  const workspace = rows[0] as Record<string, unknown>;
  if (!isActiveStatus(workspace.status)) {
    throw new Error("workspace is not active");
  }
}

async function assertWorkspaceSubscriptionActive(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("workspace_billing_windows")
    .select("id,status,valid_from,valid_to")
    .eq("workspace_id", workspaceId)
    .order("valid_to", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`workspace_billing_windows query failed: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  if (rows.length === 0) {
    throw new Error("workspace subscription window not found");
  }

  const nowMs = Date.now();
  const activeWindow = rows.find((row) => isActiveBillingWindow(row, nowMs));
  if (activeWindow) return;

  const latestWindow = rows[0];
  const latestValidToMs = parseTimestampMs(latestWindow.valid_to);
  if (latestValidToMs !== null && latestValidToMs <= nowMs) {
    throw new Error("workspace subscription is expired");
  }

  throw new Error("workspace subscription is not active");
}

async function resolveConnectionContext(
  supabase: SupabaseClient,
  platform: Platform,
  workspaceId: string,
): Promise<ConnectionContext> {
  if (platform === "shopify") {
    return resolveShopifyContext(supabase, workspaceId);
  }
  if (platform === "bigcommerce") {
    return resolveBigCommerceContext(supabase, workspaceId);
  }
  if (platform === "woocommerce") {
    return resolveWooCommerceContext(supabase, workspaceId);
  }
  return resolveMagentoContext(supabase, workspaceId);
}

function isShopifyShopActive(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number") return value === 1;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === "active" ||
    normalized === "enabled" ||
    normalized === "1" ||
    normalized === "true"
  );
}

async function resolveShopifyContext(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ConnectionContext> {
  const mapping = await fetchActiveMapping(supabase, "workspace_shopify_mappings", workspaceId);
  const shopifyShopId = pickString(mapping.shopify_shop_id, mapping.shop_id);
  if (!shopifyShopId) {
    throw new Error("workspace_shopify_mappings.shopify_shop_id is missing");
  }

  const integrationId = parseNumber(mapping.integration_id);
  const shop = await fetchShopifyShopById(supabase, shopifyShopId);
  if (!isShopifyShopActive(shop.status)) {
    throw new Error("shopify shop is not active");
  }

  const shopDomain = pickString(shop.shop_domain);
  const shopAccessToken = pickString(shop.access_token);
  if (!shopDomain || !shopAccessToken) {
    throw new Error("Invalid Shopify credentials: shop_domain/access_token missing");
  }

  return {
    platform: "shopify",
    workspaceId,
    integrationId,
    nangoConnectionId: "",
    shopifyShopId,
    shopDomain,
    shopAccessToken,
  };
}

async function resolveBigCommerceContext(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ConnectionContext> {
  const mapping = await fetchActiveMapping(supabase, "workspace_bigcommerce_mappings", workspaceId);
  const storeHash = pickString(mapping.store_hash);
  if (!storeHash) {
    throw new Error("workspace_bigcommerce_mappings.store_hash is missing");
  }

  const integrationId = parseNumber(mapping.integration_id);
  const nangoConnectionId = await resolveNangoConnectionId(
    supabase,
    workspaceId,
    "bigcommerce",
    mapping,
    integrationId,
  );

  return {
    platform: "bigcommerce",
    workspaceId,
    integrationId,
    nangoConnectionId,
    storeHash,
  };
}

async function resolveWooCommerceContext(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ConnectionContext> {
  const mapping = await fetchActiveMapping(supabase, "workspace_woocommerce_mappings", workspaceId);
  const siteUrl = pickString(mapping.site_url, mapping.store_url);
  const siteId = pickString(mapping.site_id);

  if (!siteUrl) {
    throw new Error("workspace_woocommerce_mappings.site_url is missing");
  }

  const integrationId = parseNumber(mapping.integration_id);
  const nangoConnectionId = await resolveNangoConnectionId(
    supabase,
    workspaceId,
    "woocommerce",
    mapping,
    integrationId,
  );

  return {
    platform: "woocommerce",
    workspaceId,
    integrationId,
    nangoConnectionId,
    siteUrl,
    siteId,
  };
}

async function resolveMagentoContext(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ConnectionContext> {
  const mapping = await fetchActiveMappingOptional(
    supabase,
    "workspace_magento_mappings",
    workspaceId,
  );
  const activeIntegration = await fetchActiveIntegrationByPlatform(
    supabase,
    workspaceId,
    "magento",
  );
  const integrationId = parseNumber(mapping?.integration_id) ?? parseNumber(activeIntegration?.id);
  const mappingRecord = (mapping || {}) as Record<string, unknown>;

  const nangoConnectionId = await resolveNangoConnectionId(
    supabase,
    workspaceId,
    "magento",
    mappingRecord,
    integrationId,
  );

  let magentoBaseUrl = pickString(
    mappingRecord.base_url,
    mappingRecord.site_url,
    mappingRecord.store_url,
  );
  let magentoStoreId = pickString(mappingRecord.store_id);

  const magentoAccountId = pickString(
    mappingRecord.magento_account_id,
    activeIntegration?.platform_account_id,
  );
  if ((!magentoBaseUrl || !magentoStoreId) && magentoAccountId) {
    try {
      const account = await fetchMagentoAccount(supabase, magentoAccountId);
      magentoBaseUrl =
        magentoBaseUrl || pickString(account.base_url, account.site_url, account.store_url);
      magentoStoreId = magentoStoreId || pickString(account.store_id, account.site_id);
    } catch {
      // keep resolving from mapping/integration only
    }
  }

  if (!magentoBaseUrl) {
    throw new Error("Unable to resolve Magento base URL from mapping/integration/account");
  }

  return {
    platform: "magento",
    workspaceId,
    integrationId,
    nangoConnectionId,
    magentoBaseUrl,
    magentoStoreId,
  };
}

async function fetchActiveMapping(
  supabase: SupabaseClient,
  tableName: string,
  workspaceId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`${tableName} query failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    throw new Error(`No mapping found in ${tableName} for workspace`);
  }

  const active = rows.find((row) => isActiveStatus(row.status));
  if (!active) {
    throw new Error(`No active mapping found in ${tableName}`);
  }
  return active as Record<string, unknown>;
}

async function fetchActiveMappingOptional(
  supabase: SupabaseClient,
  tableName: string,
  workspaceId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`${tableName} query failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const active = rows.find((row) => isActiveStatus(row.status));
  return (active as Record<string, unknown>) || null;
}

async function fetchMagentoAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("magento_accounts")
    .select("*")
    .eq("id", accountId)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`magento_accounts lookup failed: ${error?.message || "not found"}`);
  }
  return data as Record<string, unknown>;
}

async function fetchShopifyShopById(
  supabase: SupabaseClient,
  shopifyShopId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("shopify_shops")
    .select("*")
    .eq("id", shopifyShopId)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`shopify_shops lookup failed: ${error?.message || "not found"}`);
  }
  return data as Record<string, unknown>;
}

async function resolveNangoConnectionId(
  supabase: SupabaseClient,
  workspaceId: string,
  platform: Platform,
  mapping: Record<string, unknown>,
  integrationId: number | null,
): Promise<string> {
  const direct = pickString(mapping.nango_connection_id);
  if (direct) return direct;

  if (integrationId !== null) {
    const byId = await fetchIntegrationById(supabase, workspaceId, integrationId);
    if (byId && isActiveStatus(byId.status)) {
      const connection = pickString(byId.nango_connection_id);
      if (connection) return connection;
    }
  }

  const byPlatform = await fetchActiveIntegrationByPlatform(supabase, workspaceId, platform);
  const connection = byPlatform ? pickString(byPlatform.nango_connection_id) : "";
  if (connection) return connection;

  throw new Error("Unable to resolve nango_connection_id from mapping/integration");
}

async function fetchIntegrationById(
  supabase: SupabaseClient,
  workspaceId: string,
  integrationId: number,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("workspace_integrations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", integrationId)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as Record<string, unknown>;
}

async function fetchActiveIntegrationByPlatform(
  supabase: SupabaseClient,
  workspaceId: string,
  platform: Platform,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("workspace_integrations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`workspace_integrations query failed: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const filtered = rows.filter((row) => {
    if (!isActiveStatus(row.status)) return false;
    const value = String(row.platform || "")
      .trim()
      .toLowerCase();
    if (!value) return false;
    if (platform === "magento") return value === "magento" || value === "adobe-commerce";
    return value === platform;
  });

  return filtered[0] || null;
}

async function performProductWrite(
  context: ConnectionContext,
  request: ParsedRequest,
): Promise<Record<string, unknown>> {
  if (request.nativeRequest) {
    return performNativeWrite(context, request.nativeRequest);
  }
  if (context.platform === "shopify") {
    return writeShopifyProduct(context, request.operation, request.payload);
  }
  if (context.platform === "bigcommerce") {
    return writeBigCommerceProduct(context, request.operation, request.payload);
  }
  if (context.platform === "woocommerce") {
    return writeWooCommerceProduct(context, request.operation, request.payload);
  }
  return writeMagentoProduct(context, request.operation, request.payload);
}

function buildPathWithQuery(path: string, query: Record<string, unknown>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const qs = buildQueryString(query);
  if (!qs) return normalizedPath;
  if (normalizedPath.includes("?")) {
    return `${normalizedPath}&${qs.slice(1)}`;
  }
  return `${normalizedPath}${qs}`;
}

async function performNativeWrite(
  context: ConnectionContext,
  nativeRequest: ParsedNativeRequest,
): Promise<Record<string, unknown>> {
  const method = nativeRequest.method;
  const pathWithQuery = buildPathWithQuery(nativeRequest.path, nativeRequest.query);

  if (context.platform === "shopify") {
    const response = await callShopifyRestApi(
      context,
      method,
      normalizeShopifyNativePath(pathWithQuery, nativeRequest.body),
      nativeRequest.body,
      nativeRequest.headers,
    );
    return {
      provider: "shopify",
      mode: "native",
      method,
      path: pathWithQuery,
      response,
    };
  }

  if (context.platform === "bigcommerce") {
    const storeHash = context.storeHash || "";
    if (!storeHash) throw new Error("Missing BigCommerce store_hash");
    const accessToken = await getNangoAccessToken(context.nangoConnectionId, "bigcommerce");
    const response = await callBigCommerceApi(
      storeHash,
      accessToken,
      method,
      pathWithQuery,
      nativeRequest.body,
      nativeRequest.headers,
    );
    return {
      provider: "bigcommerce",
      mode: "native",
      method,
      path: pathWithQuery,
      response,
    };
  }

  if (context.platform === "woocommerce") {
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      method,
      pathWithQuery,
      nativeRequest.body,
      nativeRequest.headers,
    );
    return {
      provider: "woocommerce",
      mode: "native",
      method,
      path: pathWithQuery,
      response,
    };
  }

  const baseUrl = normalizeBaseUrl(context.magentoBaseUrl || "");
  if (!baseUrl) throw new Error("Missing Magento base URL");
  const accessToken = await getNangoAccessToken(context.nangoConnectionId, "adobe-commerce");
  const magentoPath = normalizeMagentoNativePath(pathWithQuery);
  const response = await callMagentoApi(
    baseUrl,
    accessToken,
    method,
    magentoPath,
    nativeRequest.body,
    nativeRequest.headers,
  );
  return {
    provider: "magento",
    mode: "native",
    method,
    path: magentoPath,
    response,
  };
}

async function performDirectRead(
  context: ConnectionContext,
  request: ParsedReadRequest,
): Promise<Record<string, unknown>> {
  if (context.platform === "shopify") {
    return readShopifyEntity(context, request);
  }
  if (context.platform === "bigcommerce") {
    return readBigCommerceEntity(context, request);
  }
  if (context.platform === "woocommerce") {
    return readWooCommerceEntity(context, request);
  }
  return readMagentoEntity(context, request);
}

function buildQueryString(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function toIsoDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString();
}

function trimRows(rows: unknown, limit: number): Record<string, unknown>[] {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .slice(0, limit)
    .map((item) =>
      typeof item === "object" && item ? (item as Record<string, unknown>) : { value: item },
    );
}

function normalizeShopDomain(domain: string): string {
  const trimmed = String(domain || "")
    .trim()
    .toLowerCase();
  if (!trimmed) return "";
  return trimmed.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function normalizeShopifyNativePath(path: string, body: unknown): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/admin/")) return normalized;
  const bodyObj = asObject(body);
  const apiVersion = pickString(bodyObj?.shopify_api_version, bodyObj?.api_version) || "2025-01";
  return `/admin/api/${apiVersion}${normalized}`;
}

function normalizeMagentoNativePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/rest/")) return normalized.slice("/rest".length) || "/";
  return normalized;
}

function toShopifyOrderGid(value: unknown): string {
  const orderId = pickString(value);
  if (!orderId) return "";
  if (orderId.startsWith("gid://")) return orderId;
  if (/^\d+$/.test(orderId)) return `gid://shopify/Order/${orderId}`;
  return "";
}

function buildShopifySearch(filters: Record<string, unknown>, since: string): string {
  const parts: string[] = [];
  if (since) parts.push(`updated_at:>=${since}`);
  const search = pickString(filters.search, filters.query, filters.q);
  if (search) parts.push(search);
  return parts.join(" AND ");
}

function mapShopifyOrderItems(orders: Record<string, unknown>[]): Record<string, unknown>[] {
  return orders.flatMap((order) =>
    trimRows((order.lineItems as Record<string, unknown> | undefined)?.nodes, 100).map((item) => ({
      order_id: order.id ?? null,
      order_name: order.name ?? null,
      order_created_at: order.createdAt ?? null,
      order_updated_at: order.updatedAt ?? null,
      line_item_id: item.id ?? null,
      sku: item.sku ?? null,
      title: item.title ?? null,
      quantity: item.quantity ?? null,
      variant_id: (item.variant as Record<string, unknown> | undefined)?.id ?? null,
      raw: item,
    })),
  );
}

async function callShopifyGraphQL(
  context: ConnectionContext,
  query: string,
  variables: Record<string, unknown> = {},
  apiVersion = "2025-01",
): Promise<Record<string, unknown>> {
  const token = pickString(context.shopAccessToken);
  const domain = normalizeShopDomain(pickString(context.shopDomain));
  if (!token || !domain) {
    throw new Error("Missing Shopify credentials in connection context");
  }

  const endpoint = `https://${domain}/admin/api/${apiVersion}/graphql.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      `Shopify API ${response.status} ${response.statusText}: ${JSON.stringify(parsed)}`,
    );
  }

  const gqlErrors = Array.isArray(parsed.errors) ? parsed.errors : [];
  if (gqlErrors.length > 0) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(gqlErrors)}`);
  }

  return parsed;
}

async function callShopifyRestApi(
  context: ConnectionContext,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const token = pickString(context.shopAccessToken);
  const domain = normalizeShopDomain(pickString(context.shopDomain));
  if (!token || !domain) {
    throw new Error("Missing Shopify credentials in connection context");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`https://${domain}${normalizedPath}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
      ...(body !== undefined && body !== null ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined && body !== null ? { body: JSON.stringify(body) } : {}),
  });
  return parseApiResponse("Shopify", response);
}

async function readShopifyEntity(
  context: ConnectionContext,
  request: ParsedReadRequest,
): Promise<Record<string, unknown>> {
  const search = buildShopifySearch(request.filters, request.since);
  const queryValue = search || null;

  if (request.entity === "shop_info") {
    const result = await callShopifyGraphQL(
      context,
      `
        query ShopInfo {
          shop {
            id
            name
            myshopifyDomain
            email
            currencyCode
            timezoneAbbreviation
            primaryDomain { host url }
            plan { displayName partnerDevelopment }
          }
        }
      `,
    );
    const data = (result.data || {}) as Record<string, unknown>;
    const rows =
      data.shop && typeof data.shop === "object" ? [data.shop as Record<string, unknown>] : [];
    return {
      provider: "shopify",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "customers") {
    const result = await callShopifyGraphQL(
      context,
      `
        query Customers($first: Int!, $query: String) {
          customers(first: $first, sortKey: UPDATED_AT, reverse: true, query: $query) {
            nodes {
              id
              legacyResourceId
              email
              firstName
              lastName
              state
              createdAt
              updatedAt
              numberOfOrders
              amountSpent { amount currencyCode }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { first: request.limit, query: queryValue },
    );
    const data = (result.data || {}) as Record<string, unknown>;
    const customers = (data.customers || {}) as Record<string, unknown>;
    const rows = trimRows(customers.nodes, request.limit);
    return {
      provider: "shopify",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: customers.pageInfo ?? null,
    };
  }

  if (request.entity === "orders" || request.entity === "order_items") {
    const orderGid = toShopifyOrderGid(request.filters.order_id || request.filters.id);
    if (orderGid) {
      const result = await callShopifyGraphQL(
        context,
        `
          query OrderById($id: ID!) {
            order(id: $id) {
              id
              legacyResourceId
              name
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              customer { id email firstName lastName }
              lineItems(first: 100) {
                nodes {
                  id
                  title
                  sku
                  quantity
                  variant { id }
                }
              }
            }
          }
        `,
        { id: orderGid },
      );
      const data = (result.data || {}) as Record<string, unknown>;
      const order =
        data.order && typeof data.order === "object"
          ? (data.order as Record<string, unknown>)
          : null;
      const orders = order ? [order] : [];
      const rows = request.entity === "order_items" ? mapShopifyOrderItems(orders) : orders;
      return {
        provider: "shopify",
        entity: request.entity,
        count: rows.length,
        rows,
        pagination: null,
      };
    }

    const result = await callShopifyGraphQL(
      context,
      `
        query Orders($first: Int!, $query: String) {
          orders(first: $first, sortKey: UPDATED_AT, reverse: true, query: $query) {
            nodes {
              id
              legacyResourceId
              name
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              customer { id email firstName lastName }
              lineItems(first: 100) {
                nodes {
                  id
                  title
                  sku
                  quantity
                  variant { id }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { first: request.limit, query: queryValue },
    );
    const data = (result.data || {}) as Record<string, unknown>;
    const ordersNode = (data.orders || {}) as Record<string, unknown>;
    const orders = trimRows(ordersNode.nodes, request.limit);
    const rows = request.entity === "order_items" ? mapShopifyOrderItems(orders) : orders;
    return {
      provider: "shopify",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: ordersNode.pageInfo ?? null,
    };
  }

  const result = await callShopifyGraphQL(
    context,
    `
      query Products($first: Int!, $query: String) {
        products(first: $first, sortKey: UPDATED_AT, reverse: true, query: $query) {
          nodes {
            id
            legacyResourceId
            title
            handle
            status
            vendor
            productType
            createdAt
            updatedAt
            totalInventory
            variants(first: 100) {
              nodes {
                id
                legacyResourceId
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                createdAt
                updatedAt
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
    { first: request.limit, query: queryValue },
  );

  const data = (result.data || {}) as Record<string, unknown>;
  const productsNode = (data.products || {}) as Record<string, unknown>;
  const products = trimRows(productsNode.nodes, request.limit);
  if (request.entity === "products") {
    return {
      provider: "shopify",
      entity: request.entity,
      count: products.length,
      rows: products,
      pagination: productsNode.pageInfo ?? null,
    };
  }

  const variants = products.flatMap((product) =>
    trimRows((product.variants as Record<string, unknown> | undefined)?.nodes, 100).map(
      (variant) => ({
        product_id: product.id ?? null,
        product_legacy_id: product.legacyResourceId ?? null,
        product_title: product.title ?? null,
        product_status: product.status ?? null,
        variant_id: variant.id ?? null,
        variant_legacy_id: variant.legacyResourceId ?? null,
        variant_title: variant.title ?? null,
        sku: variant.sku ?? null,
        price: variant.price ?? null,
        compare_at_price: variant.compareAtPrice ?? null,
        inventory_quantity: variant.inventoryQuantity ?? null,
        created_at: variant.createdAt ?? null,
        updated_at: variant.updatedAt ?? null,
        raw: variant,
      }),
    ),
  );

  if (request.entity === "inventory") {
    const inventoryRows = variants.map((variant) => ({
      product_id: variant.product_id,
      product_title: variant.product_title,
      variant_id: variant.variant_id,
      sku: variant.sku,
      inventory_quantity: variant.inventory_quantity,
      updated_at: variant.updated_at,
    }));
    return {
      provider: "shopify",
      entity: request.entity,
      count: inventoryRows.length,
      rows: inventoryRows,
      pagination: productsNode.pageInfo ?? null,
    };
  }

  return {
    provider: "shopify",
    entity: request.entity,
    count: variants.length,
    rows: variants,
    pagination: productsNode.pageInfo ?? null,
  };
}

function requireShopifyField(obj: Record<string, unknown>, key: string, message: string): void {
  if (obj[key] === undefined || obj[key] === null || obj[key] === "") {
    throw new Error(message);
  }
}

function extractShopifyNumericProductId(value: unknown): string {
  const raw = pickString(value);
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/gid:\/\/shopify\/Product\/(\d+)/i);
  if (match?.[1]) return match[1];
  return "";
}

function buildShopifyRestProductBody(
  payload: Record<string, unknown>,
  productNumericId = "",
): Record<string, unknown> {
  const nestedProduct = asObject(payload.product);
  const source = nestedProduct ? { ...nestedProduct } : { ...payload };
  delete source.shopify_api_version;
  delete source.api_version;
  delete source.id;
  delete source.product_id;
  delete source.operation;
  delete source.mode;
  delete source.write_mode;
  delete source.native_request;

  if (source.body_html === undefined && source.bodyHtml !== undefined) {
    source.body_html = source.bodyHtml;
  }
  if (source.body_html === undefined && source.description !== undefined) {
    source.body_html = source.description;
  }
  delete source.bodyHtml;

  const productBody: Record<string, unknown> = { ...source };
  if (productNumericId) {
    productBody.id = Number.parseInt(productNumericId, 10);
  }
  return { product: productBody };
}

function buildShopifyGraphQlAdvancedMutation(
  operation: NormalizedOperation,
  payload: Record<string, unknown>,
): { query: string; variables: Record<string, unknown> } {
  const op = String(operation || "").toLowerCase();

  if (op === "publish") {
    requireShopifyField(payload, "publicationId", "Shopify publish requires payload.publicationId");
    requireShopifyField(payload, "productIds", "Shopify publish requires payload.productIds");
    return {
      query:
        "mutation BulkPublishProducts($publicationId: ID!, $productIds: [ID!]!) { publishablePublish(id: $publicationId, input: { publishableIds: $productIds }) { publishable { id } userErrors { field message } } }",
      variables: {
        publicationId: payload.publicationId,
        productIds: payload.productIds,
      },
    };
  }

  if (op === "unpublish") {
    requireShopifyField(
      payload,
      "publicationId",
      "Shopify unpublish requires payload.publicationId",
    );
    requireShopifyField(payload, "productIds", "Shopify unpublish requires payload.productIds");
    return {
      query:
        "mutation BulkUnpublishProducts($publicationId: ID!, $productIds: [ID!]!) { publishableUnpublish(id: $publicationId, input: { publishableIds: $productIds }) { publishable { id } userErrors { field message } } }",
      variables: {
        publicationId: payload.publicationId,
        productIds: payload.productIds,
      },
    };
  }

  if (op === "variants_bulk_update") {
    requireShopifyField(
      payload,
      "productId",
      "Shopify variants_bulk_update requires payload.productId",
    );
    requireShopifyField(
      payload,
      "variants",
      "Shopify variants_bulk_update requires payload.variants",
    );
    return {
      query:
        "mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { product { id title } productVariants { id sku price } userErrors { field message } } }",
      variables: {
        productId: payload.productId,
        variants: payload.variants,
      },
    };
  }

  if (op === "inventory_adjust") {
    requireShopifyField(
      payload,
      "locationId",
      "Shopify inventory_adjust requires payload.locationId",
    );
    requireShopifyField(payload, "changes", "Shopify inventory_adjust requires payload.changes");
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
    `Unsupported Shopify operation '${operation}'. Supported: create, update, upsert, delete, publish, unpublish, variants_bulk_update, inventory_adjust, native`,
  );
}

async function writeShopifyProduct(
  context: ConnectionContext,
  operation: NormalizedOperation,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const finalOperation =
    operation === "upsert"
      ? pickString(payload.id, (payload.input as Record<string, unknown> | undefined)?.id)
        ? "update"
        : "create"
      : operation;

  const apiVersion = pickString(payload.shopify_api_version, payload.api_version) || "2025-01";
  const restBase = `/admin/api/${apiVersion}`;

  if (finalOperation === "create") {
    const body = buildShopifyRestProductBody(payload);
    const product = asObject(body.product) || {};
    requireShopifyField(
      product,
      "title",
      "Shopify create requires payload.title (or payload.product.title)",
    );
    const response = await callShopifyRestApi(context, "POST", `${restBase}/products.json`, body);
    return {
      provider: "shopify",
      operation: finalOperation,
      api: "rest",
      response,
    };
  }

  if (finalOperation === "update") {
    const productNumericId = extractShopifyNumericProductId(
      pickString(payload.id, payload.product_id, (asObject(payload.product) || {}).id),
    );
    if (!productNumericId) {
      throw new Error(
        "Shopify update requires payload.id or payload.product_id (numeric id or gid)",
      );
    }
    const body = buildShopifyRestProductBody(payload, productNumericId);
    const response = await callShopifyRestApi(
      context,
      "PUT",
      `${restBase}/products/${productNumericId}.json`,
      body,
    );
    return {
      provider: "shopify",
      operation: finalOperation,
      product_id: productNumericId,
      api: "rest",
      response,
    };
  }

  if (finalOperation === "delete") {
    const productNumericId = extractShopifyNumericProductId(
      pickString(payload.id, payload.product_id, (asObject(payload.product) || {}).id),
    );
    if (!productNumericId) {
      throw new Error(
        "Shopify delete requires payload.id or payload.product_id (numeric id or gid)",
      );
    }
    const response = await callShopifyRestApi(
      context,
      "DELETE",
      `${restBase}/products/${productNumericId}.json`,
    );
    return {
      provider: "shopify",
      operation: finalOperation,
      product_id: productNumericId,
      api: "rest",
      response,
    };
  }

  const mutation = buildShopifyGraphQlAdvancedMutation(finalOperation, payload);
  const response = await callShopifyGraphQL(
    context,
    mutation.query,
    mutation.variables,
    apiVersion,
  );

  return {
    provider: "shopify",
    operation: finalOperation,
    api: "graphql",
    response,
  };
}

async function readBigCommerceEntity(
  context: ConnectionContext,
  request: ParsedReadRequest,
): Promise<Record<string, unknown>> {
  const storeHash = context.storeHash || "";
  if (!storeHash) throw new Error("Missing BigCommerce store_hash");
  const accessToken = await getNangoAccessToken(context.nangoConnectionId, "bigcommerce");
  const since = request.since;

  if (request.entity === "shop_info") {
    const response = await callBigCommerceApi(storeHash, accessToken, "GET", "/v2/store");
    return {
      provider: "bigcommerce",
      entity: request.entity,
      count: 1,
      rows: [response],
      pagination: null,
    };
  }

  if (request.entity === "products") {
    const productId = pickString(request.filters.id, request.filters.product_id);
    if (productId) {
      const response = await callBigCommerceApi(
        storeHash,
        accessToken,
        "GET",
        `/v3/catalog/products/${encodeURIComponent(productId)}`,
      );
      const row = response.data && typeof response.data === "object" ? [response.data] : [];
      return {
        provider: "bigcommerce",
        entity: request.entity,
        count: row.length,
        rows: row,
        pagination: null,
      };
    }

    const path = `/v3/catalog/products${buildQueryString({
      limit: request.limit,
      page: 1,
      include: "variants",
      ...(since ? { min_date_modified: since } : {}),
    })}`;
    const response = await callBigCommerceApi(storeHash, accessToken, "GET", path);
    const rows = trimRows(response.data, request.limit);
    const pagination =
      response.meta && typeof response.meta === "object"
        ? ((response.meta as Record<string, unknown>).pagination ?? null)
        : null;
    return {
      provider: "bigcommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination,
    };
  }

  if (request.entity === "variants" || request.entity === "inventory") {
    const variantId = pickString(request.filters.id, request.filters.variant_id);
    let rows: Record<string, unknown>[] = [];

    if (variantId) {
      const response = await callBigCommerceApi(
        storeHash,
        accessToken,
        "GET",
        `/v3/catalog/variants/${encodeURIComponent(variantId)}`,
      );
      rows =
        response.data && typeof response.data === "object"
          ? [response.data as Record<string, unknown>]
          : [];
    } else {
      const path = `/v3/catalog/variants${buildQueryString({
        limit: request.limit,
        page: 1,
        ...(since ? { min_date_modified: since } : {}),
      })}`;
      const response = await callBigCommerceApi(storeHash, accessToken, "GET", path);
      rows = trimRows(response.data, request.limit);
    }

    if (request.entity === "inventory") {
      rows = rows.map((row) => ({
        product_id: row.product_id ?? null,
        variant_id: row.id ?? null,
        sku: row.sku ?? null,
        inventory_level: row.inventory_level ?? null,
        inventory_warning_level: row.inventory_warning_level ?? null,
        updated_at: row.date_modified ?? row.updated_at ?? null,
      }));
    }

    return {
      provider: "bigcommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "customers") {
    const customerId = pickString(request.filters.id, request.filters.customer_id);
    if (customerId) {
      const response = await callBigCommerceApi(
        storeHash,
        accessToken,
        "GET",
        `/v3/customers${buildQueryString({ id: customerId })}`,
      );
      const rows = trimRows(response.data, request.limit);
      return {
        provider: "bigcommerce",
        entity: request.entity,
        count: rows.length,
        rows,
        pagination: null,
      };
    }

    const path = `/v3/customers${buildQueryString({
      limit: request.limit,
      page: 1,
      ...(since ? { min_date_modified: since } : {}),
    })}`;
    const response = await callBigCommerceApi(storeHash, accessToken, "GET", path);
    const rows = trimRows(response.data, request.limit);
    const pagination =
      response.meta && typeof response.meta === "object"
        ? ((response.meta as Record<string, unknown>).pagination ?? null)
        : null;
    return {
      provider: "bigcommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination,
    };
  }

  if (request.entity === "orders") {
    const orderId = pickString(request.filters.id, request.filters.order_id);
    if (orderId) {
      const response = await callBigCommerceApi(
        storeHash,
        accessToken,
        "GET",
        `/v2/orders/${encodeURIComponent(orderId)}`,
      );
      return {
        provider: "bigcommerce",
        entity: request.entity,
        count: 1,
        rows: [response],
        pagination: null,
      };
    }

    const path = `/v2/orders${buildQueryString({
      limit: request.limit,
      page: 1,
      sort: "date_modified:desc",
      ...(since ? { min_date_modified: since } : {}),
    })}`;
    const response = await callBigCommerceApi(storeHash, accessToken, "GET", path);
    const rows = trimRows(response.data, request.limit);
    return {
      provider: "bigcommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  const orderId = pickString(request.filters.order_id, request.filters.id);
  if (orderId) {
    const response = await callBigCommerceApi(
      storeHash,
      accessToken,
      "GET",
      `/v2/orders/${encodeURIComponent(orderId)}/products`,
    );
    const rows = trimRows(response.data, request.limit).map((row) => ({
      order_id: orderId,
      ...row,
    }));
    return {
      provider: "bigcommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  const ordersResponse = await callBigCommerceApi(
    storeHash,
    accessToken,
    "GET",
    `/v2/orders${buildQueryString({ limit: Math.min(request.limit, 20), page: 1, sort: "date_modified:desc" })}`,
  );
  const orders = trimRows(ordersResponse.data, Math.min(request.limit, 20));
  const items: Record<string, unknown>[] = [];
  for (const order of orders) {
    if (items.length >= request.limit) break;
    const currentOrderId = pickString(order.id, order.order_id);
    if (!currentOrderId) continue;
    const response = await callBigCommerceApi(
      storeHash,
      accessToken,
      "GET",
      `/v2/orders/${encodeURIComponent(currentOrderId)}/products`,
    );
    const lineItems = trimRows(response.data, request.limit - items.length).map((row) => ({
      order_id: currentOrderId,
      ...row,
    }));
    items.push(...lineItems);
  }
  return {
    provider: "bigcommerce",
    entity: request.entity,
    count: items.length,
    rows: items,
    pagination: null,
  };
}

async function readWooCommerceEntity(
  context: ConnectionContext,
  request: ParsedReadRequest,
): Promise<Record<string, unknown>> {
  const sinceIso = toIsoDate(request.since);

  if (request.entity === "shop_info") {
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "GET",
      "/wp-json/wc/v3/system_status",
    );
    return {
      provider: "woocommerce",
      entity: request.entity,
      count: 1,
      rows: [response],
      pagination: null,
    };
  }

  if (request.entity === "products") {
    const productId = pickString(request.filters.id, request.filters.product_id);
    if (productId) {
      const response = await callWooCommerceProxy(
        context.nangoConnectionId,
        "GET",
        `/wp-json/wc/v3/products/${encodeURIComponent(productId)}`,
      );
      return {
        provider: "woocommerce",
        entity: request.entity,
        count: 1,
        rows: [response],
        pagination: null,
      };
    }
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "GET",
      `/wp-json/wc/v3/products${buildQueryString({
        per_page: request.limit,
        page: 1,
        orderby: "date",
        order: "desc",
        ...(sinceIso ? { after: sinceIso } : {}),
      })}`,
    );
    const rows = trimRows(response.data, request.limit);
    return {
      provider: "woocommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "variants") {
    const explicitProductId = pickString(request.filters.product_id);
    const explicitVariantId = pickString(request.filters.variant_id, request.filters.id);

    if (explicitProductId) {
      if (explicitVariantId) {
        const response = await callWooCommerceProxy(
          context.nangoConnectionId,
          "GET",
          `/wp-json/wc/v3/products/${encodeURIComponent(explicitProductId)}/variations/${encodeURIComponent(explicitVariantId)}`,
        );
        return {
          provider: "woocommerce",
          entity: request.entity,
          count: 1,
          rows: [{ product_id: explicitProductId, ...response }],
          pagination: null,
        };
      }

      const response = await callWooCommerceProxy(
        context.nangoConnectionId,
        "GET",
        `/wp-json/wc/v3/products/${encodeURIComponent(explicitProductId)}/variations${buildQueryString(
          {
            per_page: request.limit,
            page: 1,
            orderby: "date",
            order: "desc",
          },
        )}`,
      );
      const rows = trimRows(response.data, request.limit).map((row) => ({
        product_id: explicitProductId,
        ...row,
      }));
      return {
        provider: "woocommerce",
        entity: request.entity,
        count: rows.length,
        rows,
        pagination: null,
      };
    }

    const productsResponse = await callWooCommerceProxy(
      context.nangoConnectionId,
      "GET",
      `/wp-json/wc/v3/products${buildQueryString({
        per_page: Math.min(request.limit, 20),
        page: 1,
        orderby: "date",
        order: "desc",
        ...(sinceIso ? { after: sinceIso } : {}),
      })}`,
    );
    const products = trimRows(productsResponse.data, Math.min(request.limit, 20));
    const rows: Record<string, unknown>[] = [];

    for (const product of products) {
      if (rows.length >= request.limit) break;
      const productId = pickString(product.id, product.product_id);
      if (!productId) continue;

      const remaining = request.limit - rows.length;
      const response = await callWooCommerceProxy(
        context.nangoConnectionId,
        "GET",
        `/wp-json/wc/v3/products/${encodeURIComponent(productId)}/variations${buildQueryString({
          per_page: Math.min(remaining, 100),
          page: 1,
          orderby: "date",
          order: "desc",
        })}`,
      );

      const variantRows = trimRows(response.data, remaining).map((row) => ({
        product_id: productId,
        ...row,
      }));
      rows.push(...variantRows);
    }

    return {
      provider: "woocommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "inventory") {
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "GET",
      `/wp-json/wc/v3/products${buildQueryString({
        per_page: request.limit,
        page: 1,
        orderby: "date",
        order: "desc",
        ...(sinceIso ? { after: sinceIso } : {}),
      })}`,
    );
    const rows = trimRows(response.data, request.limit).map((row) => ({
      product_id: row.id ?? null,
      sku: row.sku ?? null,
      name: row.name ?? null,
      stock_quantity: row.stock_quantity ?? null,
      stock_status: row.stock_status ?? null,
      manage_stock: row.manage_stock ?? null,
      date_modified: row.date_modified ?? null,
    }));
    return {
      provider: "woocommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "customers") {
    const customerId = pickString(request.filters.id, request.filters.customer_id);
    if (customerId) {
      const response = await callWooCommerceProxy(
        context.nangoConnectionId,
        "GET",
        `/wp-json/wc/v3/customers/${encodeURIComponent(customerId)}`,
      );
      return {
        provider: "woocommerce",
        entity: request.entity,
        count: 1,
        rows: [response],
        pagination: null,
      };
    }
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "GET",
      `/wp-json/wc/v3/customers${buildQueryString({
        per_page: request.limit,
        page: 1,
        orderby: "registered_date",
        order: "desc",
        ...(sinceIso ? { after: sinceIso } : {}),
      })}`,
    );
    const rows = trimRows(response.data, request.limit);
    return {
      provider: "woocommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "orders") {
    const orderId = pickString(request.filters.id, request.filters.order_id);
    if (orderId) {
      const response = await callWooCommerceProxy(
        context.nangoConnectionId,
        "GET",
        `/wp-json/wc/v3/orders/${encodeURIComponent(orderId)}`,
      );
      return {
        provider: "woocommerce",
        entity: request.entity,
        count: 1,
        rows: [response],
        pagination: null,
      };
    }
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "GET",
      `/wp-json/wc/v3/orders${buildQueryString({
        per_page: request.limit,
        page: 1,
        orderby: "date",
        order: "desc",
        ...(sinceIso ? { after: sinceIso } : {}),
      })}`,
    );
    const rows = trimRows(response.data, request.limit);
    return {
      provider: "woocommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  const orderId = pickString(request.filters.order_id, request.filters.id);
  if (orderId) {
    const order = await callWooCommerceProxy(
      context.nangoConnectionId,
      "GET",
      `/wp-json/wc/v3/orders/${encodeURIComponent(orderId)}`,
    );
    const rows = trimRows(order.line_items, request.limit).map((item) => ({
      order_id: orderId,
      ...item,
    }));
    return {
      provider: "woocommerce",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  const ordersResponse = await callWooCommerceProxy(
    context.nangoConnectionId,
    "GET",
    `/wp-json/wc/v3/orders${buildQueryString({
      per_page: Math.min(request.limit, 20),
      page: 1,
      orderby: "date",
      order: "desc",
    })}`,
  );
  const orders = trimRows(ordersResponse.data, Math.min(request.limit, 20));
  const rows = orders
    .flatMap((order) =>
      trimRows(order.line_items, request.limit).map((line) => ({
        order_id: order.id ?? null,
        order_number: order.number ?? null,
        order_date_created: order.date_created ?? null,
        ...line,
      })),
    )
    .slice(0, request.limit);

  return {
    provider: "woocommerce",
    entity: request.entity,
    count: rows.length,
    rows,
    pagination: null,
  };
}

function buildMagentoSearchQuery(
  limit: number,
  since: string,
  sortField: string,
  equalField = "",
  equalValue = "",
): string {
  const params = new URLSearchParams();
  params.set("searchCriteria[currentPage]", "1");
  params.set("searchCriteria[pageSize]", String(limit));
  params.set("searchCriteria[sortOrders][0][field]", sortField);
  params.set("searchCriteria[sortOrders][0][direction]", "DESC");

  let group = 0;
  if (since) {
    params.set(`searchCriteria[filter_groups][${group}][filters][0][field]`, sortField);
    params.set(`searchCriteria[filter_groups][${group}][filters][0][value]`, since);
    params.set(`searchCriteria[filter_groups][${group}][filters][0][condition_type]`, "gteq");
    group += 1;
  }
  if (equalField && equalValue) {
    params.set(`searchCriteria[filter_groups][${group}][filters][0][field]`, equalField);
    params.set(`searchCriteria[filter_groups][${group}][filters][0][value]`, equalValue);
    params.set(`searchCriteria[filter_groups][${group}][filters][0][condition_type]`, "eq");
  }

  return params.toString();
}

async function readMagentoEntity(
  context: ConnectionContext,
  request: ParsedReadRequest,
): Promise<Record<string, unknown>> {
  const baseUrl = normalizeBaseUrl(context.magentoBaseUrl || "");
  if (!baseUrl) throw new Error("Missing Magento base URL");
  const accessToken = await getNangoAccessToken(context.nangoConnectionId, "adobe-commerce");

  if (request.entity === "shop_info") {
    const response = await callMagentoApi(baseUrl, accessToken, "GET", "/V1/store/storeConfigs");
    const rows = trimRows(response.data, request.limit);
    return {
      provider: "magento",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "products") {
    const sku = pickString(request.filters.sku, request.filters.id);
    if (sku) {
      const response = await callMagentoApi(
        baseUrl,
        accessToken,
        "GET",
        `/V1/products/${encodeURIComponent(sku)}`,
      );
      return {
        provider: "magento",
        entity: request.entity,
        count: 1,
        rows: [response],
        pagination: null,
      };
    }
    const query = buildMagentoSearchQuery(request.limit, request.since, "updated_at");
    const response = await callMagentoApi(baseUrl, accessToken, "GET", `/V1/products?${query}`);
    const rows = trimRows(response.items, request.limit);
    return {
      provider: "magento",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: {
        total_count: parseNumber(response.total_count),
      },
    };
  }

  if (request.entity === "variants") {
    const query = buildMagentoSearchQuery(request.limit, request.since, "updated_at");
    const response = await callMagentoApi(baseUrl, accessToken, "GET", `/V1/products?${query}`);
    const rows = trimRows(response.items, request.limit)
      .filter((row) => String(row.type_id || "").toLowerCase() === "simple")
      .map((row) => ({
        sku: row.sku ?? null,
        type_id: row.type_id ?? null,
        name: row.name ?? null,
        price: row.price ?? null,
        status: row.status ?? null,
        updated_at: row.updated_at ?? null,
      }));
    return {
      provider: "magento",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "inventory") {
    const query = buildMagentoSearchQuery(request.limit, request.since, "updated_at");
    const products = await callMagentoApi(baseUrl, accessToken, "GET", `/V1/products?${query}`);
    const productRows = trimRows(products.items, request.limit);
    const rows: Record<string, unknown>[] = [];

    for (const product of productRows) {
      const sku = pickString(product.sku);
      if (!sku) continue;
      const stockItem = await callMagentoApi(
        baseUrl,
        accessToken,
        "GET",
        `/V1/stockItems/${encodeURIComponent(sku)}`,
      );
      rows.push({
        sku,
        item_id: stockItem.item_id ?? null,
        qty: stockItem.qty ?? null,
        is_in_stock: stockItem.is_in_stock ?? null,
        product_name: product.name ?? null,
        product_updated_at: product.updated_at ?? null,
      });
      if (rows.length >= request.limit) break;
    }

    return {
      provider: "magento",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: null,
    };
  }

  if (request.entity === "customers") {
    const customerId = pickString(request.filters.id, request.filters.customer_id);
    const query = buildMagentoSearchQuery(
      request.limit,
      request.since,
      "updated_at",
      "entity_id",
      customerId,
    );
    const response = await callMagentoApi(
      baseUrl,
      accessToken,
      "GET",
      `/V1/customers/search?${query}`,
    );
    const rows = trimRows(response.items, request.limit);
    return {
      provider: "magento",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: { total_count: parseNumber(response.total_count) },
    };
  }

  if (request.entity === "orders" || request.entity === "order_items") {
    const orderId = pickString(request.filters.id, request.filters.order_id);
    const query = buildMagentoSearchQuery(
      request.limit,
      request.since,
      "updated_at",
      "entity_id",
      orderId,
    );
    const response = await callMagentoApi(baseUrl, accessToken, "GET", `/V1/orders?${query}`);
    const orders = trimRows(response.items, request.limit);

    if (request.entity === "orders") {
      return {
        provider: "magento",
        entity: request.entity,
        count: orders.length,
        rows: orders,
        pagination: { total_count: parseNumber(response.total_count) },
      };
    }

    const rows = orders
      .flatMap((order) =>
        trimRows(order.items, request.limit).map((item) => ({
          order_id: order.entity_id ?? null,
          increment_id: order.increment_id ?? null,
          order_created_at: order.created_at ?? null,
          ...item,
        })),
      )
      .slice(0, request.limit);

    return {
      provider: "magento",
      entity: request.entity,
      count: rows.length,
      rows,
      pagination: { total_count: parseNumber(response.total_count) },
    };
  }

  throw new Error(`Unsupported Magento entity: ${request.entity}`);
}

async function writeBigCommerceProduct(
  context: ConnectionContext,
  operation: NormalizedOperation,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const storeHash = context.storeHash || "";
  if (!storeHash) throw new Error("Missing BigCommerce store_hash");

  const accessToken = await getNangoAccessToken(context.nangoConnectionId, "bigcommerce");
  const finalOperation =
    operation === "upsert"
      ? pickString(payload.id, payload.product_id)
        ? "update"
        : "create"
      : operation;

  if (finalOperation === "create") {
    const body = extractProductInput(payload);
    const response = await callBigCommerceApi(
      storeHash,
      accessToken,
      "POST",
      "/v3/catalog/products",
      body,
    );
    return { provider: "bigcommerce", operation: finalOperation, response };
  }

  if (finalOperation === "update") {
    const productId = pickString(payload.id, payload.product_id);
    if (!productId) throw new Error("BigCommerce update requires payload.id or payload.product_id");

    const body = extractProductInput(payload);
    delete (body as Record<string, unknown>).id;
    delete (body as Record<string, unknown>).product_id;

    const response = await callBigCommerceApi(
      storeHash,
      accessToken,
      "PUT",
      `/v3/catalog/products/${encodeURIComponent(productId)}`,
      body,
    );
    return { provider: "bigcommerce", operation: finalOperation, product_id: productId, response };
  }

  if (finalOperation === "delete") {
    const productId = pickString(payload.id, payload.product_id);
    if (!productId) throw new Error("BigCommerce delete requires payload.id or payload.product_id");

    const response = await callBigCommerceApi(
      storeHash,
      accessToken,
      "DELETE",
      `/v3/catalog/products/${encodeURIComponent(productId)}`,
    );
    return { provider: "bigcommerce", operation: finalOperation, product_id: productId, response };
  }

  if (finalOperation === "inventory_adjust") {
    const variantId = pickString(payload.variant_id, payload.variantId);
    if (!variantId) throw new Error("BigCommerce inventory_adjust requires payload.variant_id");

    let productId = pickString(payload.product_id, payload.productId);
    let targetLevel =
      parseNumber(payload.inventory_level) ??
      parseNumber(payload.stock_quantity) ??
      parseNumber(payload.qty);
    const delta = parseNumber(payload.delta);
    let currentVariant = {} as Record<string, unknown>;

    if (targetLevel === null) {
      if (delta === null) {
        throw new Error(
          "BigCommerce inventory_adjust requires inventory_level/stock_quantity/qty or delta",
        );
      }

      if (productId) {
        const currentProduct = await callBigCommerceApi(
          storeHash,
          accessToken,
          "GET",
          `/v3/catalog/products/${encodeURIComponent(productId)}`,
        );
        const productRow = (currentProduct?.data || {}) as Record<string, unknown>;
        const currentLevel = parseNumber(productRow.inventory_level) || 0;
        targetLevel = currentLevel + delta;
      } else {
        const current = await callBigCommerceApi(
          storeHash,
          accessToken,
          "GET",
          `/v3/catalog/variants/${encodeURIComponent(variantId)}`,
        );
        currentVariant = (current?.data || {}) as Record<string, unknown>;
        if (currentVariant.product_id !== undefined && currentVariant.product_id !== null) {
          productId = String(currentVariant.product_id);
        }
        const currentLevel = parseNumber(currentVariant.inventory_level) || 0;
        targetLevel = currentLevel + delta;
      }
    } else if (!productId) {
      const current = await callBigCommerceApi(
        storeHash,
        accessToken,
        "GET",
        `/v3/catalog/variants/${encodeURIComponent(variantId)}`,
      );
      currentVariant = (current?.data || {}) as Record<string, unknown>;
      if (currentVariant.product_id !== undefined && currentVariant.product_id !== null) {
        productId = String(currentVariant.product_id);
      }
    }

    if (!productId) {
      throw new Error(
        "BigCommerce inventory_adjust requires payload.product_id or resolvable variant product_id",
      );
    }

    const response = await updateBigCommerceVariantInventory(
      storeHash,
      accessToken,
      productId,
      variantId,
      targetLevel,
    );
    return {
      provider: "bigcommerce",
      operation: finalOperation,
      product_id: productId,
      variant_id: variantId,
      inventory_level: targetLevel,
      response,
    };
  }

  throw new Error(`Unsupported BigCommerce operation: ${finalOperation}`);
}

async function updateBigCommerceVariantInventory(
  storeHash: string,
  accessToken: string,
  productId: string,
  variantId: string,
  inventoryLevel: number,
): Promise<Record<string, unknown>> {
  const productVariantPath = `/v3/catalog/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`;
  const globalVariantPath = `/v3/catalog/variants/${encodeURIComponent(variantId)}`;
  const body = { inventory_level: inventoryLevel };

  const attempts: Array<{ method: string; path: string }> = [
    { method: "PUT", path: productVariantPath },
    { method: "PUT", path: globalVariantPath },
    { method: "PATCH", path: productVariantPath },
    { method: "PATCH", path: globalVariantPath },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await callBigCommerceApi(storeHash, accessToken, attempt.method, attempt.path, body);
    } catch (error) {
      const message = formatError(error);
      if (!message.includes("BigCommerce API 405")) {
        throw error;
      }
      lastError = error;
    }
  }

  // Some stores reject variant-level inventory update endpoints with 405.
  // Fallback to product-level inventory update so inventory_adjust can still work.
  try {
    return await callBigCommerceApi(
      storeHash,
      accessToken,
      "PUT",
      `/v3/catalog/products/${encodeURIComponent(productId)}`,
      body,
    );
  } catch (error) {
    if (lastError) {
      throw lastError;
    }
    throw error;
  }
}

async function callBigCommerceApi(
  storeHash: string,
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = `https://api.bigcommerce.com/stores/${storeHash}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "X-Auth-Token": accessToken,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return parseApiResponse("BigCommerce", response);
}

async function writeWooCommerceProduct(
  context: ConnectionContext,
  operation: NormalizedOperation,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const finalOperation =
    operation === "upsert"
      ? pickString(payload.id, payload.product_id)
        ? "update"
        : "create"
      : operation;

  if (finalOperation === "create") {
    const body = extractProductInput(payload);
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "POST",
      "/wp-json/wc/v3/products",
      body,
    );
    return { provider: "woocommerce", operation: finalOperation, response };
  }

  if (finalOperation === "update") {
    const productId = pickString(payload.id, payload.product_id);
    if (!productId) throw new Error("WooCommerce update requires payload.id or payload.product_id");

    const body = extractProductInput(payload);
    delete (body as Record<string, unknown>).id;
    delete (body as Record<string, unknown>).product_id;

    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "PUT",
      `/wp-json/wc/v3/products/${encodeURIComponent(productId)}`,
      body,
    );
    return { provider: "woocommerce", operation: finalOperation, product_id: productId, response };
  }

  if (finalOperation === "delete") {
    const productId = pickString(payload.id, payload.product_id);
    if (!productId) throw new Error("WooCommerce delete requires payload.id or payload.product_id");

    const force = parseBoolean(payload.force, true);
    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "DELETE",
      `/wp-json/wc/v3/products/${encodeURIComponent(productId)}?force=${force ? "true" : "false"}`,
    );
    return {
      provider: "woocommerce",
      operation: finalOperation,
      product_id: productId,
      force,
      response,
    };
  }

  if (finalOperation === "inventory_adjust") {
    const productId = pickString(payload.id, payload.product_id);
    if (!productId)
      throw new Error("WooCommerce inventory_adjust requires payload.id or payload.product_id");

    let targetQty =
      parseNumber(payload.stock_quantity) ??
      parseNumber(payload.inventory_level) ??
      parseNumber(payload.qty);

    if (targetQty === null) {
      const delta = parseNumber(payload.delta);
      if (delta === null) {
        throw new Error(
          "WooCommerce inventory_adjust requires stock_quantity/inventory_level/qty or delta",
        );
      }
      const current = await callWooCommerceProxy(
        context.nangoConnectionId,
        "GET",
        `/wp-json/wc/v3/products/${encodeURIComponent(productId)}`,
      );
      const currentQty = parseNumber(current.stock_quantity) || 0;
      targetQty = currentQty + delta;
    }

    const body: Record<string, unknown> = {
      manage_stock: parseBoolean(payload.manage_stock, true),
      stock_quantity: targetQty,
    };
    if (typeof payload.stock_status === "string" && payload.stock_status.trim()) {
      body.stock_status = payload.stock_status.trim();
    }

    const response = await callWooCommerceProxy(
      context.nangoConnectionId,
      "PUT",
      `/wp-json/wc/v3/products/${encodeURIComponent(productId)}`,
      body,
    );

    return {
      provider: "woocommerce",
      operation: finalOperation,
      product_id: productId,
      stock_quantity: targetQty,
      response,
    };
  }

  throw new Error(`Unsupported WooCommerce operation: ${finalOperation}`);
}

async function callWooCommerceProxy(
  connectionId: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.nango.dev/proxy${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NANGO_SECRET_KEY}`,
      "Provider-Config-Key": "woocommerce",
      "Connection-Id": connectionId,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return parseApiResponse("WooCommerce", response);
}

async function writeMagentoProduct(
  context: ConnectionContext,
  operation: NormalizedOperation,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const baseUrl = normalizeBaseUrl(context.magentoBaseUrl || "");
  if (!baseUrl) throw new Error("Missing Magento base URL");

  const accessToken = await getNangoAccessToken(context.nangoConnectionId, "adobe-commerce");
  const finalOperation = operation === "upsert" ? "update" : operation;

  if (finalOperation === "create" || finalOperation === "update") {
    const body = buildMagentoProductBody(payload);
    const response = await callMagentoApi(baseUrl, accessToken, "POST", "/V1/products", body);
    return {
      provider: "magento",
      operation: finalOperation,
      sku: pickString((body.product as Record<string, unknown>)?.sku),
      response,
    };
  }

  if (finalOperation === "delete") {
    const sku = pickString(payload.sku, payload.id);
    if (!sku) throw new Error("Magento delete requires payload.sku");

    const response = await callMagentoApi(
      baseUrl,
      accessToken,
      "DELETE",
      `/V1/products/${encodeURIComponent(sku)}`,
    );
    return { provider: "magento", operation: finalOperation, sku, response };
  }

  if (finalOperation === "inventory_adjust") {
    const sku = pickString(payload.sku, payload.id);
    if (!sku) throw new Error("Magento inventory_adjust requires payload.sku");

    let targetQty =
      parseNumber(payload.qty) ??
      parseNumber(payload.stock_quantity) ??
      parseNumber(payload.inventory_level);
    let stockItem = {} as Record<string, unknown>;

    if (targetQty === null || parseNumber(payload.item_id) === null) {
      const current = await callMagentoApi(
        baseUrl,
        accessToken,
        "GET",
        `/V1/stockItems/${encodeURIComponent(sku)}`,
      );
      stockItem = current;
      if (targetQty === null) {
        const delta = parseNumber(payload.delta);
        if (delta === null) {
          throw new Error(
            "Magento inventory_adjust requires qty/stock_quantity/inventory_level or delta",
          );
        }
        const currentQty = parseNumber(current.qty) || 0;
        targetQty = currentQty + delta;
      }
    }

    const itemId = parseNumber(payload.item_id) || parseNumber(stockItem.item_id) || 1;
    const body = {
      stockItem: {
        qty: targetQty,
        is_in_stock: parseBoolean(payload.is_in_stock, (targetQty || 0) > 0),
      },
    };

    const response = await callMagentoApi(
      baseUrl,
      accessToken,
      "PUT",
      `/V1/products/${encodeURIComponent(sku)}/stockItems/${itemId}`,
      body,
    );

    return {
      provider: "magento",
      operation: finalOperation,
      sku,
      stock_item_id: itemId,
      qty: targetQty,
      response,
    };
  }

  throw new Error(`Unsupported Magento operation: ${finalOperation}`);
}

function buildMagentoProductBody(payload: Record<string, unknown>): Record<string, unknown> {
  const hasProduct =
    typeof payload.product === "object" &&
    payload.product !== null &&
    !Array.isArray(payload.product);
  const body = hasProduct
    ? (payload as Record<string, unknown>)
    : {
        product: payload,
        saveOptions: true,
      };

  const product = (body.product || {}) as Record<string, unknown>;
  const sku = pickString(product.sku, payload.sku);
  if (!sku) throw new Error("Magento create/update requires product.sku or payload.sku");

  const mergedProduct = { ...product, sku };
  return {
    ...body,
    product: mergedProduct,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://")) return trimmed.replace(/\/+$/, "");
  if (trimmed.startsWith("http://"))
    return `https://${trimmed.slice("http://".length).replace(/\/+$/, "")}`;
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

async function callMagentoApi(
  baseUrl: string,
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/rest${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return parseApiResponse("Magento", response);
}

function extractProductInput(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.product;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...(nested as Record<string, unknown>) };
  }
  return { ...payload };
}

async function getNangoAccessToken(
  connectionId: string,
  providerConfigKey: string,
): Promise<string> {
  const response = await fetch(
    `https://api.nango.dev/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(providerConfigKey)}`,
    {
      headers: {
        Authorization: `Bearer ${NANGO_SECRET_KEY}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nango connection fetch failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const credentials = (data?.credentials || {}) as Record<string, unknown>;
  const token = pickString(credentials.access_token, credentials.token, credentials.apiKey);
  if (!token) {
    throw new Error("No usable token found in Nango connection credentials");
  }
  return token;
}

async function parseApiResponse(
  provider: string,
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown = {};

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    const details = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`${provider} API ${response.status} ${response.statusText}: ${details}`);
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return { data: parsed };
}
