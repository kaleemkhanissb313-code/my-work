import { expect, test } from '@playwright/test'

test.describe('core workflows', () => {
  test('navigation works on desktop and mobile', async ({ page, isMobile }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/)
    if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Projects & Tasks' }).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tasks', exact: true }).click()
    await expect(page).toHaveURL(/\/tasks/)
  })

  test('a task persists after reload', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Alt+t')
    // The Tasks page opens the editor for ?open=<id>, then removes the parameter from the address.
    await expect(page).toHaveURL(/\/tasks/)
    await expect(page.getByRole('dialog')).toBeVisible()
    const title = page.getByLabel(/title/i).first()
    await title.fill('E2E persisted task')
    await page.getByRole('button', { name: /save/i }).click()
    await page.reload()
    await expect(page.getByText('E2E persisted task').first()).toBeVisible()
  })

  test('command menu searches across modules', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Search & commands' })).toBeVisible()
    await page.keyboard.type('calculator')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/calculator/)
  })

  test('calculator evaluates safely', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Expression').fill('(2+3)*4')
    await expect(page.getByText('= 20')).toBeVisible()
  })

  test('app lock hides content until the PIN is entered', async ({ page }) => {
    await page.goto('/security')
    await page.getByLabel('PIN / password', { exact: true }).fill('4826')
    await page.getByLabel('Confirm').fill('4826')
    await page.getByRole('button', { name: 'Enable app lock' }).click()
    await page.getByRole('button', { name: 'Lock now' }).click()
    await expect(page.getByRole('heading', { name: /is locked/ })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await page.getByLabel('PIN or password').fill('4826')
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Security Center' })).toBeVisible()
  })
})
