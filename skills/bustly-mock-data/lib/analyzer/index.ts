/**
 * Main Data Analyzer - Coordinates all analysis operations
 */

import { getPlatformScale, determineGenerationQuantity, clampQuantity } from './scale.js'
import { analyzeDistribution } from './distribution.js'
import { analyzePlatformPatterns, type PlatformPatterns, type TablePatterns } from './patterns.js'
import type { AnalysisReport, Distribution } from './types.js'

/**
 * Analyze a platform
 */
export async function analyzePlatform(
  platform: string,
  tables: string[]
): Promise<AnalysisReport> {
  console.log(`\n📊 Analyzing ${platform}...`)

  // Get scale
  const scales = await getPlatformScale(tables)
  console.log(`  Scale: ${Object.values(scales).reduce((sum, v) => sum + v, 0)} total records`)

  // Analyze field patterns from real data
  const platformPatterns = await analyzePlatformPatterns(platform, tables)

  // Analyze key distributions
  const distributions: Record<string, Distribution> = {}

  if (platform === 'shopify' || platform === 'bigcommerce' || platform === 'woocommerce' || platform === 'magento') {
    // Analyze price distribution
    const productsTable = `data.dm_products_${platform}`
    if (scales[productsTable] > 0) {
      try {
        distributions['price'] = await analyzeDistribution(productsTable, 'min_price')
        console.log(`  Price: $${distributions['price'].median.toFixed(2)} median`)
      } catch (err) {
        console.warn(`  Warning: Could not analyze price distribution`)
      }
    }
  }

  return {
    platform,
    timestamp: new Date(),
    scales,
    distributions,
    patterns: platformPatterns
  }
}

/**
 * Determine generation strategy
 */
export function determineStrategy(
  analysis: AnalysisReport,
  userStrategy: 'smart' | 'minimal' | 'comprehensive',
  forceCount?: number
): { targetCount: number; mode: string } {
  if (forceCount !== undefined) {
    return { targetCount: clampQuantity(forceCount), mode: 'forced' }
  }

  if (userStrategy === 'minimal') {
    return { targetCount: 10, mode: 'minimal' }
  }

  if (userStrategy === 'comprehensive') {
    return { targetCount: 500, mode: 'comprehensive' }
  }

  // Smart mode
  const ordersTable = `semantic.dm_orders_${analysis.platform}`
  const currentOrders = analysis.scales[ordersTable] || 0
  const targetCount = determineGenerationQuantity(currentOrders)

  return {
    targetCount: clampQuantity(targetCount),
    mode: currentOrders < 50 ? 'expand' : currentOrders < 200 ? 'grow' : 'supplement'
  }
}
