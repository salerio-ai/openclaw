/**
 * AliExpress API Client via Supabase Edge Functions
 *
 * This client calls Supabase Edge Functions which:
 * - Keep ALIEXPRESS_APP_KEY and APP_SECRET secure (server-side env vars)
 * - Validate JWT tokens for authentication
 * - Verify workspace membership
 * - Retrieve the appropriate AliExpress account token from database
 * - Call AliExpress API and return results
 *
 * References Python implementations:
 * - agent_api/app/tools/source/aliexpress_text.py
 * - agent_api/app/tools/source/aliexpress_image.py
 */

import { config, validateConfig } from './config.js';

// Edge Function URLs (constructed from Supabase URL)
function getEdgeFunctionUrl(functionName: string): string {
  validateConfig();
  const supabaseUrl = config.supabaseUrl!.replace(/\/$/, '');
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

// =============================================================================
// Type Definitions
// =============================================================================

export interface SearchTextParams {
  query: string;
  locale?: string;
  country_code?: string;
  category_id?: string;
  sort_by?: string;
  page_size?: number;
  page_index?: number;
  currency?: string;
}

export interface SearchImageParams {
  image_url?: string;
  image_base64?: string;
  ship_to?: string;
  sort_type?: string;
  sort_order?: string;
  currency?: string;
  search_type?: string;
}

export interface AliExpressProduct {
  product_id: string;
  title: string;
  url: string;
  image_url: string;
  price: {
    current: string;
    original: string;
    currency: string;
    discount_percentage: string;
  };
  category: {
    primary_id: string;
    primary_name: string;
    secondary_id: string;
    secondary_name: string;
  };
  rating: string;
  sales_volume: string;
  shipping: {
    from_country: string;
  };
  similarity_score?: number;
  platform: string;
}

export interface EdgeFunctionResponse {
  success: boolean;
  source: string;
  request_id?: string;
  total_count: number;
  page_size?: number;
  page_index?: number;
  products: AliExpressProduct[];
}

interface EdgeFunctionError {
  error: string;
}

// =============================================================================
// Edge Function Client
// =============================================================================

/**
 * Call an AliExpress edge function
 */
async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, any>
): Promise<T> {
  validateConfig();

  const url = getEdgeFunctionUrl(functionName);
  const requestBody = {
    ...body,
    workspace_id: config.workspaceId,
    access_token: config.supabaseToken,
  };

  console.log(`Calling edge function: ${functionName}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.supabaseToken}`,
      'apikey': config.supabaseAnonKey!,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Edge function HTTP error: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  const result = await response.json();

  // Check for error responses
  if ('error' in result) {
    throw new Error((result as EdgeFunctionError).error);
  }

  return result as T;
}

/**
 * Format price for display
 */
function formatPrice(currency: string, amount: string): string {
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

/**
 * Convert edge function product format to skill format
 */
function convertProduct(product: AliExpressProduct): AliExpressProduct {
  return product;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Search AliExpress products by text
 *
 * Calls the aliexpress-text-search edge function which:
 * 1. Validates JWT token
 * 2. Verifies workspace membership
 * 3. Gets AliExpress account for workspace
 * 4. Calls AliExpress text search API
 * 5. Returns formatted products
 */
export async function searchTextProducts(
  params: SearchTextParams
): Promise<AliExpressProduct[]> {
  const {
    query,
    locale = 'en_US',
    country_code = 'US',
    category_id = '',
    sort_by = 'orders,desc',
    page_size = 20,
    page_index = 1,
    currency = 'USD',
  } = params;

  if (!query || !query.trim()) {
    throw new Error('Query parameter is required');
  }

  try {
    const result = await callEdgeFunction<EdgeFunctionResponse>(
      'aliexpress-text-search',
      {
        query,
        locale,
        country_code,
        category_id,
        sort_by,
        page_size,
        page_index,
        currency,
      }
    );

    console.log(
      `Text search successful: ${result.total_count} products found`
    );

    return result.products.map(convertProduct);
  } catch (error) {
    throw new Error(
      `Text search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Search AliExpress products by image
 *
 * Calls the aliexpress-image-search edge function which:
 * 1. Validates JWT token
 * 2. Verifies workspace membership
 * 3. Gets AliExpress account for workspace
 * 4. Processes image (from URL or base64)
 * 5. Calls AliExpress image search API
 * 6. Returns formatted products with similarity scores
 *
 * @param params - Search parameters, either image_url or image_base64 is required
 */
export async function searchImageProducts(
  params: SearchImageParams
): Promise<AliExpressProduct[]> {
  const {
    image_url,
    image_base64,
    ship_to = 'US',
    sort_type = 'orders',
    sort_order = 'desc',
    currency = 'USD',
    search_type = 'similar',
  } = params;

  // Validate that either image_url or image_base64 is provided
  if ((!image_url || !image_url.trim()) && (!image_base64 || !image_base64.trim())) {
    throw new Error('Either image_url or image_base64 parameter is required');
  }

  try {
    const body: Record<string, any> = {
      ship_to,
      sort_type,
      sort_order,
      currency,
      search_type,
    };

    // Add either image_url or image_base64 to request body
    if (image_base64 && image_base64.trim()) {
      body.image_base64 = image_base64;
    } else if (image_url && image_url.trim()) {
      body.image_url = image_url;
    }

    const result = await callEdgeFunction<EdgeFunctionResponse>(
      'aliexpress-image-search',
      body
    );

    console.log(
      `Image search successful: ${result.total_count} products found`
    );

    return result.products.map(convertProduct);
  } catch (error) {
    throw new Error(
      `Image search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get AliExpress accounts for current workspace
 *
 * This queries the database directly (service role) for debugging/admin purposes.
 * For normal use, the edge functions handle account lookup.
 */
export async function getAliExpressAccounts() {
  validateConfig();

  const supabaseUrl = config.supabaseUrl!.replace(/\/$/, '');

  // First, get the AliExpress account mapping for this workspace
  const mappingResponse = await fetch(
    `${supabaseUrl}/rest/v1/workspace_aliexpress_mappings?workspace_id=eq.${config.workspaceId}&status=eq.1&select=*`,
    {
      method: 'GET',
      headers: {
        'apikey': config.supabaseAnonKey!,
        'Authorization': `Bearer ${config.supabaseToken}`,
      },
    }
  );

  if (!mappingResponse.ok) {
    throw new Error(`Failed to query workspace mappings: ${mappingResponse.statusText}`);
  }

  const mappings = await mappingResponse.json();

  if (!mappings || mappings.length === 0) {
    return {
      workspace_id: config.workspaceId,
      accounts: [],
      message: 'No AliExpress accounts found for this workspace',
    };
  }

  // Note: We cannot query aliexpress_accounts table directly due to RLS
  // (only service role can access it)
  return {
    workspace_id: config.workspaceId,
    mappings: mappings.map((m: any) => ({
      aliexpress_account_id: m.aliexpress_account_id,
      account_id: m.account_id,
      account_name: m.account_name,
      shop_name: m.shop_name,
      status: m.status,
    })),
  };
}

/**
 * Test if access token is valid
 */
export async function testAccessToken() {
  validateConfig();

  const supabaseUrl = config.supabaseUrl!.replace(/\/$/, '');

  // Test token by calling Supabase auth user endpoint
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.supabaseToken}`,
      'apikey': config.supabaseAnonKey!,
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
    message: 'Access token is valid.',
  };
}
