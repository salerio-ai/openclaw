# Multi-Platform Support Upgrade Summary

## Overview

The `bustly-search-data` skill has been upgraded to support automatic detection and querying of multiple e-commerce platforms. Previously, it was hardcoded to only query Shopify data.

## What Changed

### Problem
- **Before**: All preset functions in `presets.ts` were hardcoded to query Shopify tables only
- **Example**: `getRecentOrders()` only returned `semantic.dm_orders_shopify` data
- **Limitation**: Users with multiple platforms (Shopify + BigCommerce + WooCommerce) couldn't get unified data

### Solution
- **After**: New `presets-v2.ts` with automatic platform detection
- **Example**: `getRecentOrders()` now queries ALL connected platforms and aggregates results
- **Benefit**: Works with any combination of Shopify, BigCommerce, WooCommerce, Magento, Google Ads

## New Features

### 1. Automatic Platform Detection (`data-source-detector.ts`)

```typescript
import { detectAvailablePlatforms } from './lib/data-source-detector'

// Automatically detects which platforms are connected
const platforms = await detectAvailablePlatforms()
// Returns: [
//   { name: 'Shopify', suffix: 'shopify', hasOrders: true, ... },
//   { name: 'BigCommerce', suffix: 'bigcommerce', hasOrders: true, ... }
// ]
```

### 2. Cross-Platform Queries

All preset functions now support multi-platform queries:

```typescript
import { getRecentOrders } from './lib/presets-v2'

// Returns orders from ALL platforms
const orders = await getRecentOrders(10)
// Each order has a 'platform' field:
// [
//   { platform: 'Shopify', order_id: '123', ... },
//   { platform: 'BigCommerce', order_id: '456', ... }
// ]
```

### 3. Dynamic Data Catalog

```typescript
import { getDataCatalog } from './lib/presets-v2'

// Dynamically builds catalog from available tables
const catalog = await getDataCatalog()
// Only includes platforms that are actually connected
```

### 4. Platform Summary API

```typescript
import { getConnectedPlatformsSummary } from './lib/presets-v2'

const summary = await getConnectedPlatformsSummary()
// Returns overview of all connected platforms
```

## Files Created

1. **`lib/data-source-detector.ts`** - Core platform detection logic
   - Detects available platforms from Supabase tables
   - Maps table names to platform names
   - Provides helper functions for dynamic queries

2. **`lib/presets-v2.ts`** - Multi-platform query presets
   - Replaces hardcoded Shopify queries
   - Aggregates data from all platforms
   - Backward compatible (works with single platform too)

3. **`scripts/test-platform-detection.ts`** - Test script
   - Validates platform detection
   - Tests all preset functions
   - Run with: `npm run test:platforms`

4. **`MULTI_PLATFORM_GUIDE.md`** - Usage documentation
   - API reference
   - Code examples
   - Migration guide

5. **`CHANGELOG.md`** - Version history

## Updated Files

1. **`skill.md` & `SKILL.md`** - Added multi-platform support description
2. **`package.json`** - Updated to v0.3.0, added new scripts

## Backward Compatibility

The old `presets.ts` is preserved. New code should use `presets-v2.ts`:

```typescript
// Old (still works but Shopify-only)
import { getRecentOrders } from './lib/presets'

// New (recommended - multi-platform)
import { getRecentOrders } from './lib/presets-v2'
```

## Testing

To test the multi-platform functionality:

```bash
cd skills/bustly-search-data

# Test platform detection
npm run test:platforms

# Get shop info from all platforms
npm run shop:info

# Get recent orders from all platforms
npm run orders:recent

# Get platform summary
npm run platforms:summary
```

## Platform Support Matrix

| Platform      | Orders | Products | Customers | Shop Info | Status |
|--------------|--------|----------|-----------|-----------|--------|
| Shopify       | ✓      | ✓        | ✓         | ✓         | Fully Supported |
| BigCommerce   | ✓      | ✓        | ✓         | ✓         | Fully Supported |
| WooCommerce   | ✓      | ✓        | ✓         | ✓         | Fully Supported |
| Magento       | ✓      | ✓        | ✓         | ✓         | Fully Supported |
| Google Ads    | ✓      | -        | -         | -         | Campaigns Only |

## Next Steps

1. **Test in production**: Verify with real multi-platform workspaces
2. **Monitor performance**: Check UNION query performance with large datasets
3. **Add error handling**: Improve handling of platform-specific errors
4. **User feedback**: Collect feedback on aggregated data format

## Migration Example

**User asks**: "Show me my recent orders"

**Old behavior**:
- Returns 10 most recent Shopify orders
- Ignores BigCommerce, WooCommerce, Magento data

**New behavior**:
- Detects all connected platforms
- Returns 10 most recent orders across ALL platforms
- Each result labeled with platform name
- Sorted by date, unified format

## Performance Notes

- Platform detection results are **cached** for performance
- Each platform query runs in **parallel** where possible
- UNION queries are optimized to only include available tables
- No performance impact for single-platform users

## Questions?

Refer to:
- `MULTI_PLATFORM_GUIDE.md` for detailed usage examples
- `lib/data-source-detector.ts` for platform detection logic
- `lib/presets-v2.ts` for query implementation
