---
name: bustly-search-data
description: Query e-commerce business data from Shopify, Google Ads, BigCommerce, WooCommerce, and Magento via Supabase data warehouse. Use when users ask about shop performance, sales data, orders, customers, products, revenue summaries, business reports, annual summaries, or any questions about their e-commerce store data or business metrics.
metadata: {"openclaw":{"always":true,"requires":{"env":["SEARCH_DATA_SUPABASE_URL","SEARCH_DATA_SUPABASE_ANON_KEY","SEARCH_DATA_SUPABASE_ACCESS_TOKEN","SEARCH_DATA_WORKSPACE_ID"]}}}
---

This skill provides e-commerce SaaS data query capabilities, reading business data from platforms like Shopify, BigCommerce, WooCommerce, Magento, and Google Ads via a Supabase data warehouse.

**Text2SQL Approach**: This skill provides real-time DDL schema detection and SQL execution capabilities. Use your text-to-SQL capabilities to generate queries dynamically based on actual table structures. **Do not rely on preset query functions - always write SQL based on discovered schema.**

## When to Use This Skill

**Always use this skill when users ask questions related to:**

- Shop/store performance, data, or metrics
- Sales summaries, revenue reports, or business analytics
- Orders, customers, products, or inventory information
- Google Ads performance, campaigns, or advertising data
- Any queries about e-commerce business operations or metrics
- Time-based reports (daily, weekly, monthly, yearly summaries)

**Common user queries:**
- "How is my shop doing?" / "What are my business metrics?"
- "Give me a 2025 summary" / "Shop performance for 2025"
- "How are my recent orders?" / "What's the sales data?"
- "Which products are selling best?" / "Top customers"
- "How are my ads performing?" / "Google Ads data"

## Core Workflow

### 1. Discover Available Platforms
```bash
npm run platforms
```

Shows which e-commerce and advertising platforms have data.

### 2. Discover Available Tables
```bash
npm run get_tables
```

Returns all accessible tables across platforms.

### 3. Inspect Table Schema
```bash
npm run get_schema -- semantic.dm_orders_shopify
```

**CRITICAL**: Always inspect schema before writing queries. Different platforms use different column names:
- Shopify: `total_price`, `shop_name`
- BigCommerce: `total_inc_tax`, `store_name`
- WooCommerce: `total`, `site_name`
- Magento: `total_inc_tax`, `store_name`

### 4. Execute SQL Query
```bash
npm run query -- "SELECT * FROM semantic.dm_orders_shopify WHERE created_at >= '2025-01-01' LIMIT 10"
```

Supports CTEs (WITH), JOINs, UNIONs, aggregates, etc.

## Platform Types

### E-commerce Platforms
- **Shopify**: Orders, products, customers, variants
- **BigCommerce**: Orders, products, customers, variants
- **WooCommerce**: Orders, products, customers, variants
- **Magento**: Orders, products, customers, variants

### Advertising Platforms
- **Google Ads**: Campaigns, keywords, search terms, creatives

## Data Tables

### E-commerce (Shopify, BigCommerce, WooCommerce, Magento)

**Shop Info**:
- `semantic.dm_shop_info_<platform>` - Store settings, currency, timezone

**Orders**:
- `semantic.dm_orders_<platform>` - Order records with totals, dates, status
- `semantic.dm_order_items_<platform>` - Line items with products, quantities, prices

**Catalog**:
- `semantic.dm_products_<platform>` - Product catalog
- `semantic.dm_variants_<platform>` - Product variants (SKU, inventory, pricing)

**Customers**:
- `semantic.dm_customers_<platform>` - Customer records with email, orders count, lifetime value

### Advertising (Google Ads)

- `semantic.dm_ads_campaigns_google` - Campaign performance (impressions, clicks, cost, conversions)
- `semantic.dm_ads_products_google` - Product-level metrics
- `semantic.dm_ads_keywords_google` - Keyword performance
- `semantic.dm_search_terms_google` - Search term reports
- `semantic.dm_ads_creatives_google` - Creative performance

## Programming API

```typescript
import {
  // Core API
  getAvailableTables,
  getTableSchema,
  runSelectQuery,

  // Platform detection
  detectAvailablePlatforms,
  getEcommercePlatforms,
  getAdvertisingPlatforms,

  // Schema helpers (handle platform differences)
  COLUMN_PATTERNS,
  findColumnByPattern
} from './lib/presets'

// Step 1: Detect platforms
const platforms = await detectAvailablePlatforms()

// Step 2: Get schema for a table
const schema = await getTableSchema('semantic.dm_orders_shopify')
// Returns: [{ column_name, data_type, is_nullable, description }, ...]

// Step 3: Find columns by pattern (handles platform differences)
const priceCol = findColumnByPattern(schema, COLUMN_PATTERNS.totalPrice)
// Automatically finds: total_price, total_inc_tax, grand_total, amount, etc.

// Step 4: Execute SQL
const results = await runSelectQuery('SELECT * FROM semantic.dm_orders_shopify LIMIT 10')
```

## Cross-Platform Query Patterns

### 1. Single Platform Query
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as orders,
  SUM(total_price) as revenue
FROM semantic.dm_orders_shopify
WHERE created_at >= '2025-01-01'
GROUP BY DATE(created_at)
ORDER BY date DESC
```

### 2. Multi-Platform UNION
```sql
WITH all_orders AS (
  SELECT 'Shopify' as platform, created_at, total_price
  FROM semantic.dm_orders_shopify
  WHERE created_at >= '2025-01-01'

  UNION ALL

  SELECT 'BigCommerce' as platform, created_at, total_inc_tax as total_price
  FROM semantic.dm_orders_bigcommerce
  WHERE created_at >= '2025-01-01'
)
SELECT
  platform,
  COUNT(*) as orders,
  SUM(total_price) as revenue
FROM all_orders
GROUP BY platform
```

### 3. Handle Different Column Names
```typescript
// Use COLUMN_PATTERNS to find equivalent columns
import { COLUMN_PATTERNS, findColumnByPattern, getTableSchema } from './lib/presets'

const schema = await getTableSchema('semantic.dm_orders_bigcommerce')
const priceCol = findColumnByPattern(schema, COLUMN_PATTERNS.totalPrice)
// Returns: { actualColumn: 'total_inc_tax', dataType: 'numeric' }
```

## Technical Features

- ✅ Real-time DDL schema detection
- ✅ Platform type detection (ecommerce vs advertising)
- ✅ Pattern-based column matching for cross-platform queries
- ✅ Automatic retry (exponential backoff, max 3 attempts)
- ✅ Request timeout control (30 seconds)
- ✅ CTEs (WITH), JOINs, UNIONs supported
- ✅ Security: Only SELECT queries allowed

## Important Notes

1. **Always inspect schema first** - Different platforms use different column names
2. **Use pattern matching** - COLUMN_PATTERNS helps find equivalent columns across platforms
3. **Handle missing columns** - Use COALESCE or skip when columns don't exist
4. **Query with date ranges** - Use WHERE clauses on created_at/date columns for performance
5. **All queries are read-only** - Only SELECT queries allowed for data safety
6. **Platform types matter** - E-commerce tables are different from advertising tables
