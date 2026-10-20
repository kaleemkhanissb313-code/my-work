import { describe, expect, it } from 'vitest'
import { blankRecord, duplicateOf, filterRecords, formatAmount, longDate, parseAmount, time12, validateRecord, weekday, type PayRecord } from './model'

const partner = { id: 'bp-kaleem', name: 'Kaleem', photo: null }
const valid = () => ({ ...blankRecord(partner, '2026-10-21', '15:05'), amount: 125050 })

describe('payment record dates', () => {
  it('derives the weekday from the date itself', () => {
    expect(weekday('2026-10-21')).toBe('Wednesday')
    expect(weekday('2024-02-29')).toBe('Thursday')
    expect(weekday('2026-02-30')).toBe('')
    expect(weekday('')).toBe('')
  })
  it('formats long dates and 12-hour times', () => {
    expect(longDate('2026-10-21')).toBe('21 October 2026')
    expect(time12('15:05')).toBe('3:05 PM')
    expect(time12('00:30')).toBe('12:30 AM')
    expect(time12('12:00')).toBe('12:00 PM')
  })
})

describe('payment record values', () => {
  it('formats and parses amounts per currency', () => {
    expect(formatAmount(125050, 'PKR')).toBe('Rs 1,250.50')
    expect(formatAmount(100000, 'USD')).toBe('$ 1,000')
    expect(parseAmount('1,250.50')).toBe(125050)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })

  it('requires essentials and confirmation for Paid', () => {
    expect(validateRecord(valid())).toEqual({})
    expect(validateRecord({ ...valid(), amount: 0 })).toHaveProperty('amount')
    expect(validateRecord({ ...valid(), title: ' ' })).toHaveProperty('title')
    expect(validateRecord({ ...valid(), date: '2026-13-01' })).toHaveProperty('date')
    expect(validateRecord({ ...valid(), status: 'paid' })).toHaveProperty('paidConfirmed')
    expect(validateRecord({ ...valid(), status: 'paid', paidConfirmed: true })).toEqual({})
  })

  it('duplicates without reusing the reference or the Paid status', () => {
    const d = duplicateOf({ ...valid(), reference: 'TX-1', status: 'paid', paidConfirmed: true })
    expect(d).toMatchObject({ id: null, reference: '', status: 'pending', paidConfirmed: false, amount: 125050, partnerId: 'bp-kaleem' })
    expect(d.title).toBe('Payment Record (copy)')
  })

  it('filters by text, dates, amounts and status', () => {
    const rec = (over: Partial<PayRecord>) => ({ ...valid(), id: 'x', createdAt: 0, updatedAt: 0, deletedAt: null, archived: false, favorite: false, pinned: false, tags: [], version: 1, ...over }) as PayRecord
    const rows = [rec({ id: 'a', amount: 5000, date: '2026-10-01', purpose: 'Fuel' }), rec({ id: 'b', amount: 90000, date: '2026-10-20', status: 'paid' }), rec({ id: 'c', deletedAt: 1 })]
    const f = { q: '', from: '', to: '', min: null, max: null, status: '' as const }
    expect(filterRecords(rows, f).map((r) => r.id)).toEqual(['a', 'b'])
    expect(filterRecords(rows, { ...f, q: 'fuel' }).map((r) => r.id)).toEqual(['a'])
    expect(filterRecords(rows, { ...f, from: '2026-10-10' }).map((r) => r.id)).toEqual(['b'])
    expect(filterRecords(rows, { ...f, min: 10000 }).map((r) => r.id)).toEqual(['b'])
    expect(filterRecords(rows, { ...f, status: 'paid' }).map((r) => r.id)).toEqual(['b'])
  })
})
