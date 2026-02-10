# Bustly Mock Data Skill - Design Document

**Date:** 2026-02-09
**Author:** Design Session with Claude
**Status:** Design Approved

## Overview

`bustly-mock-data` is an OpenClaw skill that intelligently generates mock data for e-commerce and advertising platforms. It analyzes existing data patterns and generates realistic, correlated test data that maintains business logic integrity.

### Key Features

- **Intelligent Analysis**: Real-time analysis of existing data patterns (distribution, associations, funnels)
- **Business Logic Awareness**: Generates data respecting foreign keys, transaction flows, and platform-specific rules
- **High Realism**: Pixel events follow realistic conversion funnels; ad metrics match industry benchmarks
- **Complete Business Scenarios**: Generates entire data ecosystems (products → orders → pixels → ads) in one operation
- **Multi-Platform Support**: Shopify, BigCommerce, WooCommerce, Magento, Google Ads

### Target Users

- OpenClaw Agents (primary interface)
- Development teams needing test data
- QA teams for scenario testing
- Demo/presentation environment setup

## Architecture

### Five-Layer Architecture

```
┌─────────────────────────────────────────────┐
│   Agent Interface Layer (Tool Interface)    │  ← OpenClaw Agents call this
├─────────────────────────────────────────────┤
│        Data Analysis Layer                  │  ← Analyzes existing data patterns
├─────────────────────────────────────────────┤
│       Business Rules Layer                  │  ← Defines platform rules & constraints
├─────────────────────────────────────────────┤
│       Data Generation Layer                 │  ← Generates mock data
├─────────────────────────────────────────────┤
│     Supabase Interface Layer                │  ← Database operations
└─────────────────────────────────────────────┘
```

## Layer 1: Agent Interface Layer

### Core Tool: `generate_mock_data`

**Purpose:** Main entry point for OpenClaw Agents to generate mock data

**Parameters:**
- `platform` (enum): Target platform - "shopify" | "bigcommerce" | "woocommerce" | "magento" | "google_ads" | "all"
- `strategy` (enum): Generation approach
  - `"smart"`: Analyze existing data and intelligently scale (default)
  - `"minimal"`: Generate minimal dataset (~10 records)
  - `"comprehensive"`: Generate comprehensive scenario (~500 records)
- `forceCount` (number, optional): Override intelligent analysis
- `env` (enum): Target environment - "staging" | "production"

**Return Value:**
```typescript
interface MockResult {
  success: boolean
  platforms: PlatformResult[]
  totalRecords: number
  summary: string
  warnings?: string[]
  executionTime: number
}
```

### Auxiliary Tools

**`get_mock_data_status`**: View current data status across platforms

**`clean_mock_data`**: Clean up mock data (requires confirmation)

## Layer 2: Data Analysis Layer

### Purpose: Understand existing data patterns before generation

### Components

**1. DataAnalyzer (Main Coordinator)**
- Entry point for all analysis operations
- `analyzeWorkspace()`: Analyze entire workspace
- `analyzePlatform(platform)`: Analyze specific platform
- Returns: `AnalysisReport` containing all analysis results

**2. ScaleAnalyzer (Scale Analysis)**
- Count records in each table
- Determine generation quantity:
  - < 50 records: ×5 multiplier
  - 50-200 records: ×2 multiplier
  - \> 200 records: +20% supplement
- Target range: 10-1000 records per table

**3. DistributionAnalyzer (Distribution Analysis)**
- Price distribution (p25, p50, p75, p90 percentiles)
- Order quantity patterns
- Date range and density
- Used to generate data with same distribution

**4. AssociationAnalyzer (Association Analysis)**
- Customer-product affinity (which customers buy which categories)
- Product popularity (which products appear most in orders)
- Order item count patterns
- Used to generate correlated data

**5. FunnelAnalyzer (Conversion Funnel Analysis)**
- Pixel events conversion rates (view → add_cart → purchase)
- Calculate ratios: view events typically 5-10× purchase events
- Identify unusual funnels
- Used to generate realistic pixel events

**6. PatternAnalyzer (Time Pattern Analysis)**
- Peak hours (e.g., 9am-6pm weekdays)
- Seasonal/cyclical patterns
- Order interval distribution
- Used to generate temporally realistic orders

### Analysis Report Structure

```typescript
interface AnalysisReport {
  platform: string
  timestamp: Date
  scales: Map<string, number>              // table → record count
  distributions: Map<string, Distribution> // column → distribution
  associations: AssociationMap             // entity relationships
  funnels: FunnelMetrics                   // conversion funnels
  patterns: TimePatterns                   // temporal patterns
}
```

## Layer 3: Business Rules Layer

### Purpose: Define platform-specific rules and constraints

### Platform Categorization

**Type A: E-commerce Platforms** (Shopify, BigCommerce, WooCommerce, Magento)
- Core entities: products, customers, orders
- Strong dependencies: orders → order_items → products
- Business logic: transaction flow, inventory, financial status
- Data characteristics: structured, relational

**Type B: Advertising Platforms** (Google Ads)
- Core entities: campaigns, keywords, search_terms, creatives
- Hierarchy: Campaign → AdGroup → Keyword/Creative
- Business logic: impressions, clicks, cost, conversions
- Data characteristics: metrics, time-series

### Platform Schema Definition

```typescript
interface PlatformSchema {
  name: string
  tables: TableSchema[]
  dependencies: DependencyGraph      // Table generation order
  businessRules: BusinessRule[]       // Platform-specific rules
  realityRules: RealityRule[]         // Realism constraints
}
```

### Dependency Graph Example (Shopify)

```typescript
{
  'orders': ['products', 'customers'],
  'order_items': ['orders', 'products'],
  'pixel_events': ['orders', 'products']
}
```

Generation order: `products, customers → orders → order_items → pixel_events`

### Business Rules Examples

```typescript
// Order calculation
{ rule: 'order.total = SUM(order_items.quantity * unit_price)' }

// Financial status enum
{ rule: 'order.financial_status ∈ ["paid", "pending", "refunded"]' }

// Pixel event ratios (reality rule)
{
  platform: 'shopify',
  table: 'pixel_events',
  rules: {
    eventCountRatio: {
      'page_view': { base: 'purchase', multiplier: [5, 10] },
      'add_to_cart': { base: 'purchase', multiplier: [2, 4] }
    },
    eventSequence: ['page_view', 'add_to_cart', 'purchase']
  }
}
```

## Layer 4: Data Generation Layer

### Purpose: Generate mock data based on analysis and rules

### Components

**1. DataGenerator (Main Generator)**
- `generateMockData(platform, analysisReport)`: Main entry point
- Generates tables in dependency order
- Coordinates sub-generators
- Returns generated data and insert results

**2. EcommerceGenerator (E-commerce Base Generator)**
```typescript
class EcommerceGenerator {
  generateProducts(count, analysis): Product[]
  generateCustomers(count, analysis): Customer[]
  generateOrders(count, products, customers, analysis): Order[]
  generateOrderItems(orders, products, analysis): OrderItem[]
  generatePixelEvents(orders, products, analysis): PixelEvent[]
}
```

**3. AdsGenerator (Advertising Generator)**
```typescript
class GoogleAdsGenerator extends AdsGenerator {
  generateCampaigns(count): Campaign[]
  generateAdGroups(campaigns): AdGroup[]
  generateKeywords(adGroups): Keyword[]
  generateSearchTerms(keywords): SearchTerm[]
  generateCreatives(adGroups): Creative[]
}
```

**4. AdsMetricsGenerator (Ad Metrics)**
```typescript
class AdsMetricsGenerator {
  generateImpressions(base, variance): number
  generateClicks(impressions, ctr): number      // clicks = impressions × CTR
  generateCost(clicks, cpc): number             // cost = clicks × CPC
  generateConversions(clicks, cvr): number      // conversions = clicks × CVR
  generateRevenue(conversions, aov): number     // revenue = conversions × AOV
}
```

**5. SmartValueGenerator (Intelligent Value Generation)**
```typescript
generatePrice(distribution): number      // Based on price distribution
generateDate(pattern): Date              // Based on time patterns
generateCategory(probability): string     // Based on category probability
generateStatus(transitions): string       // Based on status transition matrix
```

**6. DataValidator (Data Validation)**
- Validates required fields
- Validates foreign key references
- Validates business rules
- Batch validation optimization

**7. BatchProcessor (Batch Processing)**
- Generates in batches (100 records/batch)
- Inserts in batches (avoid oversized requests)
- Progress reporting
- Failed batch retry

**8. AdsEcommerceLinker (Cross-Platform Linking)**
```typescript
class AdsEcommerceLinker {
  linkOrdersToAds(orders, adsData) {
    - 30-50% of orders from ads (industry standard)
    - UTM parameter matching
    - Conversion window: 1-30 days after click
    - Conversion value: use actual order amount
  }
}
```

## Layer 5: Supabase Interface Layer

### Purpose: All database interactions

### Components

**1. SupabaseClient**
- Uses service role key (write permission)
- Reuses `bustly-search-data` RPC functions:
  - `get_agent_table_schema`
  - `get_agent_available_tables`
- Mock-specific operations:
  - `insertBatch(tableName, rows)`: Bulk insert
  - `deleteByTenantId(tenantId, tables)`: Clean up
  - `executeTransaction(operations)`: Transaction management

**2. SchemaReader**
- Dynamically reads table structure
- Caches schemas to avoid repeated queries
- Identifies foreign keys, constraints, defaults

**3. DataInserter**
```typescript
class DataInserter {
  // Batch insert (recommended)
  async insertBatch(tableName, rows, options): InsertResult {
    - Use Supabase REST API bulk insert
    - Max 100 rows per batch (Supabase limit)
    - Auto-batch processing
    - Return success/failure counts
  }

  // Stream insert (large volumes)
  async insertStream(tableName, dataStream): InsertResult {
    - Batched stream insert
    - Real-time progress
    - Cancellation support
  }
}
```

**4. TransactionManager**
```typescript
class TransactionManager {
  async withTransaction(operations, rollbackData) {
    try {
      return await operations()
    } catch (error) {
      await this.rollback(rollbackData)
      throw error
    }
  }

  // Rollback: delete inserted data
  private async rollback(rollbackInfo) {
    - Delete by tenant_id
    - Or by date range (if created_at exists)
    - Ensure clean database state
  }
}
```

**5. DataCleaner**
```typescript
class DataCleaner {
  // Clean all data for a tenant
  async cleanTenant(tenantId, platform) {
    - Delete in reverse dependency order
    - Example Shopify: pixel_events → order_items → orders → products/customers
    - Avoid foreign key conflicts
  }

  // Clean by date range
  async cleanByDateRange(tenantId, startDate, endDate)
}
```

**6. ConflictResolver**
- Handle primary key conflicts
- Handle foreign key conflicts
- Skip/update/fail options

## Configuration

### Configuration File Structure

**Location:** `skills/bustly-mock-data/config/supabase.json`

```json
{
  "staging": {
    "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "SUPABASE_URL": "https://xxx-staging.supabase.co"
  },
  "production": {
    "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "SUPABASE_URL": "https://xxx-production.supabase.co"
  },
  "defaultEnv": "staging"
}
```

### Configuration Loading Logic

**lib/config.ts**:
1. Read base config (URL, workspace) from `~/.bustly/bustlyOauth.json`
2. Read service role key from `config/supabase.json`
3. Environment priority:
   - Env var `MOCK_DATA_ENV=staging|production`
   - `config/supabase.json` defaultEnv
   - Default: staging

### .gitignore

```
config/supabase.json
```

Service role keys are never committed to git.

## Smart Generation Strategy

### Strategy Decision Logic

```typescript
function determineStrategy(userStrategy, analysis): GenerationStrategy {
  if (userStrategy === 'minimal') {
    return { targetCount: 10, mode: 'minimal' }
  }

  if (userStrategy === 'comprehensive') {
    return { targetCount: 500, mode: 'comprehensive' }
  }

  // Smart mode: based on analysis
  const currentOrders = analysis.getTotalOrders()

  if (currentOrders < 50) {
    return { targetCount: currentOrders * 5, mode: 'expand' }
  } else if (currentOrders < 200) {
    return { targetCount: currentOrders * 2, mode: 'expand' }
  } else {
    return { targetCount: Math.floor(currentOrders * 0.2), mode: 'supplement' }
  }
}
```

## Generation Flow Example

### User Request: "帮我补充一些测试数据"

```
1. Agent calls generate_mock_data({ platform: 'shopify', strategy: 'smart' })

2. Skill analyzes existing data:
   - Found 20 orders
   - Analyzed price distribution: $10-100 (p50: $45)
   - Analyzed pixel funnel: view:purchase = 8:1
   - Analyzed time pattern: peak 2pm-6pm

3. Skill decides generation strategy:
   - Current: 20 orders < 50 threshold
   - Target: 20 × 5 = 100 new orders

4. Skill generates in dependency order:
   a. Generate 50 new products (based on catalog growth)
   b. Generate 40 new customers (based on customer growth)
   c. Generate 100 new orders:
      - Order dates: follow peak time pattern
      - Products: sampled from existing + new (weighted by popularity)
      - Customers: sampled from existing + new (based on affinity)
      - Amounts: match price distribution
   d. Generate 250 order items (2-3 items per order)
   e. Generate 800 pixel events:
      - 600 page_view (6 per order, spread over 1-7 days before)
      - 150 add_to_cart (1.5 per order, 1-3 days before)
      - 50 purchase (1 per order, on order date)

5. Skill inserts in batches with transaction protection:
   - Batch 1: products (50)
   - Batch 2: customers (40)
   - Batch 3: orders (100)
   - Batch 4: order_items (250)
   - Batch 5: pixel_events (800)

6. Rollback info tracked (for cleanup if needed)

7. Return result:
   {
     success: true,
     platforms: [{
       platform: 'shopify',
       tables: [
         { table: 'products', inserted: 50 },
         { table: 'customers', inserted: 40 },
         { table: 'orders', inserted: 100 },
         { table: 'order_items', inserted: 250 },
         { table: 'pixel_events', inserted: 800 }
       ],
       totalRecords: 1240,
       status: 'success'
     }],
     totalRecords: 1240,
     summary: 'Successfully generated Shopify data: 100 orders, 50 products, 40 customers, 250 order items, 800 pixel events',
     executionTime: 12.5
   }
```

## Error Handling

### Error Categories

**1. Configuration Errors**
- Missing service role key
- Invalid environment
- Resolution: Clear error message + setup instructions

**2. Analysis Errors**
- Query failures
- Missing tables
- Resolution: Log warning, use default patterns

**3. Generation Errors**
- Business rule violations
- Foreign key failures
- Resolution: Skip record, log warning, continue

**4. Insert Errors**
- Constraint violations
- Network failures
- Resolution: Retry 3x, then fail gracefully with rollback

### Transaction Safety

All operations wrapped in transaction protection:
- Track all inserted data
- On failure: automatic rollback
- Manual cleanup via `clean_mock_data`

## Security Considerations

1. **Service Role Key Protection**
   - Never logged or printed
   - Stored in separate config file (gitignored)
   - Environment variable override support

2. **Workspace Isolation**
   - All queries scoped to `current_workspace_id()`
   - Tenant isolation enforced
   - Never cross workspace boundaries

3. **Write Safety**
   - Only INSERT operations (no UPDATE/DELETE on existing data)
   - Explicit cleanup tool requires confirmation
   - Transaction rollback on failure

## Performance Considerations

1. **Batch Operations**
   - Generate in batches (100 records)
   - Insert in batches (100 records)
   - Avoid memory overflow

2. **Query Optimization**
   - Schema caching
   - Batch schema reads
   - Reuse analysis results

3. **Progress Reporting**
   - Real-time progress updates
   - Estimated time remaining
   - Per-table status

## Testing Strategy

### Unit Tests
- Distribution analyzers
- Business rule validators
- Smart value generators

### Integration Tests
- Supabase client operations
- Transaction rollback
- Conflict resolution

### E2E Tests
- Full generation flow (staging only)
- Multi-platform generation
- Cleanup operations

## Future Enhancements

1. **Additional Platforms**
   - Facebook Ads
   - TikTok Ads
   - Email Marketing (Mailchimp, SendGrid)

2. **Advanced Scenarios**
   - Seasonal patterns (holiday sales)
   - Product lifecycle (launch → growth → decline)
   - Customer segmentation (VIP, regular, churned)

3. **Data Import/Export**
   - Export generated data as JSON/CSV
   - Import custom seed data
   - Share scenarios between workspaces

## File Structure

```
skills/bustly-mock-data/
├── skill.md                             # Skill documentation
├── package.json                         # Dependencies and scripts
├── config/
│   ├── supabase.json                   # Service role keys (gitignored)
│   └── .gitignore
├── lib/
│   ├── config.ts                       # Configuration loading
│   ├── analyzer/
│   │   ├── index.ts                    # Main analyzer
│   │   ├── scale.ts                    # Scale analysis
│   │   ├── distribution.ts             # Distribution analysis
│   │   ├── association.ts              # Association analysis
│   │   ├── funnel.ts                   # Funnel analysis
│   │   └── pattern.ts                  # Time pattern analysis
│   ├── rules/
│   │   ├── registry.ts                 # Platform registry
│   │   ├── shopify.ts                  # Shopify rules
│   │   ├── bigcommerce.ts              # BigCommerce rules
│   │   ├── woocommerce.ts              # WooCommerce rules
│   │   ├── magento.ts                  # Magento rules
│   │   └── google_ads.ts               # Google Ads rules
│   ├── generator/
│   │   ├── index.ts                    # Main generator
│   │   ├── ecommerce.ts                # E-commerce generator base
│   │   ├── shopify.ts                  # Shopify generator
│   │   ├── bigcommerce.ts              # BigCommerce generator
│   │   ├── woocommerce.ts              # WooCommerce generator
│   │   ├── magento.ts                  # Magento generator
│   │   ├── ads.ts                      # Ads generator base
│   │   ├── google_ads.ts               # Google Ads generator
│   │   ├── linker.ts                   # Cross-platform linker
│   │   ├── values.ts                   # Smart value generator
│   │   ├── validator.ts                # Data validator
│   │   └── batch.ts                    # Batch processor
│   ├── supabase/
│   │   ├── client.ts                   # Supabase client
│   │   ├── schema.ts                   # Schema reader
│   │   ├── inserter.ts                 # Data inserter
│   │   ├── transaction.ts              # Transaction manager
│   │   ├── cleaner.ts                  # Data cleaner
│   │   └── conflict.ts                 # Conflict resolver
│   └── tools/
│       ├── generate_mock_data.ts       # Main tool implementation
│       ├── get_mock_data_status.ts     # Status check tool
│       └── clean_mock_data.ts          # Cleanup tool
├── scripts/
│   └── setup.ts                        # Initial setup script
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## Summary

This design provides a comprehensive, intelligent mock data generation system that:

- ✅ Analyzes existing data patterns in real-time
- ✅ Generates correlated, business-aware data
- ✅ Supports 5 platforms (Shopify, BigCommerce, WooCommerce, Magento, Google Ads)
- ✅ Ensures high realism (funnels, distributions, associations)
- ✅ Generates complete business scenarios in one operation
- ✅ Provides simple interface for OpenClaw Agents
- ✅ Maintains data safety with transaction protection
- ✅ Scales intelligently based on existing data

The five-layer architecture ensures separation of concerns, maintainability, and extensibility for future platforms and features.
