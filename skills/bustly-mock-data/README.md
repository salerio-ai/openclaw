# Bustly Mock Data Skill

Intelligent mock data generation for e-commerce and advertising platforms.

## Features

- 🧠 Smart analysis of existing data patterns
- 🔗 Business logic aware (foreign keys, calculations)
- 📊 Realistic distributions (prices, dates, funnels)
- 🛒 Complete scenarios (products → orders → pixels)
- 🏪 Multi-platform: Shopify, BigCommerce, WooCommerce, Magento, Google Ads
- 💾 Direct database insertion via RPC

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure service role keys
cp config/supabase.json.example config/supabase.json
# Edit config/supabase.json with your keys

# ⚠️ IMPORTANT: Set up database (choose one option below)
# Option 1: Install RPC function (recommended)
#   - Run db/install_rpc_functions.sql in Supabase SQL Editor
# Option 2: Expose semantic schema
#   - Go to Database → API in Supabase dashboard
#   - Add 'semantic' to exposed schemas

# Preview generated data (no insertion)
npm run preview shopify

# Generate and insert mock data
npm run generate shopify smart

# Check status
npm run status

# Clean data (careful!)
npm run clean shopify --confirm
```

## Database Setup

**Before running `generate`, you must enable data insertion:**

### Option 1: RPC Function (Recommended)

Run `db/install_rpc_functions.sql` in Supabase SQL Editor. This creates a secure function that handles inserts.

### Option 2: Expose Schema

1. Go to Supabase Dashboard → Database → API
2. Find "Exposed schemas" section
3. Add `semantic` to the list

## Configuration

Requires two configuration sources:

1. **Base config** from `~/.bustly/bustlyOauth.json` (shared with bustly-search-data)
2. **Service role keys** from `config/supabase.json` (see `config/supabase.json.example`)

## Commands

### Generate Data
```bash
npm run generate <platform> <strategy>

# Platforms: shopify, bigcommerce, woocommerce, magento, google_ads
# Strategies: smart (default), minimal, comprehensive

# Examples:
npm run generate shopify smart
npm run generate bigcommerce minimal
```

### Preview Data
```bash
npm run preview <platform>

# Shows generated data without inserting to database
# Useful for validating data quality before insertion
```

### Check Status
```bash
npm run status

# Shows existing data counts for all platforms
```

### Clean Data
```bash
npm run clean <platform> --confirm

# ⚠️ Requires --confirm flag
# Deletes all generated data for the platform
```

## Strategies

- `smart`: Analyze existing data and intelligently scale (default)
  - < 50 records: 5× expansion
  - 50-200 records: 2× expansion
  - > 200 records: +20% expansion
- `minimal`: Generate ~10 records for quick testing
- `comprehensive`: Generate ~500 records for full scenarios

## Development

```bash
# Run integration test
npm run test

# Test specific components
tsx -e "import('./lib/analyzer/index.js')"
```

## Safety

- All operations scoped to current workspace
- Service role keys never committed to git
- Clean operations require confirmation
- Preview command validates before insertion

## Architecture

Five-layer architecture:
1. Agent Interface - Tool interface for OpenClaw
2. Data Analysis - Analyze existing patterns
3. Business Rules - Platform rules and constraints
4. Data Generation - Generate mock data
5. Supabase Interface - Database operations via RPC

See design doc: `docs/plans/2026-02-09-bustly-mock-data-design.md`
