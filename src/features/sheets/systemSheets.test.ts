import { buildSystemSheet, SYSTEM_SHEETS } from './systemSheets'
import { computeTotal } from './format'
import { wallToIso } from '@/features/glamiex/time'
import type { GxData } from '@/features/glamiex/engine'

const TZ = 'Asia/Karachi'
const base = { createdAt: 0, updatedAt: 0, deletedAt: null, archived: false, favorite: false, pinned: false, tags: [], version: 1 }
const data: GxData = {
  products: [{ ...base, id: 'p', name: 'Shirt', sku: 'S', category: 'Top', description: '', buyPrice: 50000, sellPrice: 100000, lowStockAt: 2, status: 'active', supplierName: '', supplierContact: '', imageIds: [], videoIds: [], dateAdded: '2026-01-01' }],
  stock: [{ ...base, id: 'opening:p', productId: 'p', qty: 10, reason: 'opening', refId: 'p', note: '', at: wallToIso('2026-10-01', '09:00', TZ) },
    { ...base, id: 'sale:o1:p', productId: 'p', qty: -3, reason: 'sale', refId: 'o1', note: '', at: wallToIso('2026-10-05', '12:00', TZ) },
    { ...base, id: 'sale:o2:p', productId: 'p', qty: -1, reason: 'sale', refId: 'o2', note: '', at: wallToIso('2026-10-06', '12:00', TZ) },
    { ...base, id: 'cancel:o2:p', productId: 'p', qty: 1, reason: 'cancel', refId: 'o2', note: '', at: wallToIso('2026-10-06', '13:00', TZ) }],
  orders: [
    { ...base, id: 'o1', orderNo: 'GX-1', personId: null, items: [{ productId: 'p', name: 'Shirt', sku: 'S', qty: 3, unitPrice: 100000, unitCost: 50000 }], discount: 0, tax: 0, status: 'completed', method: 'cash', at: wallToIso('2026-10-05', '12:00', TZ), notes: '', attachmentIds: [], cancelledAt: null, cancelReason: '' },
    { ...base, id: 'o2', orderNo: 'GX-2', personId: null, items: [{ productId: 'p', name: 'Shirt', sku: 'S', qty: 1, unitPrice: 100000, unitCost: 50000 }], discount: 0, tax: 0, status: 'cancelled', method: 'cash', at: wallToIso('2026-10-06', '12:00', TZ), notes: '', attachmentIds: [], cancelledAt: 1, cancelReason: '' },
  ],
  refunds: [], people: [], payments: [], adIncome: [], adSpend: [], expenses: [],
}
const OCT = { from: '2026-10-01', to: '2026-10-31' }

describe('live business sheets', () => {
  it('every system sheet builds without errors', () => {
    for (const s of SYSTEM_SHEETS) expect(() => buildSystemSheet(s.key, data, OCT, TZ)).not.toThrow()
  })
  it('sales sheet zeroes cancelled orders so totals never double count', () => {
    const s = buildSystemSheet('sales', data, OCT, TZ)
    expect(s.rows).toHaveLength(2)
    expect(computeTotal(s.rows.map((r) => r.cells.total), 'sum')).toBe(3000) // rupees
    expect(s.rows[1].cells.st).toBe('cancelled')
  })
  it('stock sheet reconciles the ledger and values stock at cost', () => {
    const row = buildSystemSheet('stock', data, OCT, TZ).rows[0].cells
    expect(row).toMatchObject({ open: 10, sold: 4, ret: 1, stock: 7, val: 3500, low: 'OK' })
  })
  it('products sheet shows rupees and marks editable fields', () => {
    const s = buildSystemSheet('products', data, OCT, TZ)
    expect(s.rows[0].cells).toMatchObject({ buy: 500, sell: 1000, unit: 500, units: 3, rev: 3000, profit: 1500, margin: 50 })
    expect(Object.keys(s.editable!)).toEqual(['name', 'cat', 'buy', 'sell', 'low'])
  })
  it('overview formats counts as numbers, not rupees', () => {
    const o = buildSystemSheet('overview', data, OCT, TZ)
    const ordersRow = o.rows.find((r) => r.cells.m === 'Orders')!
    expect(o.rowFmt?.[ordersRow.id]).toEqual({ fmt: 'number' })
  })
  it('monthly sheet totals equal the overview net sales', () => {
    const m = buildSystemSheet('monthly', data, OCT, TZ)
    const o = buildSystemSheet('overview', data, OCT, TZ)
    expect(m.rows[0].cells.sales).toBe(o.rows.find((r) => r.cells.m === 'Net sales')!.cells.cur)
  })
})
