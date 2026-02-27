# Bustly Search Data Skill

An OpenClaw skill for querying e-commerce data from Shopify, Google Ads, BigCommerce, and other platforms via Supabase.

## Installation

This skill is bundled with OpenClaw and located in the `skills/bustly-search-data` directory.

## Auto-Loading Configuration

The skill reads configuration from `~/.bustly/bustlyOauth.json` (automatically configured via Bustly OAuth login in the desktop app).

### How Auto-Loading Works

1. **Entry Point**: OpenClaw scans the `skills/` directory for directories containing a `SKILL.md` file
2. **Frontmatter Metadata**: The `SKILL.md` file contains frontmatter with:
   - `name`: Skill identifier
   - `description`: What the skill does
   - `metadata.bustly.requires.env`: Required environment variables
3. **Configuration Loading**: The skill script automatically reads from `bustlyOauth.json`:
   - `SEARCH_DATA_SUPABASE_URL` - Supabase API URL
   - `SEARCH_DATA_SUPABASE_ANON_KEY` - Supabase anonymous key
   - `SEARCH_DATA_SUPABASE_ACCESS_TOKEN` - Supabase session access token
   - `SEARCH_DATA_WORKSPACE_ID` - Workspace identifier
4. **Tool Execution**: The skill runs via `node skills/bustly-search-data/scripts/run.js <command>`

## Environment Variables

Required environment variables (automatically loaded from `~/.bustly/bustlyOauth.json` after Bustly OAuth login):

| Variable                            | Description                                             |
| ----------------------------------- | ------------------------------------------------------- |
| `SEARCH_DATA_SUPABASE_URL`          | Supabase project URL                                    |
| `SEARCH_DATA_SUPABASE_ANON_KEY`     | Supabase anonymous/public key                           |
| `SEARCH_DATA_SUPABASE_ACCESS_TOKEN` | Supabase session access token                           |
| `SEARCH_DATA_WORKSPACE_ID`          | Multi-tenant workspace ID (optional for some endpoints) |

## Usage

### By Agents

When enabled, agents can automatically use this skill's tools:

```
User: Show me recent Shopify orders
Agent: [Uses bustly-search-data skill commands]
```

### Manual Testing

You can test the skill directly from the command line:

```bash
# Set environment variables manually (for testing without OAuth)
export SEARCH_DATA_SUPABASE_URL="https://your-project.supabase.co"
export SEARCH_DATA_SUPABASE_ANON_KEY="your-key"
export SEARCH_DATA_SUPABASE_ACCESS_TOKEN="your-token"
export SEARCH_DATA_WORKSPACE_ID="your-workspace-id"

# Test commands
node skills/bustly-search-data/scripts/run.js get_tables
node skills/bustly-search-data/scripts/run.js get_schema semantic.dm_orders_shopify
node skills/bustly-search-data/scripts/run.js query "SELECT * FROM semantic.dm_orders_shopify LIMIT 10"
```

## Available Tools

| Command      | Description                                        |
| ------------ | -------------------------------------------------- |
| `get_tables` | List all available tables                          |
| `get_schema` | Get table structure (takes table name as argument) |
| `query`      | Execute SQL SELECT query                           |
| `platforms`  | Show detected connected platforms                  |

## Development

### Project Structure

```
bustly-search-data/
├── SKILL.md            # Skill metadata (required by OpenClaw)
├── README.md           # This file
└── scripts/
    └── run.js          # Standalone CLI entrypoint
```

## Security

- All queries are **read-only** (SELECT statements only)
- SQL injection protection via parameterized queries
- Authentication via Bearer token
- Workspace-based multi-tenancy isolation

## Troubleshooting

### Skill Not Loading

1. Check that you're logged in via Bustly OAuth:

   ```bash
   cat ~/.bustly/bustlyOauth.json | jq '.bustlySearchData'
   ```

2. Verify the configuration exists:

   ```bash
   cat ~/.bustly/bustlyOauth.json | jq '.bustlySearchData.SEARCH_DATA_SUPABASE_URL'
   ```

3. Restart the gateway:
   ```bash
   pkill -f openclaw-gateway
   # The gateway will auto-restart if running via Electron
   ```

### Configuration Errors

If you see "Missing required Supabase configuration":

- Verify you're logged in via Bustly OAuth in the desktop app
- Check that `~/.bustly/bustlyOauth.json` exists and contains `bustlySearchData`
- For manual testing, set the environment variables directly

## License

MIT
