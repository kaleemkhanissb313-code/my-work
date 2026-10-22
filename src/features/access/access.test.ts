import { readFileSync } from 'node:fs'
import { htmlToMarkdown, markdownToHtml } from '@/lib/markdown'
import { dbNameFor, DEFAULT_DB } from '@/lib/accountScope'
import { FEATURES, featureForPath, recordFeature, SHAREABLE } from './features'
import { shareStatus } from '@/services/accessApi'

describe('shared document rendering is safe', () => {
  it.each([
    '<img src=x onerror="alert(1)">',
    '<script>alert(1)</script>',
    '<a href="javascript:alert(1)">click</a>',
    '<p onclick="alert(1)">hi</p><iframe src="https://evil.test"></iframe>',
    '<a href="https://ok.test/a&quot;onmouseover=alert(1)">x</a>',
  ])('%s', (html) => {
    const out = markdownToHtml(htmlToMarkdown(html))
    expect(out).not.toMatch(/<(script|img|iframe)|\son\w+=|href="\s*javascript:/i)
  })
  it('keeps normal formatting and http links', () => {
    expect(markdownToHtml(htmlToMarkdown('<h2>Plan</h2><p><strong>Day 1</strong> <a href="https://maps.test/x">map</a></p>'))).toMatch(/<h2>Plan<\/h2>[\s\S]*<strong>Day 1<\/strong>[\s\S]*<a href="https:\/\/maps.test\/x">map<\/a>/)
  })
})

describe('per-account local data', () => {
  it('first account adopts the existing data; others and later guests get their own databases', () => {
    expect(dbNameFor(null, null)).toBe(DEFAULT_DB) // local-only / never signed in
    expect(dbNameFor('A', null)).toBe(DEFAULT_DB) // first sign-in keeps existing data
    expect(dbNameFor('A', 'A')).toBe(DEFAULT_DB)
    expect(dbNameFor('B', 'A')).toBe(`${DEFAULT_DB}__B`) // someone else on the same device
    expect(dbNameFor(null, 'A')).toBe(`${DEFAULT_DB}__guest`) // signed out: owner's data not shown
  })
})

describe('feature catalogue matches the database', () => {
  const sql = readFileSync('supabase/migrations/20261025000001_access_control.sql', 'utf8')
  it('has exactly the features seeded in public.app_features', () => {
    const seeded = [...sql.slice(sql.indexOf('insert into public.app_features'), sql.indexOf('on conflict (key)')).matchAll(/\('([a-z]+)', '/g)].map((m) => m[1]).sort()
    expect(FEATURES.map((f) => f.key).sort()).toEqual(seeded)
  })
  it('uses the same shareable tables as public.create_share', () => {
    expect(sql).toContain(`p_table not in (${SHAREABLE.map((s) => `'${s.table}'`).join(', ')})`)
  })
  it('maps pages and records to the right feature', () => {
    expect(featureForPath('/life/foods')).toBe('foods')
    expect(featureForPath('/life/goals')).toBe('life')
    expect(featureForPath('/glamiex/names')).toBe('glamiex')
    expect(featureForPath('/calculator')).toBe('tools')
    expect(featureForPath('/')).toBeNull()
    expect(featureForPath('/access')).toBeNull()
    expect(recordFeature('foods')).toBe('foods')
    expect(recordFeature('bills')).toBe('home')
    expect(recordFeature('goals')).toBe('life')
  })
})

describe('share status', () => {
  it('reports revoked before expired before active', () => {
    const now = Date.parse('2026-10-23T10:00:00Z')
    expect(shareStatus({ revoked_at: '2026-10-01T00:00:00Z', expires_at: null }, now)).toBe('revoked')
    expect(shareStatus({ revoked_at: null, expires_at: '2026-10-23T09:59:00Z' }, now)).toBe('expired')
    expect(shareStatus({ revoked_at: null, expires_at: '2026-10-24T00:00:00Z' }, now)).toBe('active')
  })
})
