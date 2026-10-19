import { FErr } from './formula'
import { computeTotal, effectiveFmt, formatValue, normaliseInput, PROFIT_LOSS_RULES, ruleMatches, validateInput } from './format'
import type { GxSheet, SheetCol } from './types'

describe('sheet formatting', () => {
  it('formats numbers, PKR, percentages and errors', () => {
    expect(formatValue(1250000, 'pkr')).toBe('Rs 1,250,000')
    expect(formatValue(-99.5, 'pkr')).toBe('-Rs 99.50')
    expect(formatValue(12.345, 'percent')).toBe('12.3%')
    expect(formatValue(1234.5, 'decimal2')).toBe('1,234.50')
    expect(formatValue(new FErr('#DIV/0!'), 'pkr')).toBe('#DIV/0!')
    expect(formatValue(null, 'pkr')).toBe('')
  })
  it('validates and normalises input by column type', () => {
    expect(validateInput('abc', 'pkr')).toMatch(/number/)
    expect(validateInput('=A1*2', 'pkr')).toBeNull()
    expect(validateInput('2026-13-01', 'date')).toMatch(/YYYY/)
    expect(validateInput('25:00', 'time')).toMatch(/HH:MM/)
    expect(validateInput('javascript:alert(1)', 'link')).toMatch(/http/)
    expect(normaliseInput('Rs 1,250', 'pkr')).toBe(1250)
    expect(normaliseInput('15%', 'percent')).toBe(15)
    expect(normaliseInput('', 'text')).toBeNull()
  })
  it('applies conditional rules with accessible labels', () => {
    let n = 0
    const [profit, loss] = PROFIT_LOSS_RULES('c1', () => String(++n))
    expect(ruleMatches(profit, 500)).toBe(true)
    expect(ruleMatches(loss, -1)).toBe(true)
    expect(ruleMatches(loss, 0)).toBe(false)
    expect(ruleMatches({ ...profit, op: 'contains', value: 'paid' }, 'Unpaid')).toBe(true)
    const col: SheetCol = { id: 'c1', name: 'Profit', type: 'pkr', width: 120 }
    const sheet = { fmt: { 'r1:c1': { b: true } }, colFmt: { c1: { align: 'right' as const } }, rowFmt: {}, rules: [profit, loss] } as unknown as GxSheet
    expect(effectiveFmt(sheet, 'r1', col, -200)).toMatchObject({ b: true, align: 'right', fmt: 'pkr', color: '#b91c1c', ruleLabel: '▼ Loss' })
    expect(effectiveFmt(sheet, 'r2', col, 0).ruleLabel).toBeUndefined()
  })
  it('computes totals ignoring text and errors', () => {
    const vals = [100, '200', null, 50.5, new FErr('#VALUE!')]
    expect(computeTotal(vals, 'sum')).toBe(150.5)
    expect(computeTotal(vals, 'avg')).toBe(75.25)
    expect(computeTotal(vals, 'count')).toBe(4)
    expect(computeTotal([], 'max')).toBeNull()
  })
})
