---
name: shopify-api
description: Call Shopify Admin GraphQL via the shopify-api edge function. Use for write operations (mutations) or admin actions that must go through Shopify Admin GraphQL. For read-only analytics or reporting, use bustly-search-data instead.
metadata: {"openclaw":{"always":true}}
---

This skill provides a thin client for Shopify Admin GraphQL calls through the Supabase Edge Function `/functions/v1/shopify-api`.

## When to Use This Skill

Use **shopify-api** for **write** operations (mutations) or admin actions that must go through Shopify Admin GraphQL.

Use **bustly-search-data** for **read-only analytics, reporting, and business metrics** (orders, revenue, customers, products, etc).

## Request Body

```ts
interface RequestBody {
  workspace_id: string;
  endpoint: string; // Shopify GraphQL endpoint URL
  query: string;    // GraphQL query string
  variables?: Record<string, unknown>; // GraphQL variables
}
```

## Configuration

This skill reads configuration from `~/.bustly/bustlyOauth.json` (automatically configured via Bustly OAuth login).

Required fields (loaded from `bustlyOauth.json` or env vars):
- `SEARCH_DATA_SUPABASE_URL`
- `SEARCH_DATA_SUPABASE_ANON_KEY`
- `SEARCH_DATA_SUPABASE_ACCESS_TOKEN`
- `SEARCH_DATA_WORKSPACE_ID`

## Quick Start

### Run a GraphQL call
```bash
npm run graphql -- "https://your-store.myshopify.com/admin/api/2025-01/graphql.json" "mutation { shopUpdate(input: { name: \"New Name\" }) { shop { id name } userErrors { field message } } }"
```

### Use a query file + variables
```bash
npm run graphql -- "https://your-store.myshopify.com/admin/api/2025-01/graphql.json" --file ./query.graphql --vars '{"first":10}'
```

## Programming API

```ts
import { callShopifyAdminGraphql } from './lib/shopify_api'

const response = await callShopifyAdminGraphql({
  endpoint: 'https://your-store.myshopify.com/admin/api/2025-01/graphql.json',
  query: `mutation UpdateShop($input: ShopInput!) {
    shopUpdate(input: $input) {
      shop { id name }
      userErrors { field message }
    }
  }`,
  variables: {
    input: { name: 'New Name' },
  },
})
```

## Notes

- The edge function handles auth and workspace validation using your Supabase session.
- Prefer **bustly-search-data** for read-only queries and analytics.
- Use this skill primarily for mutations or admin actions that require Shopify Admin GraphQL.
