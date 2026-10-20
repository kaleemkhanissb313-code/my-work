import { describe, expect, it } from 'vitest'
import { computeFigures, findDuplicate, overlappingAllocations, parsePercent, periodResult, reversalOf, splitByShares, validateDraft } from './engine'
import { PARTNER_SEED, type BpLine, type BpTxn, type BpTxnDraft, type BpTxnType } from './types'

const partners = PARTNER_SEED.map((p) => ({ id: p.id }))
const ids = partners.map((p) => p.id)
const [N, K, A, S, H] = ids
let seq = 0
function draft(type: BpTxnType, amount: number, extra: Partial<BpTxnDraft> = {}): BpTxnDraft {
  return {
    type, amount, date: '2026-10-01', time: '10:00', lines: [], fromId: null, toId: null, method: null, reference: '', description: 'x', project: '',
    proofIds: [], period: null, allocMode: null, basis: null, reverses: null, reversesType: null, reason: '', ...extra,
  }
}
function txn(type: BpTxnType, amount: number, extra: Partial<BpTxnDraft> = {}): BpTxn {
  seq++
  return {
    ...draft(type, amount, extra), id: `t${seq}`, txnNo: `BP-${seq}`, reversedBy: null,
    createdAt: 0, updatedAt: 0, deletedAt: null, archived: false, favorite: false, pinned: false, tags: [], version: 1,
  }
}
const L = (...pairs: [string, number][]): BpLine[] => pairs.map(([partnerId, amount]) => ({ partnerId, amount }))
const fig = (f: ReturnType<typeof computeFigures>, id: string) => f.partners.find((p) => p.partnerId === id)!

describe('partner accounting engine', () => {
  it('records unequal contributions exactly and reconciles cash', () => {
    // Rs 100,000 total: 40k / 25k / 15k / 12k / 8k (paisa)
    const inv = txn('initial_capital', 10_000_000, { lines: L([N, 4_000_000], [K, 2_500_000], [A, 1_500_000], [S, 1_200_000], [H, 800_000]) })
    const f = computeFigures(partners, [inv])
    expect(f.cash).toBe(10_000_000)
    expect(f.capital).toBe(10_000_000)
    expect(fig(f, N).contributed).toBe(4_000_000)
    expect(fig(f, H).balance).toBe(800_000)
    expect(f.reconciles).toBe(true)
  })

  it('keeps partner-to-partner transfers out of revenue, expenses and cash', () => {
    const f = computeFigures(partners, [
      txn('investment', 1_000_000, { lines: L([N, 1_000_000]) }),
      txn('transfer', 300_000, { fromId: N, toId: K, method: 'cash' }),
    ])
    expect(f.cash).toBe(1_000_000)
    expect(f.revenue).toBe(0)
    expect(f.expenses).toBe(0)
    expect(fig(f, N).paid).toBe(300_000)
    expect(fig(f, K).received).toBe(300_000)
    expect(fig(f, N).settlement).toBe(300_000) // others owe Noman
    expect(fig(f, K).settlement).toBe(-300_000) // Kaleem owes
    expect(f.outstandingSettlements).toBe(300_000)
    expect(f.reconciles).toBe(true)
  })

  it('computes net profit, allocations, distributions and the unallocated remainder', () => {
    const txns = [
      txn('initial_capital', 5_000_000, { lines: L([N, 3_000_000], [K, 2_000_000]) }),
      txn('revenue', 8_000_000), txn('expense', 3_000_000),
      // Net Rs 50,000 → split by profit shares that differ from capital (e.g. 20% each)
      txn('profit_alloc', 4_000_000, { lines: L([N, 800_000], [K, 800_000], [A, 800_000], [S, 800_000], [H, 800_000]) }),
      txn('profit_dist', 500_000, { lines: L([A, 500_000]) }),
    ]
    const f = computeFigures(partners, txns)
    expect(f.net).toBe(5_000_000)
    expect(f.unallocated).toBe(1_000_000)
    expect(f.cash).toBe(5_000_000 + 5_000_000 - 500_000)
    expect(fig(f, A).profitPayable).toBe(300_000)
    expect(fig(f, A).balance).toBe(300_000) // no capital, 8k allocated − 5k paid
    expect(f.distributed).toBe(500_000)
    expect(f.reconciles).toBe(true)
  })

  it('allocates losses by the loss agreement and reduces partner balances', () => {
    const f = computeFigures(partners, [
      txn('initial_capital', 2_000_000, { lines: L([N, 1_000_000], [K, 1_000_000]) }),
      txn('expense', 600_000),
      txn('loss_alloc', 600_000, { lines: L([N, 450_000], [K, 150_000]) }),
    ])
    expect(f.net).toBe(-600_000)
    expect(f.unallocated).toBe(0)
    expect(fig(f, N).balance).toBe(550_000)
    expect(fig(f, K).balance).toBe(850_000)
    expect(f.reconciles).toBe(true)
  })

  it('reversals cancel the original exactly without deleting it', () => {
    const t = txn('investment', 700_000, { lines: L([S, 700_000]) })
    const rev = txn('correction', 0, reversalOf(t, 'Entered twice', '2026-10-02', '09:00'))
    const f = computeFigures(partners, [t, rev])
    expect(f.cash).toBe(0)
    expect(fig(f, S).contributed).toBe(0)
    expect(f.reconciles).toBe(true)
  })

  it('flags split entries whose lines do not add up', () => {
    const f = computeFigures(partners, [txn('investment', 1000, { lines: L([N, 999]) })])
    expect(f.inconsistent).toEqual([expect.any(String)])
    expect(f.reconciles).toBe(false)
  })
})

describe('profit sharing helpers', () => {
  it('splits by basis points exactly, distributing leftover paisa', () => {
    const shares = ids.map((partnerId) => ({ partnerId, bp: 2000 }))
    expect(splitByShares(5_000_000, shares).map((l) => l.amount)).toEqual([1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000])
    const odd = splitByShares(100, [{ partnerId: N, bp: 3333 }, { partnerId: K, bp: 3333 }, { partnerId: A, bp: 3334 }])
    expect(odd.reduce((a, l) => a + l.amount, 0)).toBe(100)
    expect(() => splitByShares(100, [{ partnerId: N, bp: 5000 }])).toThrow(/100%/)
  })

  it('parses percentages into basis points', () => {
    expect(parsePercent('20')).toBe(2000)
    expect(parsePercent('33.33')).toBe(3333)
    expect(parsePercent('100')).toBe(10000)
    expect(parsePercent('100.5')).toBeNull()
    expect(parsePercent('-1')).toBeNull()
    expect(parsePercent('1.234')).toBeNull()
  })

  it('computes a period result per project and finds overlapping allocations', () => {
    const txns = [
      txn('revenue', 1000, { date: '2026-09-30', project: 'Shop' }),
      txn('revenue', 5000, { date: '2026-10-05', project: 'Shop' }),
      txn('expense', 2000, { date: '2026-10-06', project: 'Shop' }),
      txn('revenue', 9000, { date: '2026-10-07', project: 'Other' }),
      txn('profit_alloc', 3000, { project: 'Shop', period: { start: '2026-10-01', end: '2026-10-31' }, lines: L([N, 3000]) }),
    ]
    expect(periodResult(txns, '2026-10-01', '2026-10-31', 'Shop')).toEqual({ revenue: 5000, expenses: 2000, net: 3000 })
    expect(periodResult(txns, '2026-10-01', '2026-10-31', null).net).toBe(12000)
    expect(overlappingAllocations(txns, '2026-10-15', '2026-11-15', 'Shop')).toHaveLength(1)
    expect(overlappingAllocations(txns, '2026-11-01', '2026-11-30', 'Shop')).toHaveLength(0)
  })
})

describe('validation and duplicates', () => {
  it('requires split lines to equal the total', () => {
    expect(validateDraft(draft('investment', 1000, { lines: L([N, 600], [K, 300]) }), ids)).toHaveProperty('lines')
    expect(validateDraft(draft('investment', 1000, { lines: L([N, 600], [K, 400]) }), ids)).toEqual({})
    expect(validateDraft(draft('investment', 0, { lines: [] }), ids)).toHaveProperty('amount')
  })

  it('validates transfers', () => {
    expect(validateDraft(draft('transfer', 100, { fromId: N, toId: N, method: 'cash' }), ids)).toHaveProperty('toId')
    expect(validateDraft(draft('transfer', 100, { fromId: N, toId: K }), ids)).toHaveProperty('method')
    expect(validateDraft(draft('transfer', 100, { fromId: N, toId: K, method: 'bank' }), ids)).toEqual({})
  })

  it('detects likely duplicate entries but ignores reversed ones', () => {
    const t = txn('transfer', 500, { fromId: N, toId: K, method: 'cash' })
    const d = draft('transfer', 500, { fromId: N, toId: K, method: 'bank' })
    expect(findDuplicate([t], d)?.id).toBe(t.id)
    expect(findDuplicate([{ ...t, reversedBy: 'x' }], d)).toBeUndefined()
    expect(findDuplicate([t], { ...d, amount: 501 })).toBeUndefined()
  })
})
