---
name: commerce_core_ops
description: Unified commerce operations for Shopify, BigCommerce, WooCommerce, and Magento. Use this skill for workspace-scoped data reads (products/orders/customers/inventory) and product write operations with strict JWT + workspace membership checks.
metadata: { "openclaw": { "always": true } }
---

This skill focuses on two goals only:

1. Data reads (product/order/customer/inventory)
2. Product writes (import/create/update/delete/inventory adjust)

Use the standalone Node entrypoint directly:
`node skills/commerce_core_ops/scripts/run.js ...`

## Architecture

### Read Path (all platforms)

- Supabase RPC: `get_agent_available_tables`, `get_agent_table_schema`, `run_select_ws`
- Semantic tables: `semantic.dm_*_<platform>`

### Write Path

- **Shopify**: keep existing `/functions/v1/shopify-api`
- **BigCommerce / WooCommerce / Magento**: dedicated direct-write edge function protocol (default slug: `commerce-core-ops`)

Existing full-backfill sync functions (`bigcommerce-async`, `woocommerce-sync`, `magento-sync`) are references for backend Nango integration patterns, not the primary write API for this skill.

## Security Model (Required)

Before every write command:

1. Validate JWT (`auth/v1/user`)
2. Verify active `workspace_members` membership
3. Verify workspace record is ACTIVE
4. Verify `workspace_billing_windows` has an ACTIVE non-expired window (`valid_from <= now < valid_to`)
5. Ensure `user_id` matches JWT subject
6. Enforce request-scoped `workspace_id` and `user_id`

The CLI does this automatically for write commands (unless explicit debug bypass flags are used).

## Command Map

### Read

```bash
node skills/commerce_core_ops/scripts/run.js platforms
node skills/commerce_core_ops/scripts/run.js connect:sources
node skills/commerce_core_ops/scripts/run.js read:tables --platform shopify
node skills/commerce_core_ops/scripts/run.js read:schema semantic.dm_orders_shopify
node skills/commerce_core_ops/scripts/run.js read:query "SELECT * FROM semantic.dm_orders_shopify LIMIT 10"
node skills/commerce_core_ops/scripts/run.js read:entity --platform woocommerce --entity orders --limit 50 --since 2025-01-01
```

### Auth Check

```bash
node skills/commerce_core_ops/scripts/run.js auth:check
```

### Shopify Write

```bash
node skills/commerce_core_ops/scripts/run.js write:shopify --file ./mutation.graphql --vars-file ./vars.json
node skills/commerce_core_ops/scripts/run.js write:product --platform shopify --op update --payload '{"id":"gid://shopify/Product/123","title":"OpenClaw Pro Tee"}'
```

### BigCommerce / WooCommerce / Magento Product Write

```bash
node skills/commerce_core_ops/scripts/run.js write:product --platform bigcommerce --op upsert --payload '{"external_id":"sku-1","name":"Sample","price":19.99}' --function commerce-core-ops
node skills/commerce_core_ops/scripts/run.js write:product --platform woocommerce --op update --payload '{"external_id":"sku-1","name":"New Name"}' --function commerce-core-ops
node skills/commerce_core_ops/scripts/run.js write:product --platform magento --op inventory_adjust --payload '{"external_id":"sku-1","delta":5}' --function commerce-core-ops
```

## References

- `references/contracts.md` - direct product write API contract
- `references/edge-function-commerce-core-ops.ts` - secure edge function template (JWT + workspace + Nango-backed token)
- `scripts/run.js` - unified CLI implementation
