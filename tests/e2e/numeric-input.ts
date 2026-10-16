import { browser } from '@wdio/globals'

/** Native select-all typing also updates controlled text fields, unlike WebDriver clearElement. */
export async function setNumericInput(
  input: { click(): Promise<void> },
  value: string,
): Promise<void> {
  await input.click()
  await browser.keys(['Control', 'a'])
  await browser.keys(value)
}
