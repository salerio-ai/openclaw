# commerce_core_ops

Unified commerce skill for:

- data reads
- product writes

Platforms:

- Shopify
- BigCommerce
- WooCommerce
- Magento

## Entry

```bash
node skills/commerce_core_ops/scripts/run.js help
```

## Design Scope

- Read from semantic warehouse tables
- Write products through platform-appropriate edge function routes

No custom sync workflow commands in this skill.

## References

- `./SKILL.md`
- `./references/contracts.md`
- `./references/edge-function-commerce-core-ops.ts`
