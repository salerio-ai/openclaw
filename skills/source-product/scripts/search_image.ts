#!/usr/bin/env tsx
/**
 * Search AliExpress products by image
 *
 * Usage:
 *   npm run search:image -- "https://example.com/product-image.jpg"
 *   npm run search:image -- "/path/to/local/image.jpg"
 *   npm run search:image -- --base64 "data:image/jpeg;base64,..."
 *   npm run search:image -- "https://example.com/product.jpg" --sortType "same"
 */

import { readFileSync } from 'fs';
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

/**
 * Convert local file to base64
 */
function fileToBase64(filePath: string): string {
  try {
    const imageBuffer = readFileSync(filePath);
    const base64 = imageBuffer.toString('base64');

    // Detect mime type from extension
    const ext = filePath.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'avif': 'image/avif',
    };
    const mimeType = mimeTypes[ext || ''] || 'image/jpeg';

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if input is a URL
 */
function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://');
}

/**
 * Check if input is a file path
 */
function isFilePath(input: string): boolean {
  return !isUrl(input) && !input.startsWith('--') && (input.includes('/') || input.includes('\\'));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  npm run search:image -- "<image_url>"');
    console.error('  npm run search:image -- "/path/to/local/image.jpg"');
    console.error('  npm run search:image -- --base64 "<base64_string>"');
    console.error('');
    console.error('Examples:');
    console.error('  npm run search:image -- "https://example.com/product.jpg"');
    console.error('  npm run search:image -- "./product.jpg"');
    console.error('  npm run search:image -- --base64 "data:image/jpeg;base64,..."');
    console.error('  npm run search:image -- "https://example.com/product.jpg" --sortType "same"');
    process.exit(1);
  }

  const params: SearchImageParams = {};
  let inputSource = '';

  // Parse arguments
  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Check for --base64 flag
    if (arg === '--base64') {
      const base64Value = args[i + 1];
      if (!base64Value) {
        console.error('Error: --base64 requires a value');
        process.exit(1);
      }
      params.image_base64 = base64Value;
      inputSource = 'base64';
      i += 2;
      continue;
    }

    // Check for optional parameters
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const value = args[i + 1];

      if (!value) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }

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
        default:
          console.error(`Warning: Unknown parameter ${key}`);
      }
      i += 2;
      continue;
    }

    // If it's not a flag, it's the input (URL or file path)
    if (!inputSource) {
      const input = arg;

      if (isUrl(input)) {
        params.image_url = input;
        inputSource = 'URL';
      } else if (isFilePath(input)) {
        params.image_base64 = fileToBase64(input);
        inputSource = `file: ${input}`;
      } else {
        // Assume it's a base64 string without the flag
        params.image_base64 = input;
        inputSource = 'base64';
      }
    }

    i++;
  }

  // Validate that we have an image input
  if (!params.image_url && !params.image_base64) {
    console.error('Error: No image input provided. Use URL, file path, or --base64.');
    process.exit(1);
  }

  try {
    console.log(`Searching AliExpress by image (${inputSource})...\n`);

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
