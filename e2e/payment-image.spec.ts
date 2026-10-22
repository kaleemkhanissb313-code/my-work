import { expect, test } from './fixtures'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const fixture = (f: string) => path.join('e2e', 'fixtures', f)

test('payment image creator: upload, edit, totals, save and PNG download', async ({ page }) => {
  await page.goto('/glamiex/payment-image/group')
  const pw = page.getByLabel('Password', { exact: true })
  await pw.fill('0211')
  await pw.press('Enter')
  await expect(page.getByRole('heading', { name: '5 Payments' })).toBeVisible()

  // Validation before anything is filled in.
  await page.getByRole('button', { name: 'Download Image' }).click()
  await expect(page.getByText('Enter a name')).toBeVisible()
  await expect(page.getByText('Enter an amount')).toBeVisible()

  const p1 = page.getByRole('listitem', { name: 'Person 1' })
  await p1.getByLabel('Full name').fill('Noman Khan')
  await p1.getByLabel('Amount (Rs)').fill('1,250.50')
  await p1.getByLabel('Profile image for person 1').setInputFiles(fixture('anim.gif'))
  await expect(p1.getByRole('alert')).toHaveText('Use a PNG, JPG or WebP image')
  await p1.getByLabel('Profile image for person 1').setInputFiles(fixture('avatar.png'))
  await expect(p1.getByRole('alert')).toHaveCount(0)
  await expect(p1.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/)

  await page.getByRole('button', { name: 'Add person' }).click()
  const p2 = page.getByRole('listitem', { name: 'Person 2' })
  await p2.getByLabel('Full name').fill('Kaleem')
  await p2.getByLabel('Amount (Rs)').fill('1.2.3')
  await page.getByRole('button', { name: 'Download Image' }).click()
  await expect(p2.getByText(/positive amount/)).toBeVisible()
  await p2.getByLabel('Amount (Rs)').fill('749.50')
  await p2.getByLabel('Status').selectOption('pending')

  // Up to five people only.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add person' }).click()
  await expect(page.getByRole('button', { name: 'Add person' })).toBeDisabled()
  for (let i = 5; i > 2; i--) await page.getByRole('listitem', { name: `Person ${i}` }).getByRole('button', { name: 'Remove person' }).click()

  await expect(page.getByLabel('Preview').getByText('Rs 2,000')).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Image' }).click()])
  expect(download.suggestedFilename()).toMatch(/^payment-record-\d{4}-\d{2}-\d{2}\.png$/)
  const png = readFileSync(await download.path())
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.readUInt32BE(16)).toBe(2160) // high-resolution: 2x the 1080 px base width

  await page.getByRole('button', { name: 'Save design' }).click()
  await expect(page.getByRole('button', { name: 'Open Payment Summary' })).toBeVisible()

  // Reset asks first when there are unsaved changes, then reopen the saved design.
  await p1.getByLabel('Full name').fill('Changed')
  await page.getByRole('button', { name: 'Reset' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByRole('listitem', { name: 'Person 1' }).getByLabel('Full name')).toHaveValue('')
  await page.getByRole('button', { name: 'Open Payment Summary' }).click()
  await expect(page.getByRole('listitem', { name: 'Person 1' }).getByLabel('Full name')).toHaveValue('Noman Khan')
  await expect(page.getByRole('listitem', { name: 'Person 2' }).getByLabel('Amount (Rs)')).toHaveValue('749.50')
})
