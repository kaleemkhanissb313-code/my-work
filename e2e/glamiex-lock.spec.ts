import { expect, test } from '@playwright/test'

test.describe('GLAMIEX password lock', () => {
  test('locks only GLAMIEX and relocks after a refresh', async ({ page }) => {
    // The rest of the site opens normally.
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/)

    await page.goto('/glamiex')
    await expect(page.getByRole('heading', { name: 'GLAMIEX is locked' })).toBeVisible()

    const field = page.getByLabel('Password', { exact: true })
    await field.fill('1234')
    await field.press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect' })).toHaveText('Incorrect password. Please try again.')

    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(field).toHaveAttribute('type', 'text')

    await field.fill('0211')
    await field.press('Enter')
    await expect(page.getByRole('heading', { name: 'GLAMIEX is locked' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/glamiex/)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'GLAMIEX is locked' })).toBeVisible()
  })
})
