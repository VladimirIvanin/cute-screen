import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { setNumericInput } from './numeric-input'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'

/** Run against the selected loupe created by the production pointer flow. */
export async function verifyLoupePointer(output: string): Promise<void> {
  const payload = async () => (await shapeDocument()).layers.at(-1)!.payload
  const initial = await payload()
  const changeNumber = async (
    id: string,
    label: string,
    value: number,
    cancel = false,
  ) => {
    await $(`[data-loupe-control="${id}"]`).click()
    await setNumericInput($(`[role="dialog"] input[aria-label="${label}"]`), String(value))
    if (!cancel) await browser.keys('Enter')
    await browser.keys('Escape')
    await waitForShapeAnimation()
  }
  for (const size of [256, 512]) {
    const before = await payload()
    await changeNumber('loupeSize', 'Size', size, true)
    expect(await payload()).toEqual(before)
    await changeNumber('loupeSize', 'Size', size)
    expect((await payload()).lens).toMatchObject({ size })
    await browser.keys(['Control', 'z'])
    expect(await payload()).toEqual(before)
    await browser.keys(['Control', 'Shift', 'z'])
    expect((await payload()).lens).toMatchObject({ size })
    const beforeBorder = await payload()
    await changeNumber('loupeBorderWidth', 'Border width', 8, true)
    expect(await payload()).toEqual(beforeBorder)
    await changeNumber('loupeBorderWidth', 'Border width', 8)
    expect((await payload()).border).toMatchObject({ width: 8 })
    if ((beforeBorder.border as { width: number }).width !== 8) {
      await browser.keys(['Control', 'z'])
      expect(await payload()).toEqual(beforeBorder)
      await browser.keys(['Control', 'Shift', 'z'])
      expect((await payload()).border).toMatchObject({ width: 8 })
    }
    await browser.saveScreenshot(`${output}-pointer-${size}.png`)
  }
  await changeNumber('loupeBorderWidth', 'Border width', 0)
  expect((await payload()).border).toMatchObject({ width: 0 })
  await browser.saveScreenshot(`${output}-pointer-no-border.png`)
  await changeNumber('loupeSize', 'Size', (initial.lens as { size: number }).size)
  await changeNumber('loupeBorderWidth', 'Border width', (initial.border as { width: number }).width)
}
