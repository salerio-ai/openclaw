/**
 * Magento platform rules and schema
 */

import type { PlatformSchema } from './types.js'

export const magentoSchema: PlatformSchema = {
  name: 'magento',
  type: 'ecommerce',

  tables: [
    {
      name: 'data.dm_products_magento',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        name: { type: 'text', nullable: false },
        price: { type: 'numeric', nullable: false },
        sku: { type: 'text', nullable: true },
        quantity: { type: 'integer', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'name', 'price', 'created_at', 'updated_at']
    },
    {
      name: 'data.dm_variants_magento',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        sku: { type: 'text', nullable: true },
        price: { type: 'numeric', nullable: false },
        quantity: { type: 'integer', nullable: true },
        created_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'product_id', refTable: 'data.dm_products_magento', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'product_id', 'price', 'created_at']
    },
    {
      name: 'data.dm_customers_magento',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        email: { type: 'text', nullable: false },
        firstname: { type: 'text', nullable: true },
        lastname: { type: 'text', nullable: true },
        orders_count: { type: 'integer', nullable: true },
        total_spent: { type: 'numeric', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'email', 'created_at', 'updated_at']
    },
    {
      name: 'data.dm_orders_magento',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        customer_id: { type: 'text', nullable: false },
        status: { type: 'text', nullable: false },
        grand_total: { type: 'numeric', nullable: false },
        subtotal: { type: 'numeric', nullable: false },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'customer_id', refTable: 'data.dm_customers_magento', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'customer_id', 'status', 'grand_total', 'created_at', 'updated_at']
    },
    {
      name: 'data.dm_order_items_magento',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        order_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        qty_ordered: { type: 'integer', nullable: false },
        price: { type: 'numeric', nullable: false },
        created_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'order_id', refTable: 'data.dm_orders_magento', refColumn: 'id' },
        { column: 'product_id', refTable: 'data.dm_products_magento', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'order_id', 'product_id', 'qty_ordered', 'price', 'created_at']
    }
  ],

  dependencies: {
    'data.dm_orders_magento': ['data.dm_products_magento', 'data.dm_customers_magento'],
    'data.dm_order_items_magento': ['data.dm_orders_magento', 'data.dm_products_magento']
  },

  businessRules: [
    {
      description: 'Order grand_total must be >= 0',
      validate: (order) => order.grand_total >= 0
    }
  ]
}
