---
name: commerce_core_ops
category: ecommerce
api_type: hybrid
auth_type: jwt
description: Unified commerce operations for Shopify, BigCommerce, WooCommerce, and Magento. Use this skill when an agent needs one workspace-scoped entrypoint for product, order, customer, or inventory reads plus product writes, especially when provider-specific skills are too fragmented.
---

This skill is the unified commerce layer inside `bustly-skills`.

It focuses on two goals only:

1. Data reads (product/order/customer/inventory)
2. Product writes (import/create/update/delete/inventory adjust)

Use the standalone Node entrypoint directly:
`node skills/commerce_core_ops/scripts/run.js ...`

## Architecture

`commerce_core_ops` is intentionally a hybrid skill.

- Most provider skills in this repo follow the GraphQL or REST proxy pattern.
- `commerce_core_ops` sits above them and gives agents one operator-facing entrypoint.
- Reads and writes go to platform APIs (not semantic warehouse tables).
- Internally it uses provider adapters so agent commands stay unified.

### Read Path (all platforms)

- **Shopify / BigCommerce / WooCommerce / Magento**: `/functions/v1/commerce-core-ops` with `action=DIRECT_READ`
- Auth check is unified first (JWT + workspace + member + subscription), then provider adapter executes platform API calls.

### Write Path

- **Shopify / BigCommerce / WooCommerce / Magento**: `/functions/v1/commerce-core-ops` with `action=DIRECT_WRITE`
- Same unified auth gate, then provider-specific write adapter.

## Security Model (Required)

Before every read/write command:

1. Validate JWT (`auth/v1/user`)
2. Verify active `workspace_members` membership
3. Verify workspace record is ACTIVE
4. Verify `workspace_billing_windows` has an ACTIVE non-expired window (`valid_from <= now < valid_to`)
5. Ensure `user_id` matches JWT subject
6. Enforce request-scoped `workspace_id` and `user_id`

The CLI does this automatically (unless explicit debug bypass flags are used).

### Error Interpretation (Important)

When bootstrap/read/write fails, classify the blocker correctly:

- `BILLING_WINDOW_MISSING` / `BILLING_WINDOW_EXPIRED` / `BILLING_WINDOW_INACTIVE`:
  billing is blocked. Do **not** claim store connections are missing.
- Auth/membership/workspace errors:
  report access/workspace state issue directly.
- Only report "no connected stores" after `providers` / `connections` succeeds and returns no active platforms.

## Command Map

### Read

```bash
node skills/commerce_core_ops/scripts/run.js providers
node skills/commerce_core_ops/scripts/run.js connections
node skills/commerce_core_ops/scripts/run.js read shopify products --limit 20 --since 2026-01-01
node skills/commerce_core_ops/scripts/run.js read:entity --platform woocommerce --entity orders --limit 50 --since 2026-01-01
node skills/commerce_core_ops/scripts/run.js read:entity --platform magento --entity order_items --order-id 100001234
```

### Auth Check

```bash
node skills/commerce_core_ops/scripts/run.js auth
```

### Product Write (all platforms)

```bash
node skills/commerce_core_ops/scripts/run.js write:product --platform shopify --op update --payload '{"id":"gid://shopify/Product/123","title":"Bustly Commerce Tee"}' --function commerce-core-ops
node skills/commerce_core_ops/scripts/run.js write:product --platform bigcommerce --op create --payload '{"name":"Sample","sku":"sample-1","price":19.99}' --function commerce-core-ops
node skills/commerce_core_ops/scripts/run.js write:product --platform woocommerce --op update --payload '{"id":"385","name":"New Name"}' --function commerce-core-ops
node skills/commerce_core_ops/scripts/run.js write:product --platform magento --op inventory_adjust --payload '{"sku":"sample-1","delta":5}' --function commerce-core-ops
```

## References

- `references/contracts.md` - direct product write API contract
- `references/edge-function-commerce-core-ops.ts` - secure direct read/write edge function (JWT + workspace + Nango-backed token)
- `scripts/run.js` - unified CLI implementation
