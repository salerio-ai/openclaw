# Supabase Assets

This directory stores Supabase assets that are not represented as SQL migrations.

## Edge Functions

Edge Functions are deployed code artifacts, not Postgres schema objects.
Do not try to represent them as SQL migrations.

Current functions in repo:

- `workspace-platform-status`

Deploy with the Supabase management flow used by this repo's tooling.

## Database Changes

If a change touches tables, views, policies, enums, or SQL functions, store it as a migration.
If a change only touches an Edge Function, store the function source here and keep deployment notes beside it.
