---
name: source-product
description: AliExpress product sourcing skill - search products by image or text, find suppliers, and get product details for dropshipping and e-commerce.
metadata: {"openclaw":{"always":true}}
---

This skill provides AliExpress product sourcing capabilities, helping you find suppliers and products through image search or text search.

## Handling User Images (Agent Instructions)

When a user wants to find similar products using an image:

### 1. Check for MediaPath (WhatsApp/Telegram)
If the message came from WhatsApp or Telegram with an image, `MediaPath` should be available in your context. Use it directly:

```bash
npm run search:image -- "{{MediaPath}}"
```

The media files are saved at `~/.bustly/media/inbound/` directory.

### 2. If User Provides a URL
Use the URL directly:

```bash
npm run search:image -- "https://example.com/product-image.jpg"
```

### 3. If User Provides a Local File Path
Use the path directly:

```bash
npm run search:image -- "/path/to/image.jpg"
```

### 4. Webchat Limitation
If the user uploaded an image via webchat (web UI), the image is sent as multimodal input (you can "see" it) but there's no file path available. In this case:
- Ask the user to provide an image URL instead
- Or describe what you see and offer to do a text search with those keywords

## Architecture

This skill uses **Supabase Edge Functions** to securely call AliExpress APIs without exposing sensitive credentials to client applications.

**Security Benefits:**
- `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` are stored as Edge Function environment variables (never exposed to clients)
- JWT token validation verifies user identity on each request
- Workspace membership checks prevent unauthorized access
- RLS policies ensure users can only read (not modify) AliExpress account mappings

**Request Flow:**
```
Client App (this skill)
    │
    ├─ Reads: ~/.bustly/bustlyOauth.json
    │   - SEARCH_DATA_SUPABASE_URL
    │   - SEARCH_DATA_SUPABASE_ACCESS_TOKEN (JWT)
    │   - SEARCH_DATA_WORKSPACE_ID
    │
    ▼
Supabase Edge Function
    ├─ Validates JWT token
    ├─ Checks workspace_members table
    ├─ Gets AliExpress account from database
    ├─ Calls AliExpress API (with server-side credentials)
    │
    ▼
Returns product results
```

## Quick Start

### Get AliExpress Accounts
```bash
npm run get:accounts
```

### Search Products by Text
```bash
npm run search:text -- "wireless earbuds"
```

### Search Products by Image

**By Image URL:**
```bash
npm run search:image -- "https://example.com/product-image.jpg"
```

**By Local Image Path:**
```bash
npm run search:image -- "/path/to/product-image.jpg"
```

**By Base64 String:**
```bash
npm run search:image -- --base64 "data:image/jpeg;base64,..."
npm run search:image -- --base64 "iVBORw0KGgoAAAANS..."
```

## Common Use Cases

### Product Research
Find similar products or suppliers:
```bash
# Text search
npm run search:text -- "iPhone case"

# Image search with URL
npm run search:image -- "https://example.com/iphone-case.jpg"

# Image search with local file
npm run search:image -- "./product-photo.jpg"

# Image search with base64 (e.g., from chat upload)
npm run search:image -- --base64 "data:image/jpeg;base64,..."
```

### Supplier Discovery
Find multiple suppliers for the same product:
```bash
npm run search:text -- "yoga mat"
```

## Configuration

This skill reads configuration from `~/.bustly/bustlyOauth.json` (automatically configured via Bustly OAuth login).

No manual configuration is required. After logging in via Bustly OAuth in the desktop app, the skill will have access to:

- `SEARCH_DATA_SUPABASE_URL` - Supabase API URL
- `SEARCH_DATA_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SEARCH_DATA_SUPABASE_ACCESS_TOKEN` - Supabase session access token (JWT)
- `SEARCH_DATA_WORKSPACE_ID` - Workspace identifier

The skill uses the `workspace_id` to:
1. Pass it to edge functions for authentication
2. Edge functions verify user is a member of the workspace
3. Edge functions query `workspace_aliexpress_mappings` to get `aliexpress_account_id`
4. Edge functions query `aliexpress_accounts` to retrieve the `access_token`
5. Edge functions call AliExpress APIs with the authenticated token

**Important:** `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` are NO LONGER stored client-side. They are securely stored as Edge Function environment variables.

## Available Commands

| NPM Script | Description |
|------------|-------------|
| `search:image` | Search products by image (URL, local path, or base64) |
| `search:text` | Search products by text query |
| `get:accounts` | List AliExpress accounts for current workspace |
| `test:token` | Test if access token is valid |

## Edge Functions

### aliexpress-text-search
Searches AliExpress products by keyword. Accepts:
- `workspace_id`: Workspace UUID (from config)
- `access_token`: JWT token (from config)
- `query`: Search keyword
- Optional: `country_code`, `category_id`, `sort_by`, `page_size`, etc.

### aliexpress-image-search
Searches AliExpress products by image. Accepts:
- `workspace_id`: Workspace UUID (from config)
- `access_token`: JWT token (from config)
- `image_url`: Public URL of product image (optional)
- `image_base64`: Base64 encoded image string, with or without data URI prefix (optional)
- Optional: `ship_to`, `sort_type`, `currency`, `search_type`

**Note:** Either `image_url` OR `image_base64` is required.

## Database Tables Used

- `public.workspace_aliexpress_mappings` - Workspace to account mapping (READ-ONLY access via RLS)
- `public.aliexpress_accounts` - Account tokens and metadata (service role only)
- `public.workspaces` - Workspace information
- `public.workspace_members` - Workspace membership verification
- `public.workspace_integrations` - Integration settings

## Security Features

- JWT token validation on every request
- Workspace membership verification
- Multi-tenancy isolation
- Encrypted token storage in database
- Automatic token expiration checking
- RLS policies (READ-ONLY for authenticated users)
- Request timeout control (30 seconds)
- TypeScript type support

## Migration Notes

**Before:** The skill directly called AliExpress API with credentials stored client-side.

**After:** The skill calls Supabase Edge Functions which:
- Keep API credentials secure on the server
- Validate user identity via JWT
- Verify workspace membership
- Retrieve AliExpress account tokens from database
- Call AliExpress API and return results

**Breaking Changes:** None. The public API (`searchTextProducts`, `searchImageProducts`) remains unchanged.

## Important Notes

1. AliExpress tokens expire and must be refreshed via OAuth flow
2. Rate limiting applies to API calls
3. Image search supports:
   - Publicly accessible image URLs (JPEG, PNG, GIF, WebP, AVIF)
   - Local image files (automatically converted to base64)
   - Base64 encoded images (with or without data URI prefix)
4. Workspace must have AliExpress integration enabled
5. Multiple AliExpress accounts per workspace are supported
6. Users can only READ AliExpress account mappings (RLS enforced)
