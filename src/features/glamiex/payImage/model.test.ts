import { describe, expect, it } from 'vitest'
import { MAX_PEOPLE, imageFileError, initials, newDesign, newPerson, totals, validateDesign, validatePerson } from './model'

const person = (name: string, amount: string, status: 'paid' | 'pending' = 'paid') => ({ ...newPerson('2026-10-21'), name, amount, status })

describe('payment image model', () => {
  it('totals paid and pending amounts exactly in paisa', () => {
    const t = totals([person('A', '1,250.50'), person('B', '99.50'), person('C', '500', 'pending')])
    expect(t).toEqual({ paid: 135000, pending: 50000, total: 185000 })
  })

  it('ignores invalid amounts in totals', () => {
    expect(totals([person('A', 'abc'), person('B', '-5'), person('C', '10')]).total).toBe(1000)
  })

  it('validates missing names, invalid amounts and dates', () => {
    expect(validatePerson(person('', '100'))).toHaveProperty('name')
    expect(validatePerson(person('Ali', ''))).toHaveProperty('amount')
    expect(validatePerson(person('Ali', '0'))).toHaveProperty('amount')
    expect(validatePerson(person('Ali', '12.345'))).toHaveProperty('amount')
    expect(validatePerson({ ...person('Ali', '10'), date: '' })).toHaveProperty('date')
    expect(validatePerson(person('Ali', '10'))).toEqual({})
  })

  it('accepts 1 to 5 people only', () => {
    const d = newDesign('2026-10-21')
    expect(validateDesign(d).ok).toBe(false) // blank first person
    const ok = { ...d, people: Array.from({ length: MAX_PEOPLE }, (_, i) => person(`P${i}`, '10')) }
    expect(validateDesign(ok).ok).toBe(true)
    expect(validateDesign({ ...ok, people: [...ok.people, person('X', '1')] }).ok).toBe(false)
  })

  it('rejects unsupported or oversized images', () => {
    expect(imageFileError({ type: 'image/gif', size: 10 })).toMatch(/PNG, JPG or WebP/)
    expect(imageFileError({ type: 'application/pdf', size: 10 })).toBeTruthy()
    expect(imageFileError({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/)
    expect(imageFileError({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('builds initials for avatars', () => {
    expect(initials('kaleem khan ali')).toBe('KK')
    expect(initials('  ')).toBe('?')
  })
})
