#!/usr/bin/env tsx
/**
 * Call Shopify Admin GraphQL via edge function
 *
 * Usage:
 *   npm run graphql -- "query { shop { name } }"
 *   npm run graphql -- --file ./query.graphql --vars '{"first":10}'
 *   npm run graphql -- --version 2025-01 "query { shop { name } }"
 */

import { readFileSync } from 'fs';
import { callShopifyAdminGraphql } from '../lib/shopify_api.js';

function readQueryFromFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run graphql -- <query> [--vars <json>] [--file <path>] [--version <YYYY-MM>]');
    process.exit(1);
  }

  let query = '';
  let variables: Record<string, unknown> | undefined;
  let shopifyApiVersion: string | undefined;

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

    if (arg === '--version') {
      const value = args[i + 1];
      if (!value) break;
      shopifyApiVersion = value;
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

    if (!query) {
      query = arg;
      i += 1;
      continue;
    }

    i += 1;
  }

  if (!query) {
    console.error('Missing query. Provide an inline query or use --file <path>.');
    process.exit(1);
  }

  try {
    const result = await callShopifyAdminGraphql({
      query,
      variables,
      ...(shopifyApiVersion ? { shopify_api_version: shopifyApiVersion } : {}),
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
