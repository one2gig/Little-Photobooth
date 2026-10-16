import { expect, test, type Page } from '@playwright/test'

test('landing introduces the booth without requesting a camera', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Create a Booth' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Join a Booth' })).toBeVisible()
  await expect(page.getByText('Two phones.')).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
})

test('rejects an unknown room code', async ({ page }) => {
  await page.goto('/join')
  await page.getByLabel('Enter the room code').fill('ZZZZZZ')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByText("We couldn't find this booth")).toBeVisible()
})

test('two phones take four shots and download the strip', async ({ browser }) => {
  const options = { viewport: { width: 390, height: 844 }, permissions: ['camera'] as const }
  const hostContext = await browser.newContext(options)
  const guestContext = await browser.newContext(options)
  const outsiderContext = await browser.newContext(options)
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const outsider = await outsiderContext.newPage()

  await host.goto('/create')
  await host.getByLabel('Give your booth a name').fill('Our Little Date')
  await host.getByRole('button', { name: 'Strawberry Milk' }).click()
  await host.getByRole('button', { name: 'Create Booth' }).click()
  await expect(host.getByRole('heading', { name: 'Your booth is ready!' })).toBeVisible()
  const code = (await host.getByLabel('Room code').innerText()).trim()
  expect(code).toHaveLength(6)

  await guest.goto(`/join?code=${code}`)
  await guest.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByRole('heading', { name: "You're in!" })).toBeVisible()
  await expect(guest.getByRole('heading', { name: "You're in!" })).toBeVisible()

  await outsider.goto(`/join?code=${code}`)
  await outsider.getByRole('button', { name: 'Join' }).click()
  await expect(outsider.getByText('This booth already has two people')).toBeVisible()

  for (let shot = 0; shot < 4; shot += 1) {
    await readyUp(host)
    await readyUp(guest)
    await expect(host.getByRole('img', { name: 'Combined shot' })).toBeVisible()
    await expect(guest.getByRole('img', { name: 'Combined shot' })).toBeVisible()
    await host.getByRole('button', { name: 'Keep' }).click()
    await guest.getByRole('button', { name: 'Keep' }).click()
  }

  await expect(host.getByRole('heading', { name: 'Your Photo Strip' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Your Photo Strip' })).toBeVisible()
  const downloadPromise = host.waitForEvent('download')
  await host.getByRole('button', { name: 'Download', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('little-booth')
  await host.getByRole('button', { name: 'End Booth' }).click()
  await expect(host.getByRole('link', { name: 'Create a Booth' })).toBeVisible()
  await hostContext.close()
  await guestContext.close()
  await outsiderContext.close()
})

async function readyUp(page: Page) {
  const enable = page.getByRole('button', { name: 'Enable my camera' })
  if (await enable.isVisible()) await enable.click()
  await page.getByRole('button', { name: "I'm Ready" }).click()
}
