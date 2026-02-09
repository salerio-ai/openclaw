/**
 * Business rule types
 */

export interface PlatformSchema {
  name: string
  type: 'ecommerce' | 'ads'
  tables: TableSchema[]
  dependencies: DependencyGraph
  businessRules: BusinessRule[]
}

export interface TableSchema {
  name: string
  columns: Record<string, ColumnDef>
  primaryKeys: string[]
  foreignKeys: ForeignKey[]
  requiredFields: string[]
}

export interface ColumnDef {
  type: string
  nullable: boolean
  default?: any
  enum?: string[]
  validation?: (value: any) => boolean
}

export interface ForeignKey {
  column: string
  refTable: string
  refColumn: string
}

export type DependencyGraph = Record<string, string[]>

export interface BusinessRule {
  description: string
  validate: (data: any) => boolean
}
