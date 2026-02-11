import { describe, expect, it } from 'vitest';
import { callShopifyAdminGraphql } from '../lib/shopify_api.js';

const endpoint = process.env.SHOPIFY_ADMIN_ENDPOINT?.trim();

const runOrSkip = endpoint ? it : it.skip;

describe('shopify-api', () => {
  runOrSkip('executes a basic shop query', async () => {
    if (!endpoint) {
      return;
    }

    const result = await callShopifyAdminGraphql<{ shop: { name: string } }>({
      endpoint,
      query: 'query { shop { name } }',
    });

    expect(result.errors).toBeFalsy();
    expect(result.data?.shop?.name).toBeTruthy();
  });
});
