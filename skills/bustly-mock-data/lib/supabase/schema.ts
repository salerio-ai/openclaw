/**
 * Schema Reader - Dynamically read table structures
 */

import { getTableSchema } from './client.js'

const schemaCache = new Map<string, TableSchema>()

/**
 * Get table schema with caching
 */
export async function getTableSchemaCached(tableName: string): Promise<TableSchema> {
  if (schemaCache.has(tableName)) {
    return schemaCache.get(tableName)!
  }

  const columns = await getTableSchema(tableName)

  const schema: TableSchema = {
    tableName,
    columns: {},
    primaryKeys: [],
    foreignKeys: [],
    requiredFields: []
  }

  for (const col of columns) {
    schema.columns[col.column_name] = {
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable,
      default: col.column_default,
      description: col.description
    }

    if (!col.is_nullable) {
      schema.requiredFields.push(col.column_name)
    }
  }

  // TODO: Parse primary keys and foreign keys from pg_* tables
  // For now, we'll define them manually in platform rules

  schemaCache.set(tableName, schema)
  return schema
}

/**
 * Clear schema cache
 */
export function clearSchemaCache(): void {
  schemaCache.clear()
}

/**
 * Type definitions
 */
export interface TableSchema {
  tableName: string
  columns: Record<string, ColumnDetails>
  primaryKeys: string[]
  foreignKeys: ForeignKey[]
  requiredFields: string[]
}

export interface ColumnDetails {
  name: string
  type: string
  nullable: boolean
  default?: string
  description?: string
}

export interface ForeignKey {
  column: string
  refTable: string
  refColumn: string
}
