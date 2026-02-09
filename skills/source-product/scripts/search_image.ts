#!/usr/bin/env tsx
/**
 * Search AliExpress products by image
 *
 * Usage:
 *   npm run search:image -- "https://example.com/product-image.jpg"
 *   npm run search:image -- "https://example.com/product.jpg" --sortType "same"
 */

import { searchImageProducts } from '../lib/aliexpress_api.js';
import { SearchImageParams } from '../lib/aliexpress_api.js';
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
  if (product.similarity_score !== undefined) {
    console.log(`   Similarity: ${(product.similarity_score * 100).toFixed(1)}%`);
  }
  console.log(`   Product URL: ${product.url}`);
  console.log(`   Image: ${product.image_url}`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run search:image -- "<image_url>"');
    console.error('Example: npm run search:image -- "https://example.com/product-image.jpg"');
    process.exit(1);
  }

  const imageUrl = args[0];
  const params: SearchImageParams = {
    image_url: imageUrl,
  };

  // Parse optional parameters
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];

    if (!key || !value) continue;

    switch (key) {
      case 'shipTo':
        params.ship_to = value;
        break;
      case 'sortType':
        params.sort_type = value;
        break;
      case 'sortOrder':
        params.sort_order = value;
        break;
      case 'searchType':
        params.search_type = value;
        break;
    }
  }

  try {
    console.log(`Searching AliExpress by image: "${imageUrl}"...\n`);

    const products = await searchImageProducts(params);

    if (products.length === 0) {
      console.log('No similar products found.');
      return;
    }

    console.log(`Found ${products.length} similar products:\n`);

    products.forEach((product, index) => {
      formatProductForDisplay(product, index);
    });

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
