import { browser } from '@wdio/globals'

/** Naive UI can retain a hidden tooltip while the next tool's tooltip opens. */
export async function expectToolTooltip(title: string): Promise<void> {
  await browser.waitUntil(async () => {
    for (const tooltip of await browser.$$('.n-tooltip')) {
      if (await tooltip.isDisplayed() && await tooltip.getText() === title) return true
    }
    return false
  }, { timeoutMsg: `Expected visible tool tooltip: ${title}` })
}
