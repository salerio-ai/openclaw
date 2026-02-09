/**
 * Smart value generators
 */

import type { Distribution } from '../analyzer/types.js'

/**
 * Generate ID
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate email
 */
export function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com']
  const domain = domains[Math.floor(Math.random() * domains.length)]
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '')
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '')
  return `${cleanFirst}.${cleanLast}${Math.floor(Math.random() * 100)}@${domain}`
}

/**
 * Generate price from distribution
 */
export function generatePrice(dist?: Distribution): number {
  if (dist) {
    // Use distribution (will be implemented in distribution.ts)
    const mean = dist.mean || 50
    const variance = (dist.p75 - dist.p25) / 4
    return Math.max(1, Math.round((mean + (Math.random() - 0.5) * variance) * 100) / 100)
  }
  // Default: $10-100
  return Math.round((10 + Math.random() * 90) * 100) / 100
}

/**
 * Generate date in range
 */
export function generateDate(startDate: Date, endDate: Date): Date {
  const start = startDate.getTime()
  const end = endDate.getTime()
  return new Date(start + Math.random() * (end - start))
}

/**
 * Generate date within last N days
 */
export function generateRecentDate(daysBack: number): Date {
  const now = Date.now()
  const msBack = daysBack * 24 * 60 * 60 * 1000
  return new Date(now - Math.random() * msBack)
}

/**
 * Pick random element
 */
export function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Pick random N elements
 */
export function pickRandomN<T>(array: T[], n: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, array.length))
}
