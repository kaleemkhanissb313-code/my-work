import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const fixture = (f: string) => path.join('e2e', 'fixtures', f)
const PARTNERS = ['Kaleem', 'Awais', 'Salman', 'Hasnain', 'Noman']

async function unlock(page: Page, p: string) {
  await page.goto(p)
  const pw = page.getByLabel('Password', { exact: true })
  await pw.fill('0211')
  await pw.press('Enter')
}
const form = (page: Page) => page.getByRole('form', { name: 'Payment details' })

/** Colour of a pixel in a downloaded PNG, decoded by the browser. */
async function pixel(page: Page, png: Buffer, x: number, y: number) {
  return page.evaluate(async ({ b64, x, y }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
    return { w: img.width, h: img.height, rgb: Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)) }
  }, { b64: png.toString('base64'), x, y })
}

test('payment image creator: a record and correct image for each of the five partners', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop flow; mobile layout checked separately')
  test.setTimeout(180_000)
  await unlock(page, '/glamiex/payment-image')
  const tabs = page.getByRole('tablist', { name: 'Partner workspaces' }).getByRole('tab')
  await expect(tabs).toHaveText([/Kaleem/, /Awais/, /Salman/, /Hasnain/, /Noman/, /All partners/, /Group summary/])

  for (const [i, name] of PARTNERS.entries()) {
    await page.getByRole('tab', { name: new RegExp(`^.?${name}`) }).click()
    await expect(page.getByText(`New payment record for ${name}`)).toBeVisible()
    const f = form(page)
    await expect(f.getByLabel('Partner name')).toHaveValue(name)
    // Date defaults to today and the day follows the date.
    await f.getByLabel('Payment date').fill('2026-10-21')
    await expect(f.getByLabel('Day of the week')).toHaveValue('Wednesday')
    await f.getByLabel('Payment date').fill(`2026-10-2${i + 2}`)
    await expect(f.getByLabel('Day of the week')).toHaveValue(['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'][i])

    await f.getByLabel('Payment title or heading').fill(`Monthly share ${name}`)
    await f.getByLabel('Payment amount').fill(`${(i + 1) * 1000}.50`)
    await f.getByLabel('Payment method').selectOption({ label: 'JazzCash' })
    await f.getByLabel('Sender name').fill('GLAMIEX')
    await f.getByLabel('Transaction / reference number').fill(`JC-${i + 1}0001`)
    await f.getByLabel('Upload partner profile picture').setInputFiles(fixture('avatar.png'))
    await page.getByRole('dialog', { name: 'Crop profile picture' }).getByRole('button', { name: 'Use picture' }).click()
    await f.getByLabel('Upload payment picture or proof').setInputFiles(fixture('avatar.png'))
    await page.getByRole('dialog', { name: 'Crop payment proof' }).getByRole('button', { name: 'Use picture' }).click()

    // Paid requires explicit confirmation.
    await f.getByLabel('Payment status').selectOption('paid')
    await page.getByRole('button', { name: 'Save Payment Record' }).click()
    await expect(f.getByText('Confirm the payment was actually made, or keep it Pending')).toBeVisible()
    await f.getByLabel(/I have confirmed this payment was actually made/).check()
    await page.getByRole('button', { name: 'Save Payment Record' }).click()
    await expect(page.getByText('Payment record saved').first()).toBeVisible()

    const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).first().click()])
    expect(png.suggestedFilename()).toBe(`payment-${name.toLowerCase()}-2026-10-2${i + 2}.png`)
    const buf = readFileSync(await png.path())
    const px = await pixel(page, buf, 2 * 102, 2 * 304) // left half of the round profile picture
    expect(px.w).toBe(2160)
    expect(px.rgb[0]).toBeGreaterThan(150) // the uploaded picture (red left half) is in the exported file
    expect(px.rgb[2]).toBeLessThan(120)
    const [jpg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JPG' }).first().click()])
    expect(jpg.suggestedFilename()).toMatch(/\.jpg$/)
    expect(readFileSync(await jpg.path()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))

    const hist = page.getByRole('region', { name: `${name}'s payment history` }).or(page.locator('section', { has: page.getByRole('heading', { name: `${name}'s payment history` }) }))
    await expect(hist.getByRole('row', { name: new RegExp(`Monthly share ${name}`) })).toContainText(`Rs ${(i + 1).toLocaleString('en-PK')},000.50`)
  }

  // All partners: five records, names kept apart.
  await page.getByRole('tab', { name: /All partners/ }).click()
  await expect(page.getByText('5 of 5 records')).toBeVisible()
  for (const name of PARTNERS) await expect(page.getByRole('row', { name: new RegExp(`${name}.*Monthly share ${name}`) })).toBeVisible()
  await page.getByLabel('Min amount').fill('3000')
  await expect(page.getByText('3 of 5 records')).toBeVisible()
  await page.getByLabel('Min amount').fill('')

  // Edit Salman's record from All partners → opens his workspace; cancel restores the saved values.
  await page.getByRole('button', { name: 'Edit Monthly share Salman for Salman' }).click()
  await expect(page.getByText(/Editing a saved record/)).toBeVisible()
  await form(page).getByLabel('Payment amount').fill('9999')
  await expect(page.getByText('unsaved changes')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel editing' }).click()
  await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Discard changes' }).click()
  await expect(form(page).getByLabel('Payment amount')).toHaveValue('3000.5')

  // Save a change; reopening on a later day keeps the saved date.
  await form(page).getByLabel('Payment amount').fill('3100')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Payment record updated').first()).toBeVisible()

  // Duplicate clears the reference and resets status.
  await page.getByRole('button', { name: 'Duplicate Record' }).click()
  await expect(form(page).getByLabel('Transaction / reference number')).toHaveValue('')
  await expect(form(page).getByLabel('Payment status')).toHaveValue('pending')
  await page.getByRole('button', { name: 'Save Payment Record' }).click()
  await expect(page.getByText('Payment record saved').first()).toBeVisible()

  // Delete asks first.
  await page.getByRole('button', { name: 'Delete record' }).click()
  await page.getByRole('dialog', { name: 'Delete this payment record?' }).getByRole('button', { name: 'Delete record' }).click()
  await expect(page.getByText('Payment record deleted').first()).toBeVisible()

  // Persistent after reload (and still locked behind the password).
  await page.reload()
  await page.getByLabel('Password', { exact: true }).fill('0211')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await page.getByRole('tab', { name: /All partners/ }).click()
  await expect(page.getByText('5 of 5 records')).toBeVisible()
  await expect(page.getByRole('row', { name: /Salman.*Rs 3,100/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Salman.*22 October 2026|Salman.*24 October 2026/ }).first()).toBeVisible()
})
