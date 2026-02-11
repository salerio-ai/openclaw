#!/usr/bin/env tsx
/**
 * Call Shopify Admin GraphQL via edge function
 *
 * Usage:
 *   npm run graphql -- "https://your-store.myshopify.com/admin/api/2025-01/graphql.json" "query { shop { name } }"
 *   npm run graphql -- "https://.../graphql.json" --file ./query.graphql --vars '{"first":10}'
 */

import { readFileSync } from 'fs';
import { callShopifyAdminGraphql } from '../lib/shopify_api.js';

function readQueryFromFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run graphql -- <endpoint> <query> [--vars <json>] [--file <path>]');
    process.exit(1);
  }

  let endpoint = '';
  let query = '';
  let variables: Record<string, unknown> | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--vars') {
      const value = args[i + 1];
      if (!value) break;
      try {
        variables = JSON.parse(value);
      } catch (err) {
        console.error('Invalid JSON for --vars');
        process.exit(1);
      }
      i += 2;
      continue;
    }

    if (arg === '--vars-file') {
      const value = args[i + 1];
      if (!value) break;
      try {
        const content = readFileSync(value, 'utf-8');
        variables = JSON.parse(content);
      } catch (err) {
        console.error('Invalid JSON file for --vars-file');
        process.exit(1);
      }
      i += 2;
      continue;
    }

    if (arg === '--file') {
      const value = args[i + 1];
      if (!value) break;
      query = readQueryFromFile(value);
      i += 2;
      continue;
    }

    if (!endpoint) {
      endpoint = arg;
      i += 1;
      continue;
    }

    if (!query) {
      query = arg;
      i += 1;
      continue;
    }

    i += 1;
  }

  if (!endpoint) {
    console.error('Missing endpoint');
    process.exit(1);
  }

  if (!query) {
    console.error('Missing query. Provide an inline query or use --file <path>.');
    process.exit(1);
  }

  try {
    const result = await callShopifyAdminGraphql({
      endpoint,
      query,
      variables,
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
