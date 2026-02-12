---
name: shopify-api
description: Call Shopify Admin GraphQL via the shopify-api edge function. Use for write operations (mutations) or admin actions that must go through Shopify Admin GraphQL. For read-only analytics or reporting, use bustly-search-data instead.
metadata: {"openclaw":{"always":true}}
---

This skill provides a thin client for Shopify Admin GraphQL calls through the Supabase Edge Function `/functions/v1/shopify-api`.

## When to Use This Skill

Use **shopify-api** for **write** operations (mutations) or admin actions that must go through Shopify Admin GraphQL.

## Request Body

```ts
interface RequestBody {
  workspace_id: string;
  shopify_api_version?: string; // Optional, defaults to 2025-01
  query: string;    // GraphQL query string
  variables?: Record<string, unknown>; // GraphQL variables
}
```

## Configuration

This skill reads configuration from `~/.bustly/bustlyOauth.json` (automatically configured via Bustly OAuth login).

Required fields (loaded from `bustlyOauth.json` or env vars):
- `SEARCH_DATA_SUPABASE_URL`
- `SEARCH_DATA_SUPABASE_ANON_KEY`
- `SEARCH_DATA_SUPABASE_ACCESS_TOKEN`
- `SEARCH_DATA_WORKSPACE_ID`

## Quick Start

### Run a GraphQL call
```bash
npm run graphql -- "mutation { shopUpdate(input: { name: \"New Name\" }) { shop { id name } userErrors { field message } } }"
```

### Use a query file + variables
```bash
npm run graphql -- --file ./query.graphql --vars '{"first":10}'
```

## Common Scenarios

### Import Products (Complete Example)

This example creates a product with media and multiple variants in a single mutation.

```bash
npm run graphql -- \
  "mutation ImportProduct(\$input: ProductInput!, \$media: [CreateMediaInput!]) { productCreate(input: \$input, media: \$media) { product { id title handle status variants(first: 10) { nodes { id title sku price } } } userErrors { field message } } }" \
  --vars '{"input":{"title":"OpenClaw Hoodie","handle":"openclaw-hoodie","status":"ACTIVE","vendor":"OpenClaw","productType":"Apparel","tags":["hoodie","merch","openclaw"],"options":["Size","Color"],"variants":[{"title":"Small / Black","sku":"OC-HOODIE-S-BLK","price":"59.00","options":["Small","Black"],"inventoryItem":{"tracked":true,"cost":"28.00"}},{"title":"Medium / Black","sku":"OC-HOODIE-M-BLK","price":"59.00","options":["Medium","Black"],"inventoryItem":{"tracked":true,"cost":"28.00"}}]},"media":[{"mediaContentType":"IMAGE","originalSource":"https://cdn.example.com/products/openclaw-hoodie-front.jpg","alt":"OpenClaw hoodie front view"},{"mediaContentType":"IMAGE","originalSource":"https://cdn.example.com/products/openclaw-hoodie-back.jpg","alt":"OpenClaw hoodie back view"}]}'
```

Notes:
- `variants` in `ProductInput` allows creating multiple variants at once.
- `media` supports product images on creation; use public URLs that Shopify can fetch.

### Bulk Update Inventory + Price

This example updates price and available quantity for multiple variants.

```bash
npm run graphql -- \
  "mutation BulkUpdateInventoryAndPrice(\$productId: ID!, \$variants: [ProductVariantsBulkInput!]!, \$inventoryItemAdjustments: [InventoryAdjustItemInput!]!, \$locationId: ID!) { productVariantsBulkUpdate(productId: \$productId, variants: \$variants) { product { id title } productVariants { id sku price } userErrors { field message } } inventoryAdjustQuantities(input: { reason: \"correction\" name: \"available\" changes: \$inventoryItemAdjustments locationId: \$locationId }) { userErrors { field message } } }" \
  --vars '{"productId":"gid://shopify/Product/1234567890","locationId":"gid://shopify/Location/9876543210","variants":[{"id":"gid://shopify/ProductVariant/111","price":"49.00"},{"id":"gid://shopify/ProductVariant/222","price":"59.00"}],"inventoryItemAdjustments":[{"inventoryItemId":"gid://shopify/InventoryItem/333","availableDelta":12},{"inventoryItemId":"gid://shopify/InventoryItem/444","availableDelta":-3}]}'
```

Notes:
- `productVariantsBulkUpdate` updates prices in one call.
- `inventoryAdjustQuantities` updates available stock at a specific location.

### Bulk Publish / Unpublish Products

This example publishes or unpublishes multiple products to a single sales channel (publication).

Publish:
```bash
npm run graphql -- \
  "mutation BulkPublishProducts(\$publicationId: ID!, \$productIds: [ID!]!) { publishablePublish(id: \$publicationId, input: { publishableIds: \$productIds }) { publishable { id } userErrors { field message } } }" \
  --vars '{"publicationId":"gid://shopify/Publication/555","productIds":["gid://shopify/Product/123","gid://shopify/Product/456","gid://shopify/Product/789"]}'
```

Unpublish:
```bash
npm run graphql -- \
  "mutation BulkUnpublishProducts(\$publicationId: ID!, \$productIds: [ID!]!) { publishableUnpublish(id: \$publicationId, input: { publishableIds: \$productIds }) { publishable { id } userErrors { field message } } }" \
  --vars '{"publicationId":"gid://shopify/Publication/555","productIds":["gid://shopify/Product/123","gid://shopify/Product/456","gid://shopify/Product/789"]}'
```

Notes:
- Use the same variables for publish and unpublish; choose the mutation to run.
- `publicationId` represents a sales channel.

### Add Products To Collection (Manual or Automated)

This example adds products to a manual collection and updates an automated collection rule.

Manual collection:
```bash
npm run graphql -- \
  "mutation AddToManualCollection(\$collectionId: ID!, \$productIds: [ID!]!) { collectionAddProducts(collectionId: \$collectionId, productIds: \$productIds) { collection { id title } userErrors { field message } } }" \
  --vars '{"collectionId":"gid://shopify/Collection/999","productIds":["gid://shopify/Product/123","gid://shopify/Product/456"]}'
```

Automated collection:
```bash
npm run graphql -- \
  "mutation UpdateAutomatedCollectionRule(\$collectionId: ID!, \$ruleSet: CollectionRuleSetInput!) { collectionUpdate(input: { id: \$collectionId, ruleSet: \$ruleSet }) { collection { id title } userErrors { field message } } }" \
  --vars '{"collectionId":"gid://shopify/Collection/888","ruleSet":{"appliedDisjunctively":false,"rules":[{"column":"TAG","relation":"EQUALS","condition":"openclaw"}]}}'
```

Notes:
- Manual collections use `collectionAddProducts`.
- Automated collections are managed via `collectionUpdate` with `ruleSet`.
