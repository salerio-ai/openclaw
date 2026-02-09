/**
 * Analysis result types
 */

export interface AnalysisReport {
  platform: string
  timestamp: Date
  scales: Record<string, number>
  distributions: Record<string, Distribution>
  associations?: AssociationMap
  funnels?: FunnelMetrics
}

export interface Distribution {
  min: number
  max: number
  mean: number
  median: number
  p25: number
  p75: number
  p90: number
}

export interface AssociationMap {
  customerProductAffinity: Map<string, string[]>  // customer_id -> product categories
  productPopularity: Map<string, number>          // product_id -> order count
}

export interface FunnelMetrics {
  pageViewToPurchase: number  // ratio
  addToCartToPurchase: number
  purchaseCount: number
}
