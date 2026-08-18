import { $, browser, expect } from '@wdio/globals'

export async function openArrowConfigurePopover(): Promise<void> {
  await browser.execute(() => {
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Arrow"], button[aria-label="Стрелка"]',
    )
    if (!button) throw new Error('Arrow tool button is missing')
    button.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )
  })
  await expect($('.cs-tool-configure-popover-host')).toExist()
}

export async function closeArrowConfigurePopover(): Promise<void> {
  await browser.execute(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    )
  })
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
}

export async function chooseArrowConfigureOption(
  control: 'arrowPath' | 'startCap' | 'endCap' | 'stroke',
  option: string,
): Promise<void> {
  await browser.execute((controlId) => {
    const trigger = document.querySelector<HTMLButtonElement>(
      `.cs-tool-configure-popover-host [data-control="${controlId}"] .cs-arrow-toolbar-trigger`,
    )
    if (!trigger) {
      throw new Error(`Missing arrow toolbar trigger: ${controlId}`)
    }
    trigger.click()
  }, control)
  await browser.waitUntil(
    () =>
      browser.execute((optionName) => {
        return [
          ...document.querySelectorAll<HTMLButtonElement>(
            '.cs-overlay-root .cs-arrow-toolbar-popover button',
          ),
        ].some(
          (button) =>
            button.textContent?.trim() === optionName ||
            button.getAttribute('aria-label') === optionName,
        )
      }, option),
    { timeoutMsg: `Arrow popover option is missing: ${option}` },
  )
  await browser.execute((optionName) => {
    const target = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.cs-overlay-root .cs-arrow-toolbar-popover button',
      ),
    ].find(
      (button) =>
        button.textContent?.trim() === optionName ||
        button.getAttribute('aria-label') === optionName,
    )
    if (!target) {
      throw new Error(`Missing arrow popover option: ${optionName}`)
    }
    target.click()
  }, option)
}
