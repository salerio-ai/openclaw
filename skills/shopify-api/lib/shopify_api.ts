/**
 * Shopify Admin GraphQL client via Supabase Edge Function
 *
 * This client calls a Supabase Edge Function which:
 * - Validates JWT tokens for authentication
 * - Verifies workspace membership
 * - Calls Shopify Admin GraphQL on behalf of the workspace
 */

import { config, validateConfig } from './config.js';

function getEdgeFunctionUrl(): string {
  validateConfig();
  const supabaseUrl = config.supabaseUrl!.replace(/\/$/, '');
  return `${supabaseUrl}/functions/v1/shopify-api`;
}

export interface RequestBody {
  workspace_id: string;
  shopify_api_version?: string;
  query: string;
  variables?: Record<string, unknown>;
}

interface EdgeFunctionError {
  error: string;
}

export interface ShopifyGraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export interface ShopifyGraphQLResponse<TData = unknown> {
  data?: TData;
  errors?: ShopifyGraphQLError[];
  extensions?: Record<string, unknown>;
}

async function callEdgeFunction<T>(body: RequestBody): Promise<T> {
  validateConfig();

  const url = getEdgeFunctionUrl();
  const requestBody: RequestBody = {
    ...body,
    workspace_id: config.workspaceId!,
  };

  if (!requestBody.query || !requestBody.query.trim()) {
    throw new Error('query is required');
  }

  console.log('Calling edge function: shopify-api');

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

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as EdgeFunctionError).error);
  }

  return result as T;
}

export async function callShopifyAdminGraphql<TData = unknown>(
  params: Omit<RequestBody, 'workspace_id'>
): Promise<ShopifyGraphQLResponse<TData>> {
  return callEdgeFunction<ShopifyGraphQLResponse<TData>>({
    ...params,
    workspace_id: config.workspaceId!,
  });
}
