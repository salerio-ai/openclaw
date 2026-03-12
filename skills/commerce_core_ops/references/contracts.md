# commerce-core-ops Direct Read/Write Contract

This contract is for direct platform API operations on Shopify/BigCommerce/WooCommerce/Magento.

## Scope

- `DIRECT_READ`: products / orders / customers / inventory / variants / shop_info / order_items
- `DIRECT_WRITE`: product create / upsert / update / delete / inventory_adjust / publish / unpublish / variants_bulk_update

This contract intentionally does not define sync/job workflow commands.

## Endpoint

- Function slug (recommended): `commerce-core-ops`
- URL: `/functions/v1/commerce-core-ops`
- Method: `POST`

## Headers

- `Authorization: Bearer <supabase_jwt>`
- `apikey: <supabase_anon_key>`
- `Content-Type: application/json`

## Request Body (DIRECT_READ)

```json
{
  "action": "DIRECT_READ",
  "platform": "shopify | bigcommerce | woocommerce | magento",
  "entity": "products | orders | customers | inventory | variants | shop_info | order_items",
  "workspace_id": "uuid",
  "user_id": "uuid",
  "limit": 50,
  "since": "2026-01-01",
  "cursor": "",
  "filters": {},
  "request_id": "optional-request-id"
}
```

## Request Body (DIRECT_WRITE)

```json
{
  "action": "DIRECT_WRITE",
  "platform": "shopify | bigcommerce | woocommerce | magento",
  "resource": "product",
  "operation": "upsert | create | update | delete | inventory_adjust | publish | unpublish | variants_bulk_update",
  "workspace_id": "uuid",
  "user_id": "uuid",
  "payload": {},
  "request_id": "optional-request-id",
  "idempotency_key": "optional-idempotency-key"
}
```

## Response Body (shape)

```json
{
  "success": true,
  "action": "DIRECT_READ | DIRECT_WRITE",
  "platform": "woocommerce",
  "entity": "orders",
  "result": {
    "count": 10,
    "rows": []
  }
}
```

## Required Server-side Checks

1. Validate JWT
2. Enforce `jwt_user_id == user_id`
3. Validate active workspace membership in `workspace_members`
4. Validate workspace exists and `workspaces.status` is active
5. Validate `workspace_billing_windows` has an active non-expired subscription window
6. Validate active workspace mapping table for target platform
7. Resolve provider credentials server-side (Shopify mapping/shop token or Nango connection/token)
8. Execute provider API call and return workspace-scoped result

## Platform Mapping Tables

- Shopify: `workspace_shopify_mappings` + `shopify_shops`
- BigCommerce: `workspace_bigcommerce_mappings`
- WooCommerce: `workspace_woocommerce_mappings`
- Magento: `workspace_magento_mappings`
- Integrations: `workspace_integrations` (`nango_connection_id`)
