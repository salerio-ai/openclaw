# Multi-Platform Data Query Guide

This guide explains how to use the `bustly-search-data` skill with multiple e-commerce platforms.

## Overview

The skill now supports automatic platform detection and can query data from:
- Shopify
- BigCommerce
- WooCommerce
- Magento
- Google Ads

When you ask a general question like "show me my recent orders", the skill will:
1. Detect which platforms are connected
2. Query across all available platforms
3. Aggregate the results in a unified format

## Usage Examples

### 1. Get Shop Information

Returns data from all connected platforms:

```typescript
import { getShopInfo } from './lib/presets-v2'

const shops = await getShopInfo()
// Returns:
// [
//   { platform: 'Shopify', shop_name: 'My Store', ... },
//   { platform: 'BigCommerce', shop_name: 'My BC Store', ... }
// ]
```

### 2. Get Recent Orders (All Platforms)

```typescript
import { getRecentOrders } from './lib/presets-v2'

const orders = await getRecentOrders(20)
// Returns recent orders from Shopify, BigCommerce, etc.
// Combined and sorted by date
```

### 3. Get Connected Platforms Summary

```typescript
import { getConnectedPlatformsSummary } from './lib/presets-v2'

const summary = await getConnectedPlatformsSummary()
// Returns:
// {
//   totalPlatforms: 3,
//   platforms: [
//     { name: 'Shopify', hasOrders: true, hasProducts: true, hasCustomers: true },
//     { name: 'BigCommerce', hasOrders: true, hasProducts: true, hasCustomers: true },
//     { name: 'Google Ads', hasOrders: false, hasProducts: false, hasCustomers: false }
//   ]
// }
```

### 4. Platform-Specific Queries

If you need to query a specific platform, you can use the table detection:

```typescript
import { getTableName } from './lib/data-source-detector'
import { runSelectQuery } from './lib/supabase_api'

// Get orders table name (will return Shopify, BigCommerce, etc.)
const ordersTable = await getTableName('orders')

// Query specific platform
const data = await runSelectQuery(`
  SELECT * FROM ${ordersTable}
  ORDER BY created_at DESC
  LIMIT 10
`)
```

## How Platform Detection Works

The skill uses the `data-source-detector.ts` module to:

1. **Query available tables** from Supabase using `get_agent_available_tables()`
2. **Match table names** to known platform patterns:
   - `semantic.dm_orders_shopify` → Shopify
   - `semantic.dm_orders_bigcommerce` → BigCommerce
   - `semantic.dm_orders_woocommerce` → WooCommerce
   - `semantic.dm_orders_magento` → Magento
3. **Cache detected platforms** for performance
4. **Build dynamic queries** that UNION results from all platforms

## API Reference

### `detectAvailablePlatforms()`

Detects all connected e-commerce platforms.

```typescript
const platforms = await detectAvailablePlatforms()
// Returns: DetectedPlatform[]
```

### `getPrimaryPlatform()`

Gets the primary platform (prefers Shopify, otherwise first available).

```typescript
const platform = await getPrimaryPlatform()
// Returns: DetectedPlatform | null
```

### `getOrderPlatforms()`

Gets all platforms that have order data.

```typescript
const platforms = await getOrderPlatforms()
// Returns: DetectedPlatform[]
```

### `getTableName(tableType, platformSuffix?)`

Gets the table name for a specific table type and platform.

```typescript
const ordersTable = await getTableName('orders', 'shopify')
// Returns: 'semantic.dm_orders_shopify' or null
```

## Migration from Old Presets

If you were using `presets.ts` (Shopify-only), here's how to migrate:

**Old (presets.ts)**:
```typescript
import { getRecentOrders } from './lib/presets'
const orders = await getRecentOrders(10) // Only Shopify
```

**New (presets-v2.ts)**:
```typescript
import { getRecentOrders } from './lib/presets-v2'
const orders = await getRecentOrders(10) // All platforms
```

The new version is backward compatible - it will work even if only Shopify is connected.

## Error Handling

The skill handles missing platforms gracefully:

```typescript
// If WooCommerce tables don't exist, they're skipped
// Query continues with available platforms (Shopify, BigCommerce, etc.)
const orders = await getRecentOrders(10)
```

## Performance Considerations

- Platform detection results are **cached** after first call
- Use `clearPlatformCache()` if you need to refresh the cache
- UNION queries are optimized to only include available tables
- Each platform query runs in parallel where possible

## Testing

To test with multiple platforms:

```bash
# Check which platforms are detected
npm run get_platforms

# Get shop info from all platforms
npm run shop:info

# Get recent orders from all platforms
npm run orders:recent
```
