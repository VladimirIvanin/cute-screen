import {
  $,
  expect,
} from '@wdio/globals'

export async function setPhoneOrientation(value: 'portrait' | 'landscape'): Promise<void> {
  const button = $('.cs-card-orientation-toggle')
  const label = value === 'portrait' ? 'Portrait' : 'Landscape'
  await button.waitForEnabled()
  if (await button.getText() !== label) {
    await button.scrollIntoView({ block: 'center' })
    await button.click()
  }
  await expect(button).toHaveText(label)
}
