import { test as base, expect } from '@playwright/test'

/** Tests that exercise app features start already past the website entry password (the lock itself is tested in core.spec.ts). */
export const test = base.extend<{ unlockedSite: void }>({
  unlockedSite: [async ({ page }, use) => {
    await page.addInitScript(() => sessionStorage.setItem('b2a-site-unlocked', 'f1d97b71b1b4e61a'))
    await use()
  }, { auto: true }],
})
export { expect }
