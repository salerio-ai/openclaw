---
name: bustly-mock-data
description: Intelligently generate realistic mock data for e-commerce and advertising platforms. Analyzes existing data patterns and generates correlated test data with business logic integrity for Shopify, BigCommerce, WooCommerce, Magento, and Google Ads.
metadata: {"openclaw":{"always":true,"requires":{"env":["SEARCH_DATA_SUPABASE_URL","SEARCH_DATA_SUPABASE_ANON_KEY","SEARCH_DATA_SUPABASE_ACCESS_TOKEN","SEARCH_DATA_WORKSPACE_ID"]}}}
---

This skill generates intelligent mock data for e-commerce SaaS platforms, writing to the same Supabase data warehouse used by bustly-search-data.

## Quick Start

### Generate Mock Data (Smart Mode)
```bash
npm run generate -- shopify smart
```

### Check Data Status
```bash
npm run status
```

### Clean Mock Data
```bash
npm run clean -- shopify
```

## Configuration

This skill requires two configuration sources:

### 1. Base Configuration (shared with bustly-search-data)
Read from `~/.bustly/bustlyOauth.json` (Bustly OAuth login state):
- `SEARCH_DATA_SUPABASE_URL` - Supabase API URL
- `SEARCH_DATA_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SEARCH_DATA_SUPABASE_ACCESS_TOKEN` - Supabase session access token
- `SEARCH_DATA_WORKSPACE_ID` - Workspace identifier

### 2. Service Role Keys (mock data specific)
Create `config/supabase.json`:

```json
{
  "staging": {
    "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key-here",
    "SUPABASE_URL": "https://xxx-staging.supabase.co"
  },
  "production": {
    "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key-here",
    "SUPABASE_URL": "https://xxx-production.supabase.co"
  },
  "defaultEnv": "staging"
}
```

**Security:** Service role keys have full write access. Never commit `config/supabase.json` to git.

## Supported Platforms

### E-commerce Platforms
- **Shopify** - 7 tables: shop_info, orders, order_items, products, variants, customers, pixel_events
- **BigCommerce** - 6 tables: shop_info, products, variants, customers, orders, order_items
- **WooCommerce** - 6 tables: shop_info, products, variants, customers, orders, order_items
- **Magento** - 6 tables: shop_info, products, variants, customers, orders, order_items

### Advertising Platforms
- **Google Ads** - 5 tables: ads_campaigns, ads_products, ads_keywords, ads_search_terms, ads_creatives

## Generation Strategies

### Smart Mode (Recommended)
Analyzes existing data and intelligently scales:
- Current data < 50 records: Generate 5× more
- Current data 50-200: Generate 2× more
- Current data > 200: Add 20% more

Uses real-time analysis of:
- Price distributions and percentiles
- Customer-product affinities
- Conversion funnels (pixel events)
- Temporal patterns (peak hours, seasonality)

### Minimal Mode
Generate ~10 records per table for quick testing.

### Comprehensive Mode
Generate ~500 records per table for complete scenarios.

## Data Realism Features

- **Foreign Key Integrity**: All orders reference valid products and customers
- **Business Logic**: Order totals match sum of order items
- **Conversion Funnels**: Pixel events follow realistic ratios (view 5-10× purchase)
- **Time Patterns**: Orders follow historical temporal patterns
- **Cross-Platform**: Ad conversions link to e-commerce orders

## Safety Features

- **Transaction Protection**: All operations wrapped in rollback-safe transactions
- **Workspace Isolation**: Only affects current workspace
- **Confirmation Required**: Clean operations require explicit confirmation
- **Dry Run Mode**: Preview what would be generated without inserting

## Usage Examples

### Generate Shopify test data
```bash
npm run generate -- shopify smart
```

### Generate data for all platforms
```bash
npm run generate -- all smart
```

### Force specific quantity
```bash
npm run generate -- shopify smart --count 100
```

### Check current data status
```bash
npm run status
```

### Clean Shopify mock data
```bash
npm run clean -- shopify --confirm
```

## Technical Details

- **Language**: TypeScript (ESM)
- **Runtime**: Node.js 22+
- **Database**: Supabase PostgreSQL via REST API
- **Analysis**: Real-time statistical analysis of existing data
- **Generation**: Probabilistic generation based on observed distributions
- **Batching**: 100 records per batch for performance
- **Retry**: Automatic retry with exponential backoff (max 3 attempts)

## Agent Tools

### generate_mock_data
Generate mock data for specified platforms.

### get_mock_data_status
View current data status across platforms.

### clean_mock_data
Clean up generated mock data (requires confirmation).
