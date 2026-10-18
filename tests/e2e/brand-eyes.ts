import {
  $,
  browser,
  expect,
} from '@wdio/globals'

type GazeEvidence = {
  samples: number[][]
  enters: number
  trusted: boolean
}

export async function verifyBrandEyes(
  selector: string,
  screenshot: string,
): Promise<void> {
  const host = $(selector)
  await expect(host).toBeDisplayed()
  await browser.action('pointer').move({ origin: 'viewport', x: 600, y: 300 }).perform()
  await browser.execute((hostSelector) => {
    const brand = document.querySelector(hostSelector)!
    const eyes = brand.querySelector('[data-brand-eyes]')!
    const evidence: GazeEvidence = { samples: [], enters: 0, trusted: false }
    const state = window as typeof window & { brandGaze?: GazeEvidence; disposeBrandGaze?: () => void }
    state.disposeBrandGaze?.()
    state.brandGaze = evidence
    const listener = {
      handleEvent(event: Event): void {
        evidence.enters += 1
        evidence.trusted = event.isTrusted
      },
    }
    brand.addEventListener('pointerenter', listener)
    const observer = new MutationObserver(() => {
      const values = eyes.getAttribute('transform')?.match(/-?\d+(?:\.\d+)?/gu)?.map(Number) ?? [0, 0]
      evidence.samples.push(values)
    })
    observer.observe(eyes, { attributes: true, attributeFilter: ['transform'] })
    state.disposeBrandGaze = () => {
      observer.disconnect()
      brand.removeEventListener('pointerenter', listener)
    }
  }, selector)
  await host.$('svg').moveTo()
  await browser.waitUntil(async () => browser.execute(() => {
    const state = window as typeof window & { brandGaze?: GazeEvidence }
    const samples = state.brandGaze!.samples
    return samples.some(([x]) => x! < -1) && samples.some(([x]) => x! > 1)
  }), { timeoutMsg: 'Brand did not greet left and right through real pointer input' })
  const point = await browser.execute((hostSelector) => {
    const bounds = document.querySelector(hostSelector)!.getBoundingClientRect()
    return { x: Math.round(bounds.right - 4), y: Math.round(bounds.top + bounds.height / 2) }
  }, selector)
  await browser.action('pointer').move({ origin: 'viewport', ...point, duration: 100 }).perform()
  await browser.waitUntil(async () => browser.execute((hostSelector) => {
    const transform = document.querySelector(`${hostSelector} [data-brand-eyes]`)!.getAttribute('transform')
    return Number(transform?.match(/-?\d+(?:\.\d+)?/gu)?.[0]) > 1.45
  }, selector), { timeoutMsg: 'Gaze did not follow the pointer over the brand name' })
  const evidence = await browser.execute(() => (window as typeof window & { brandGaze: GazeEvidence }).brandGaze)
  expect(evidence.trusted).toBe(true)
  expect(evidence.enters).toBe(1)
  for (const [x, y] of evidence.samples) {
    expect(Math.abs(x!)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(y!)).toBeLessThanOrEqual(0.8)
  }
  await browser.saveScreenshot(screenshot)
  await browser.action('pointer').move({ origin: 'viewport', x: 600, y: 300 }).perform()
  await browser.waitUntil(async () => (await host.$('[data-brand-eyes]').getAttribute('transform')) === null,
    { timeoutMsg: 'Gaze did not return to its neutral position' })
  await expect(host.$('svg')).toHaveAttribute('aria-hidden', 'true')
  expect(await host.$('svg').getAttribute('tabindex')).toBeNull()
  await browser.execute(() => (window as typeof window & { disposeBrandGaze?: () => void }).disposeBrandGaze?.())
}
