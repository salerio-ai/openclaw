# Changelog

All notable changes to the `bustly-search-data` skill will be documented in this file.

## [0.3.0] - 2026-02-10

### Added - Multi-Platform Support

#### New Features

- **Automatic Platform Detection**: The skill now automatically detects which e-commerce platforms are connected (Shopify, BigCommerce, WooCommerce, Magento, Google Ads)
- **Cross-Platform Queries**: All preset functions now query across all available platforms and aggregate results
- **Dynamic Data Catalog**: `getDataCatalog()` now dynamically detects available tables instead of returning a hardcoded list
- **Platform Summary API**: New `getConnectedPlatformsSummary()` function to get an overview of all connected platforms

#### New Files

- `lib/data-source-detector.ts` - Core platform detection and table mapping logic
- `lib/presets-v2.ts` - Multi-platform query presets (replaces the old Shopify-only presets.ts)
- `scripts/test-platform-detection.ts` - Test script for platform detection
- `MULTI_PLATFORM_GUIDE.md` - Comprehensive guide for multi-platform usage

#### API Changes

**Before (Shopify-only)**:
```typescript
import { getRecentOrders } from './lib/presets'
const orders = await getRecentOrders(10) // Only Shopify orders
```

**After (Multi-platform)**:
```typescript
import { getRecentOrders } from './lib/presets-v2'
const orders = await getRecentOrders(10) // Orders from ALL connected platforms
```

#### Updated Presets

All preset functions now support multi-platform queries:
- `getShopInfo()` - Returns shop info from all connected platforms
- `getRecentOrders()` - Aggregates orders from all platforms with platform labels
- `getDailySalesSummary()` - Aggregates sales data across all platforms
- `getTopProductsByRevenue()` - Ranks products across all platforms
- `getTopCustomers()` - Ranks customers across all platforms
- `getInventoryStatus()` - Aggregates inventory from all platforms
- `getRevenueByCategory()` - Aggregates category data across all platforms

#### Backward Compatibility

The old `presets.ts` file is preserved for backward compatibility, but new usage should use `presets-v2.ts`.

#### Performance Improvements

- Platform detection results are cached after first call
- UNION queries only include available tables
- Each platform query runs in parallel where possible

## [0.2.0] - Previous

### Features

- Shopify data query support
- Google Ads campaigns support
- BigCommerce basic support
- Preset query functions
- Supabase RPC integration

## [0.1.0] - Initial Release

### Features

- Basic Supabase connection
- Manual SQL query execution
- Table schema inspection
