#!/usr/bin/env tsx
/**
 * Search AliExpress products by text query
 *
 * Usage:
 *   npm run search:text -- "wireless earbuds"
 *   npm run search:text -- "iphone case" --page 2
 */

import { searchTextProducts } from '../lib/aliexpress_api.js';
import { SearchTextParams } from '../lib/aliexpress_api.js';
import type { AliExpressProduct } from '../lib/aliexpress_api.js';

function formatProductForDisplay(product: AliExpressProduct, index: number): void {
  console.log(`${index + 1}. ${product.title}`);
  console.log(`   Price: $${product.price.current}${product.price.original !== product.price.current ? ` (was $${product.price.original})` : ''}`);
  if (product.rating) {
    console.log(`   Rating: ${product.rating}`);
  }
  if (product.sales_volume) {
    console.log(`   Sales: ${product.sales_volume}`);
  }
  console.log(`   Product URL: ${product.url}`);
  console.log(`   Image: ${product.image_url}`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run search:text -- "<query>" [--page <number>] [--pageSize <number>] [--sort <order>]');
    console.error('Example: npm run search:text -- "wireless earbuds"');
    process.exit(1);
  }

  const query = args[0];
  const params: SearchTextParams = {
    query,
  };

  // Parse optional parameters
  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    // Check if it's a flag (starts with --)
    if (arg?.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const value = args[i + 1];

      // Skip if no value provided
      if (!value || value.startsWith('--')) {
        console.warn(`Warning: ${arg} requires a value, skipping`);
        i++;
        continue;
      }

      switch (key) {
        case 'page':
          params.page_index = parseInt(value, 10);
          i += 2;
          break;
        case 'pageSize':
          params.page_size = parseInt(value, 10);
          i += 2;
          break;
        case 'sort':
          params.sort_by = value;
          i += 2;
          break;
        case 'category':
          params.category_id = value;
          i += 2;
          break;
        case 'country':
          params.country_code = value;
          i += 2;
          break;
        default:
          console.warn(`Warning: Unknown parameter ${key}, skipping`);
          i += 2;
          break;
      }
    } else {
      // Not a flag, skip it
      i++;
    }
  }

  try {
    console.log(`Searching AliExpress for: "${query}"...\n`);

    const products = await searchTextProducts(params);

    if (products.length === 0) {
      console.log('No products found.');
      return;
    }

    console.log(`Found ${products.length} products:\n`);

    products.forEach((product, index) => {
      formatProductForDisplay(product, index);
    });

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
