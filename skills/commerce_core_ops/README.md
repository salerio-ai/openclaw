# commerce_core_ops

Unified commerce skill for `bustly-skills`.

This skill consolidates the fragmented commerce surface into one operator-facing entrypoint:

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

## Environment

Preferred env vars:

- `BUSTLY_SUPABASE_URL`
- `BUSTLY_SUPABASE_ANON_KEY`
- `BUSTLY_SUPABASE_ACCESS_TOKEN`
- `BUSTLY_WORKSPACE_ID`
- `BUSTLY_USER_ID`

`~/.bustly/bustlyOauth.json` is auto-detected with both new and legacy shapes:

- New: `supabase.url` / `supabase.anonKey` + `user.userAccessToken` / `user.workspaceId`
- Legacy: `bustlySearchData.SEARCH_DATA_*`

## Design Scope

- Read directly from platform APIs (not semantic warehouse tables)
- Write products through native platform API pass-through (legacy op wrapper remains for compatibility)
- Enforce JWT, workspace membership, workspace active status, and billing-window checks
- All four platforms read/write via `/functions/v1/commerce-core-ops` (`DIRECT_READ` / `DIRECT_WRITE`)

## Failure Semantics

This skill distinguishes billing blockers from connection blockers:

- Billing blockers: `BILLING_WINDOW_MISSING`, `BILLING_WINDOW_EXPIRED`, `BILLING_WINDOW_INACTIVE`
- Connection blockers: only when connection checks succeed and no active platform mapping exists

Do not interpret billing/auth failures as "store not connected".

No custom sync workflow commands in this skill.

## References

- `./SKILL.md`
- `./references/contracts.md`
- `./references/edge-function-commerce-core-ops.ts`
- `../../gateway/supabase/functions/commerce-core-ops/index.ts`
