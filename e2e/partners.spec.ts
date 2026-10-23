import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function unlock(page: Page, path: string) {
  await page.goto(path)
  const pw = page.getByLabel('Password', { exact: true })
  await pw.fill('0211')
  await pw.press('Enter')
}
const dialog = (page: Page) => page.getByRole('dialog')
const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save entry' }).click()
const toastText = (page: Page, re: RegExp) => expect(page.getByText(re).first()).toBeVisible()
const card = (page: Page, name: string) => page.getByRole('link', { name: `${name} account` })

test('business partner accounting: invest, settle, allocate, pay out, reverse and report', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Long desktop flow; the mobile card layout is covered by the other specs')
  test.setTimeout(120_000)
  await unlock(page, '/glamiex/partners')
  for (const n of ['Noman', 'Kaleem', 'Awais', 'Salman', 'Hasnain']) await expect(card(page, n)).toBeVisible()

  // 1) Rs 100,000 initial capital, unequal split; validation first.
  await page.getByRole('button', { name: 'Split investment' }).first().click()
  await dialog(page).getByLabel('Total investment amount').fill('100000')
  await dialog(page).getByLabel('Noman').fill('40000')
  await save(page)
  await expect(dialog(page).getByRole('alert')).toContainText('must equal the total')
  for (const [n, v] of [['Kaleem', '25000'], ['Awais', '15000'], ['Salman', '12000'], ['Hasnain', '8000']]) await dialog(page).getByLabel(n).fill(v)
  await save(page)
  await toastText(page, /Recorded BP-.* Rs 100,000/)
  await expect(card(page, 'Noman')).toContainText('Rs 40,000')
  await expect(card(page, 'Hasnain')).toContainText('Rs 8,000')

  // 2) Partner-to-partner payment, then the same again → duplicate warning.
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Record payment' }).click()
    await dialog(page).getByLabel('Paying partner').selectOption({ label: 'Noman' })
    await dialog(page).getByLabel('Receiving partner').selectOption({ label: 'Kaleem' })
    await dialog(page).getByLabel('Amount').fill('5000')
    await dialog(page).getByLabel('Description or reason').fill('Fuel advance')
    await save(page)
  }
  const dup = page.getByRole('dialog', { name: 'Possible duplicate entry' })
  await expect(dup).toContainText('same type, amount and partners')
  await dup.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog', { name: 'Send Money / Partner Settlement' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(card(page, 'Kaleem')).toContainText('Rs 5,000')

  // 3) Revenue 80,000 and expense 30,000 → net profit 50,000; partner transfers don't count.
  for (const [type, amount, desc] of [['revenue', '80000', 'Sales'], ['expense', '30000', 'Stock']]) {
    await page.getByRole('button', { name: 'Revenue / expense' }).click()
    await dialog(page).getByLabel('Type').selectOption(type)
    await dialog(page).getByLabel('Amount').fill(amount)
    await dialog(page).getByLabel('Description').fill(desc)
    await save(page)
    await toastText(page, /Recorded BP-/)
  }
  await expect(page.getByText('Books reconcile')).toBeVisible()

  // 4) Profit shares must total 100% (different from capital), then allocate.
  await page.getByRole('tab', { name: 'Partners & shares' }).click()
  for (const n of ['Noman', 'Kaleem', 'Awais', 'Salman']) await page.getByLabel(`${n} Profit share percent`).fill('20')
  await page.getByLabel('Hasnain Profit share percent').fill('10')
  await expect(page.getByRole('button', { name: 'Save profit' })).toBeDisabled()
  await page.getByLabel('Hasnain Profit share percent').fill('20')
  await page.getByRole('button', { name: 'Save profit' }).click()
  await toastText(page, /Percentages saved/)

  await page.getByRole('tab', { name: 'Profit & Loss' }).click()
  await page.getByLabel('From').fill('2000-01-01')
  await expect(page.getByText('Ready to allocate Rs 50,000 profit')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm allocation' }).click()
  await dialog(page).getByRole('button', { name: 'Confirm allocation' }).click()
  await toastText(page, /Allocated Rs 50,000/)
  await expect(page.getByText(/Already allocated for an overlapping period/)).toBeVisible()

  // 5) Pay out profit (prefilled with unpaid profit, Rs 10,000 each).
  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Pay out profit' }).click()
  await expect(dialog(page).getByText('Partners total Rs 50,000')).toBeVisible()
  await save(page)
  await toastText(page, /Recorded BP-.* Rs 50,000/)
  await expect(page.getByText('Books reconcile')).toBeVisible()

  // 6) Reverse the duplicate-free transfer from the ledger; original stays.
  await page.getByRole('tab', { name: 'Ledger' }).click()
  await page.getByLabel('Type').selectOption('transfer')
  await page.getByRole('row', { name: /Noman → Kaleem/ }).click()
  await dialog(page).getByRole('button', { name: 'Reverse entry' }).click()
  await page.getByLabel(/Reason/).fill('Recorded by mistake')
  await page.getByRole('button', { name: 'Post reversal' }).click()
  await toastText(page, /Reversal posted/)
  await page.getByLabel('Type').selectOption('')
  await expect(page.getByText(/^7 of 7 entries/)).toBeVisible()

  // 7) Partner account: Noman invested 40,000, profit 10,000 allocated and paid → balance 40,000; transfer reversed.
  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await card(page, 'Noman').click()
  await expect(page.getByRole('heading', { name: 'Noman' })).toBeVisible()
  await expect(page.getByText('Overall balance', { exact: true }).first().locator('..')).toContainText('Rs 40,000')
  await expect(page.getByText('Money paid').locator('..')).toContainText('Rs 0')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  expect(download.suggestedFilename()).toMatch(/partner-statement-noman\.csv/)

  // 8) Payment image from a ledger entry carries partners, amounts and the reference.
  await page.getByRole('button', { name: 'Profits' }).click()
  await page.getByRole('row', { name: /Profit distribution/ }).click()
  await dialog(page).getByRole('button', { name: 'Payment image' }).click()
  await expect(page.getByRole('heading', { name: '5 Payments' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'Person 5' }).getByLabel('Full name')).toHaveValue('Hasnain')
  await expect(page.getByRole('listitem', { name: 'Person 1' }).getByLabel('Transaction reference (optional)')).toHaveValue(/^BP-/)
  await expect(page.getByLabel('Preview').getByText('Rs 50,000')).toBeVisible()
})
