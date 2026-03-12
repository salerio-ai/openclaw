# workspace-platform-status

Returns the current workspace's connected platform status for Bustly bootstrap and skills.

## Why this is not SQL

This resource is a Supabase Edge Function.
Edge Functions are code deployments, not database schema objects, so they should not be stored as SQL migrations.

## Source of Truth

- Function source: `supabase/functions/workspace-platform-status/index.ts`
- Runtime auth: `verify_jwt = true`

## Deploy

Deploy this function with the Supabase deployment flow used by the repo/tooling.

Required behavior:

- Accept `POST`
- Require a valid JWT
- Read `workspace_id` from request body or `x-workspace-id`
- Verify the caller can access that workspace
- Return workspace integration status using `workspace_integrations` plus platform-specific mapping/account tables

## Current Consumers

- `skills/bustly-search-data/scripts/run.js`
- `docs/reference/templates/BOOTSTRAP.md`
