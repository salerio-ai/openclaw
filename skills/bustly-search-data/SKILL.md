---
name: bustly-search-data
description: E-commerce data query skill for Shopify, Google Ads, BigCommerce, WooCommerce, Magento, and other platforms. Supports common query templates, automatic retry, and multiple output formats.
metadata: {"openclaw":{"always":true,"requires":{"env":["SEARCH_DATA_SUPABASE_URL","SEARCH_DATA_SUPABASE_ANON_KEY","SEARCH_DATA_SUPABASE_ACCESS_TOKEN","SEARCH_DATA_WORKSPACE_ID"]}}}
---

This skill provides e-commerce SaaS data query capabilities, reading business data from platforms like Shopify, Google Ads, BigCommerce, WooCommerce, and Magento via a Supabase data warehouse.

## Quick Start

### View Available Tables
```bash
npm run get_tables
```

### View Table Schema
```bash
npm run get_schema -- semantic.dm_orders_shopify
```

### Execute SQL Query
```bash
npm run query -- "SELECT * FROM semantic.dm_orders_shopify LIMIT 10"
```

## Common Query Commands (Presets)

### Shop Information
```bash
npm run shop:info
```

### Recent Orders
```bash
npm run orders:recent
```

### Daily Sales Summary (Last 30 Days)
```bash
npm run orders:summary
```

### Top Selling Products (Top 10)
```bash
npm run products:top
```

### Top Customers (Top 10)
```bash
npm run customers:top
```

### Google Ads Performance
```bash
npm run ads:campaigns
```

### View All Available Tables
```bash
npm run catalog
```

## Configuration

This skill reads configuration from `~/.bustly/bustlyOauth.json` (automatically configured via Bustly OAuth login).

No manual configuration is required. After logging in via Bustly OAuth in the desktop app, the skill will have access to:

- `SEARCH_DATA_SUPABASE_URL` - Supabase API URL
- `SEARCH_DATA_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SEARCH_DATA_SUPABASE_ACCESS_TOKEN` - Supabase session access token
- `SEARCH_DATA_WORKSPACE_ID` - Workspace identifier

## Available Data Tables

### Shopify
- `semantic.dm_shop_info_shopify` - Shop information
- `semantic.dm_orders_shopify` - Order data
- `semantic.dm_order_items_shopify` - Order line items
- `semantic.dm_products_shopify` - Product information
- `semantic.dm_variants_shopify` - Product variants
- `semantic.dm_customers_shopify` - Customer information
- `semantic.dm_shopify_pixel_events` - Pixel tracking events

### Google Ads
- `semantic.dm_ads_campaigns_google` - Campaign performance
- `semantic.dm_ads_products_google` - Product-level data
- `semantic.dm_ads_keywords_google` - Keyword performance
- `semantic.dm_ads_search_terms_google` - Search term reports
- `semantic.dm_ads_creatives_google` - Creative performance

### BigCommerce
- `semantic.dm_shop_info_bigcommerce` - Shop information
- `semantic.dm_products_bigcommerce` - Product information
- `semantic.dm_variants_bigcommerce` - Product variants
- `semantic.dm_customers_bigcommerce` - Customer information
- `semantic.dm_orders_bigcommerce` - Order data
- `semantic.dm_order_items_bigcommerce` - Order line items

### WooCommerce
- `semantic.dm_shop_info_woocommerce` - Shop information
- `semantic.dm_products_woocommerce` - Product information
- `semantic.dm_variants_woocommerce` - Product variants
- `semantic.dm_customers_woocommerce` - Customer information
- `semantic.dm_orders_woocommerce` - Order data
- `semantic.dm_order_items_woocommerce` - Order line items

### Magento
- `semantic.dm_shop_info_magento` - Shop information
- `semantic.dm_products_magento` - Product information
- `semantic.dm_variants_magento` - Product variants
- `semantic.dm_customers_magento` - Customer information
- `semantic.dm_orders_magento` - Order data
- `semantic.dm_order_items_magento` - Order line items

## Output Formats

Control output format using the `FORMAT` environment variable:

```bash
# JSON output (default)
FORMAT=json npm run query -- "SELECT * FROM orders LIMIT 5"

# ASCII table
FORMAT=table npm run query -- "SELECT * FROM orders LIMIT 5"

# CSV format
FORMAT=csv npm run query -- "SELECT * FROM orders LIMIT 5"
```

## Programming API (Lib)

You can use presets directly in code:

```typescript
import {
  getShopInfo,
  getRecentOrders,
  getDailySalesSummary,
  getTopProductsByRevenue,
  getTopCustomers,
  formatCurrency,
  formatDate
} from './lib/presets'

// Get shop information
const shop = await getShopInfo()

// Get recent 10 orders
const orders = await getRecentOrders(10)

// Get daily sales summary
const summary = await getDailySalesSummary(30)

// Top selling products
const products = await getTopProductsByRevenue(10, 30)

// Top customers
const customers = await getTopCustomers(10)

// Format currency
formatCurrency(123.45) // "$123.45"

// Format date
formatDate('2026-03-25T15:10:00Z') // "Mar 25, 2026, 03:10 PM"
```

## Technical Features

- ✅ Automatic retry (exponential backoff, max 3 attempts)
- ✅ Request timeout control (30 seconds)
- ✅ Multiple output formats (JSON/table/CSV)
- ✅ Common query templates (Presets)
- ✅ TypeScript type support
- ✅ Detailed logging
- ✅ Security: Only SELECT queries allowed

## Important Notes

1. All queries are **read-only** (SELECT) to ensure data safety
2. Pay attention to **currency field** handling (different shops may have different currencies)
3. Consider **timezone conversion** (use `iana_timezone` field)
4. Use **LIMIT** and pagination for large datasets to avoid performance issues
5. Re-authentication may be required when token expires
