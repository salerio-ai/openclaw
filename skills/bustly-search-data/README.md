# Bustly Search Data Skill

An OpenClaw skill for querying e-commerce data from Shopify, Google Ads, BigCommerce, and other platforms via Supabase.

## Installation

This skill is bundled with OpenClaw and located in the `skills/bustly-search-data` directory.

## Auto-Loading Configuration

The skill is automatically loaded by OpenClaw when configured in `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "bustly-search-data": {
        "enabled": true,
        "env": {
          "SEARCH_DATA_SUPABASE_URL": "https://your-project.supabase.co",
          "SEARCH_DATA_SUPABASE_ANON_KEY": "your-anon-key",
          "SEARCH_DATA_TOKEN": "your-auth-token",
          "SEARCH_DATA_WORKSPACE_ID": "your-workspace-id"
        }
      }
    }
  }
}
```

### How Auto-Loading Works

1. **Entry Point**: OpenClaw scans the `skills/` directory for directories containing a `SKILL.md` file
2. **Frontmatter Metadata**: The `SKILL.md` file contains frontmatter with:
   - `name`: Skill identifier (must match the key in `skills.entries`)
   - `description`: What the skill does
   - `metadata.openclaw.requires.env`: Required environment variables
3. **Environment Injection**: OpenClaw injects the environment variables from `skills.entries.bustly-search-data.env` into the skill's execution context
4. **Tool Discovery**: The skill's NPM scripts (e.g., `get_tables`, `get_schema`, `query`) are automatically discovered and made available to agents

## Environment Variables

Required environment variables (configured in `~/.openclaw/openclaw.json`):

| Variable | Description |
|----------|-------------|
| `SEARCH_DATA_SUPABASE_URL` | Supabase project URL |
| `SEARCH_DATA_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SEARCH_DATA_TOKEN` | User authentication token (Bearer token) |
| `SEARCH_DATA_WORKSPACE_ID` | Multi-tenant workspace ID (optional for some endpoints) |

## Usage

### By Agents

When enabled, agents can automatically use this skill's tools:

```
User: Show me recent Shopify orders
Agent: [Uses npm run orders:recent]
```

### Manual Testing

You can test the skill directly from the command line:

```bash
cd skills/bustly-search-data

# Set environment variables manually (for testing)
export SEARCH_DATA_SUPABASE_URL="https://your-project.supabase.co"
export SEARCH_DATA_SUPABASE_ANON_KEY="your-key"
export SEARCH_DATA_TOKEN="your-token"
export SEARCH_DATA_WORKSPACE_ID="your-workspace-id"

# Test commands
npm run get_tables
npm run get_schema -- semantic.dm_orders_shopify
npm run query -- "SELECT * FROM semantic.dm_orders_shopify LIMIT 10"
```

## Available Tools

| NPM Script | Description |
|------------|-------------|
| `get_tables` | List all available tables |
| `get_schema` | Get table structure (takes table name as argument) |
| `query` | Execute SQL SELECT query |
| `shop:info` | Get shop information |
| `orders:recent` | Get recent orders |
| `orders:summary` | Get daily sales summary |
| `products:top` | Get top products by revenue |
| `customers:top` | Get top customers |
| `ads:campaigns` | Get Google Ads campaigns |
| `catalog` | Show all available tables |

## Development

### Project Structure

```
bustly-search-data/
├── SKILL.md           # Skill metadata (required by OpenClaw)
├── README.md          # This file
├── package.json       # NPM configuration
├── lib/
│   ├── config.ts      # Configuration loader
│   ├── supabase_api.ts # Supabase API client
│   └── presets.ts     # Pre-built query templates
└── scripts/
    ├── get_tables.ts  # List available tables
    ├── get_schema.ts  # Get table schema
    └── query_data.ts  # Execute SQL query
```

### Adding New Query Templates

1. Add the function to `lib/presets.ts`
2. Add an NPM script to `package.json`

Example:

```typescript
// lib/presets.ts
export async function getCustomReport() {
  return await runSelectQuery(`
    SELECT * FROM your_table
    LIMIT 10
  `)
}
```

```json
// package.json
{
  "scripts": {
    "custom:report": "tsx -e 'import { getCustomReport } from \"./lib/presets\"; getCustomReport().then(r => console.log(JSON.stringify(r, null, 2)))'"
  }
}
```

## Security

- All queries are **read-only** (SELECT statements only)
- SQL injection protection via parameterized queries
- Authentication via Bearer token
- Workspace-based multi-tenancy isolation

## Troubleshooting

### Skill Not Loading

1. Check that the skill is enabled in `~/.openclaw/openclaw.json`:
   ```bash
   cat ~/.openclaw/openclaw.json | jq '.skills.entries["bustly-search-data"].enabled'
   ```

2. Verify environment variables are set:
   ```bash
   cat ~/.openclaw/openclaw.json | jq '.skills.entries["bustly-search-data"].env'
   ```

3. Restart the gateway:
   ```bash
   pkill -f openclaw-gateway
   # The gateway will auto-restart if running via Electron
   ```

### Configuration Errors

If you see "Missing required Supabase configuration":
- Verify all four environment variables are set in `~/.openclaw/openclaw.json`
- Check that the `bustly-search-data` entry key matches the skill name in `SKILL.md`

## License

MIT
