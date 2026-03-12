# commerce-core-ops Direct Write Contract

This contract is for direct product write operations on BigCommerce/WooCommerce/Magento.

## Scope

- Product create / upsert / update / delete
- Product publish / unpublish (if platform supports)
- Inventory adjustments

This contract intentionally does not define sync/job workflow commands.

## Endpoint

- Function slug (recommended): `commerce-core-ops`
- URL: `/functions/v1/commerce-core-ops`
- Method: `POST`

## Headers

- `Authorization: Bearer <supabase_jwt>`
- `apikey: <supabase_anon_key>`
- `Content-Type: application/json`

## Request Body

```json
{
  "action": "DIRECT_WRITE",
  "platform": "bigcommerce | woocommerce | magento",
  "resource": "product",
  "operation": "upsert | create | update | delete | publish | unpublish | inventory_adjust",
  "workspace_id": "uuid",
  "user_id": "uuid",
  "payload": {},
  "request_id": "optional-request-id",
  "idempotency_key": "optional-idempotency-key"
}
```

## Response Body

```json
{
  "success": true,
  "platform": "woocommerce",
  "resource": "product",
  "operation": "upsert",
  "result": {
    "platform_product_id": "12345",
    "external_id": "sku-001"
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
7. Resolve Nango connection/token server-side (not client-side)
8. Execute platform API call and return workspace-scoped result

## Platform Mapping Tables

- BigCommerce: `workspace_bigcommerce_mappings`
- WooCommerce: `workspace_woocommerce_mappings`
- Magento: `workspace_magento_mappings`
- Integrations: `workspace_integrations` (`nango_connection_id`)
