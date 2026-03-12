import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const NANGO_SECRET_KEY = requiredEnv("NANGO_SECRET_KEY");

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Platform = "bigcommerce" | "woocommerce" | "magento";
type NormalizedOperation = "create" | "update" | "upsert" | "delete" | "inventory_adjust";

interface DirectWriteRequest {
  action: string;
  platform: string;
  operation: string;
  resource?: string;
  workspace_id?: string;
  workspaceId?: string;
  user_id?: string;
  userId?: string;
  request_id?: string;
  requestId?: string;
  idempotency_key?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}

interface ParsedRequest {
  platform: Platform;
  operation: NormalizedOperation;
  resource: "product";
  workspaceId: string;
  userId: string;
  requestId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

interface ConnectionContext {
  platform: Platform;
  workspaceId: string;
  integrationId: number | null;
  nangoConnectionId: string;
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

    const rawBody = (await req.json()) as DirectWriteRequest;
    const parsed = parseDirectWriteRequest(rawBody);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

function parseDirectWriteRequest(input: DirectWriteRequest): ParsedRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Request body must be an object");
  }
  if (String(input.action || "") !== "DIRECT_WRITE") {
    throw new Error("Only action=DIRECT_WRITE is supported");
  }

  const platform = normalizePlatform(input.platform);
  const operation = normalizeOperation(input.operation);
  const resource = normalizeResource(input.resource);

  const workspaceId = pickString(input.workspace_id, input.workspaceId);
  const userId = pickString(input.user_id, input.userId);
  const requestId = pickString(input.request_id, input.requestId, crypto.randomUUID());
  const idempotencyKey = pickString(input.idempotency_key, input.idempotencyKey, "");
  const payload = (input.payload || {}) as Record<string, unknown>;

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
  };
}

function normalizePlatform(value: unknown): Platform {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "bigcommerce" || normalized === "woocommerce" || normalized === "magento") {
    return normalized;
  }
  throw new Error("platform must be one of: bigcommerce, woocommerce, magento");
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

  throw new Error("operation must be one of: create, update, upsert, delete, inventory_adjust");
}

function normalizeResource(value: unknown): "product" {
  const normalized = String(value || "product")
    .trim()
    .toLowerCase();
  if (normalized === "product" || normalized === "products") return "product";
  throw new Error("Only resource=product is supported");
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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
  if (platform === "bigcommerce") {
    return resolveBigCommerceContext(supabase, workspaceId);
  }
  if (platform === "woocommerce") {
    return resolveWooCommerceContext(supabase, workspaceId);
  }
  return resolveMagentoContext(supabase, workspaceId);
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
  const mapping = await fetchActiveMapping(supabase, "workspace_magento_mappings", workspaceId);
  const integrationId = parseNumber(mapping.integration_id);

  const nangoConnectionId = await resolveNangoConnectionId(
    supabase,
    workspaceId,
    "magento",
    mapping,
    integrationId,
  );

  let magentoBaseUrl = pickString(mapping.base_url, mapping.site_url, mapping.store_url);
  let magentoStoreId = pickString(mapping.store_id);

  const magentoAccountId = pickString(mapping.magento_account_id);
  if ((!magentoBaseUrl || !magentoStoreId) && magentoAccountId) {
    const account = await fetchMagentoAccount(supabase, magentoAccountId);
    magentoBaseUrl =
      magentoBaseUrl || pickString(account.base_url, account.site_url, account.store_url);
    magentoStoreId = magentoStoreId || pickString(account.store_id, account.site_id);
  }

  if (!magentoBaseUrl) {
    throw new Error("Unable to resolve Magento base URL from mapping/account");
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
  if (context.platform === "bigcommerce") {
    return writeBigCommerceProduct(context, request.operation, request.payload);
  }
  if (context.platform === "woocommerce") {
    return writeWooCommerceProduct(context, request.operation, request.payload);
  }
  return writeMagentoProduct(context, request.operation, request.payload);
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
): Promise<Record<string, unknown>> {
  const url = `https://api.bigcommerce.com/stores/${storeHash}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "X-Auth-Token": accessToken,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
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
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.nango.dev/proxy${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NANGO_SECRET_KEY}`,
      "Provider-Config-Key": "woocommerce",
      "Connection-Id": connectionId,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
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
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/rest${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
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
