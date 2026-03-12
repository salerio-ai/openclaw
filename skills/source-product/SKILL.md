---
name: source-product
description: AliExpress product sourcing skill - search products by image or text, find suppliers, and get product details for dropshipping and e-commerce.
metadata: { "openclaw": { "always": true } }
---

This skill provides AliExpress product sourcing capabilities, helping you find suppliers and products through image search or text search.

Use the standalone Node entrypoint directly (no `npm install`, no `tsx`):
`node skills/source-product/scripts/run.js ...`

## Handling User Images (Agent Instructions)

When a user wants to find similar products using an image:

### 1. Check for MediaPath (WhatsApp/Telegram)

If the message came from WhatsApp or Telegram with an image, `MediaPath` should be available in your context. Use it directly:

```bash
node skills/source-product/scripts/run.js search:image "{{MediaPath}}"
```

The media files are saved at `~/.bustly/media/inbound/` directory.

### 2. If User Provides a URL

Use the URL directly:

```bash
node skills/source-product/scripts/run.js search:image "https://example.com/product-image.jpg"
```

### 3. If User Provides a Local File Path

Use the path directly:

```bash
node skills/source-product/scripts/run.js search:image "/path/to/image.jpg"
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
    │   - supabase.url
    │   - user.userAccessToken (JWT)
    │   - user.workspaceId
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
node skills/source-product/scripts/run.js get:accounts
```

### Search Products by Text

```bash
node skills/source-product/scripts/run.js search:text "wireless earbuds"
```

### Search Products by Image

**By Image URL:**

```bash
node skills/source-product/scripts/run.js search:image "https://example.com/product-image.jpg"
```

**By Local Image Path:**

```bash
node skills/source-product/scripts/run.js search:image "/path/to/product-image.jpg"
```

**By Base64 String:**

```bash
node skills/source-product/scripts/run.js search:image --base64 "data:image/jpeg;base64,..."
node skills/source-product/scripts/run.js search:image --base64 "iVBORw0KGgoAAAANS..."
```

## Common Use Cases

### Product Research

Find similar products or suppliers:

```bash
# Text search
node skills/source-product/scripts/run.js search:text "iPhone case"

# Image search with URL
node skills/source-product/scripts/run.js search:image "https://example.com/iphone-case.jpg"

# Image search with local file
node skills/source-product/scripts/run.js search:image "./product-photo.jpg"

# Image search with base64 (e.g., from chat upload)
node skills/source-product/scripts/run.js search:image --base64 "data:image/jpeg;base64,..."
```

### Supplier Discovery

Find multiple suppliers for the same product:

```bash
node skills/source-product/scripts/run.js search:text "yoga mat"
```

### Product Import for E-commerce

Get product details for importing to your store:

```bash
# Get product info (returns raw API data)
node skills/source-product/scripts/run.js get:product --url "https://www.aliexpress.com/item/1005001234567890.html"

# With options for different markets
node skills/source-product/scripts/run.js get:product --url "..." --country "GB" --currency "GBP"
```

## Configuration

This skill reads configuration from `~/.bustly/bustlyOauth.json` (automatically configured via Bustly OAuth login).

No manual configuration is required. After logging in via Bustly OAuth in the desktop app, the skill will have access to:

- `supabase.url` - Supabase API URL
- `supabase.anonKey` - Supabase anonymous key
- `user.userAccessToken` - Supabase session access token (JWT)
- `user.workspaceId` - Workspace identifier

The skill uses the `workspace_id` to:

1. Pass it to edge functions for authentication
2. Edge functions verify user is a member of the workspace
3. Edge functions query `workspace_aliexpress_mappings` to get `aliexpress_account_id`
4. Edge functions query `aliexpress_accounts` to retrieve the `access_token`
5. Edge functions call AliExpress APIs with the authenticated token

**Important:** `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` are NO LONGER stored client-side. They are securely stored as Edge Function environment variables.

## Available Commands

| Command        | Description                                           |
| -------------- | ----------------------------------------------------- |
| `search:image` | Search products by image (URL, local path, or base64) |
| `search:text`  | Search products by text query                         |
| `get:product`  | Get detailed product information by URL or product ID |
| `get:accounts` | List AliExpress accounts for current workspace        |
| `test:token`   | Test if access token is valid                         |

## Get Product Info

Get detailed product information from AliExpress using a product URL or product ID.

### By Product URL

```bash
node skills/source-product/scripts/run.js get:product --url "https://www.aliexpress.com/item/1234567890.html"
```

### By Product ID

```bash
node skills/source-product/scripts/run.js get:product --product-id "1234567890"
```

### With Custom Options

```bash
# Ship to different country
node skills/source-product/scripts/run.js get:product --url "https://www.aliexpress.com/item/1234567890.html" --country "GB"

# Different currency
node skills/source-product/scripts/run.js get:product --productId "1234567890" --currency "EUR"

# Different language
node skills/source-product/scripts/run.js get:product --productId "1234567890" --language "fr"

# Combine options
node skills/source-product/scripts/run.js get:product --url "..." --country "GB" --currency "GBP"

# Show complete raw API response
node skills/source-product/scripts/run.js get:product --productId "1234567890" --raw-response
```

### Response Format

The function returns the **raw API response** from AliExpress to ensure compatibility with API changes. The response includes:

**Quick Reference Fields:**

- Title (`ae_item_base_info_dto.subject`)
- Description (`ae_item_base_info_dto.detail`)
- Images (`ae_multimedia_info_dto.image_urls` - semicolon-separated)
- SKU Variants (`ae_item_sku_info_dtos` array)
- Price information
- Inventory data

**Full Raw Data:**

- Complete JSON response from AliExpress API
- Can be parsed programmatically for custom needs
- Resilient to API format changes

### Example Use Cases

**Product Analysis:**

```bash
# Get detailed product info for analysis
node skills/source-product/scripts/run.js get:product --productId "1005001234567890"
```

**Multi-Market Research:**

```bash
# Check pricing for different countries
node skills/source-product/scripts/run.js get:product --productId "1005001234567890" --country "DE" --currency "EUR"
node skills/source-product/scripts/run.js get:product --productId "1005001234567890" --country "GB" --currency "GBP"
```

**URL to Product ID Parsing:**

```bash
# Automatically extracts product ID from URL
node skills/source-product/scripts/run.js get:product --url "https://www.aliexpress.com/item/1005001234567890.html"
```

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

### aliexpress-product-info

Gets detailed product information by product ID. Accepts:

- `workspace_id`: Workspace UUID (from config)
- `access_token`: JWT token (from config)
- `product_id`: AliExpress product ID
- Optional: `ship_to_country`, `target_currency`, `target_language`

Returns **raw API response** from AliExpress with:

- `success`: Boolean indicating success
- `source`: "aliexpress"
- `product_id`: The product ID
- `data`: Raw result object from AliExpress API
- `raw_response`: Complete API response

**Note:** The raw data format ensures the code doesn't break when AliExpress changes their API response structure. Consumers can parse the fields they need.

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

## Migration Notes

**Before:** The skill directly called AliExpress API with credentials stored client-side.

**After:** The skill calls Supabase Edge Functions which:

- Keep API credentials secure on the server
- Validate user identity via JWT
- Verify workspace membership
- Retrieve AliExpress account tokens from database
- Call AliExpress API and return results

**Breaking Changes:** Use CLI command entrypoint only.

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
