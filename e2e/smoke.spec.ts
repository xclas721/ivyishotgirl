import { expect, test } from '@playwright/test'

test('home page shows password gate', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('請輸入密碼進入')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByPlaceholder('密碼')).toBeVisible()
  await expect(page.getByRole('button', { name: '進入' })).toBeVisible()
})
