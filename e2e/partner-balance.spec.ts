import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function unlock(page: Page, path: string) {
  await page.goto(path)
  const pw = page.getByLabel('Password', { exact: true })
  await pw.fill('0211')
  await pw.press('Enter')
}
const dialog = (page: Page) => page.getByRole('dialog')
const overall = (page: Page) => page.getByRole('region', { name: 'Overall balance' })

test('overall balance: investment is −, order income is +, partner-wise and combined', async ({ page }) => {
  test.setTimeout(90_000)
  await unlock(page, '/glamiex/partners')
  await expect(overall(page)).toContainText('Rs 0')

  // Kaleem invests PKR 50,000 → −50,000
  await page.getByRole('button', { name: 'Investment / expense' }).first().click()
  await dialog(page).getByRole('radio', { name: /Investment/ }).click()
  await dialog(page).getByLabel('Partner who invested').selectOption({ label: 'Kaleem' })
  await dialog(page).getByLabel('Amount (PKR)').fill('50000')
  await expect(dialog(page)).toContainText('−Rs 50,000')
  await dialog(page).getByRole('button', { name: /^Save/ }).click()
  await expect(overall(page).getByText('−Rs 50,000').first()).toBeVisible()

  // An order pays PKR 10,000 → −40,000
  await page.getByRole('button', { name: 'Income / order' }).first().click()
  await dialog(page).getByLabel('Received by').selectOption({ label: 'Kaleem' })
  await dialog(page).getByLabel('Amount (PKR)').fill('10000')
  await expect(dialog(page)).toContainText('+Rs 10,000')
  await dialog(page).getByRole('button', { name: /^Save/ }).click()
  await expect(overall(page).locator('.text-3xl, .sm\\:text-4xl').first()).toHaveText('−Rs 40,000')

  // A small expense from the business account → −40,010, combined row matches
  await page.getByRole('button', { name: 'Investment / expense' }).first().click()
  await dialog(page).getByRole('radio', { name: /Expense/ }).click()
  await dialog(page).getByLabel('Paid by').selectOption({ label: 'Business account (no partner)' })
  await dialog(page).getByLabel('Amount (PKR)').fill('10')
  await dialog(page).getByLabel('What was it for?').fill('Bank charge')
  await dialog(page).getByRole('button', { name: /^Save/ }).click()
  await expect(overall(page).locator('.text-3xl').first()).toHaveText('−Rs 40,010')
  const kaleemRow = overall(page).getByRole('row', { name: /Kaleem/ })
  await expect(kaleemRow).toContainText('−Rs 50,000')
  await expect(kaleemRow).toContainText('+Rs 10,000')
  await expect(kaleemRow).toContainText('−Rs 40,000')
  await expect(overall(page).getByRole('row', { name: /Combined/ })).toContainText('−Rs 40,010')

  // Ledger shows signed effects and the running balance
  await page.getByRole('tab', { name: 'Ledger' }).click()
  await expect(page.getByText('−Rs 40,010').first()).toBeVisible()
})
