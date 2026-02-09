# Bustly Mock Data Skill

Intelligent mock data generation for e-commerce and advertising platforms.

## Features

- 🧠 Smart analysis of existing data patterns
- 🔗 Business logic aware (foreign keys, calculations)
- 📊 Realistic distributions (prices, dates, funnels)
- 🛒 Complete scenarios (products → orders → pixels)
- 🏪 Multi-platform: Shopify, BigCommerce, WooCommerce, Magento, Google Ads

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure service role keys
cp config/supabase.json.example config/supabase.json
# Edit config/supabase.json with your keys

# Generate mock data
npm run generate shopify smart

# Check status
npm run status

# Clean data (careful!)
npm run clean shopify --confirm
```

## Configuration

Requires two configuration sources:

1. **Base config** from `~/.bustly/bustlyOauth.json` (shared with bustly-search-data)
2. **Service role keys** from `config/supabase.json` (see `config/supabase.json.example`)

## Strategies

- `smart`: Analyze existing data and intelligently scale (default)
- `minimal`: Generate ~10 records for quick testing
- `comprehensive`: Generate ~500 records for full scenarios

## Development

```bash
# Run integration test
tsx tests/integration/test-full-flow.ts

# Test specific components
tsx -e "import('./lib/analyzer/index.js')"
```

## Safety

- All operations scoped to current workspace
- Transaction protection with rollback
- Service role keys never committed to git
- Clean operations require confirmation

## Architecture

Five-layer architecture:
1. Agent Interface - Tool interface for OpenClaw
2. Data Analysis - Analyze existing patterns
3. Business Rules - Platform rules and constraints
4. Data Generation - Generate mock data
5. Supabase Interface - Database operations

See design doc: `docs/plans/2026-02-09-bustly-mock-data-design.md`
