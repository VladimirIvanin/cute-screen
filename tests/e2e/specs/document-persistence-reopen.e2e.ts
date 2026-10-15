import {
  $,
  browser,
  expect,
} from '@wdio/globals'

declare global {
  interface Window {
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot():
        | {
          crop: unknown
          layers: readonly {
            kind: string
            payload: Record<string, unknown>
          }[]
          saveState: string
        }
        | undefined
    }
  }
}

describe('M03 persisted document reopen', () => {
  it('opens the editable crop saved by the previous isolated launch', async () => {
    await browser.waitUntil(() => browser.execute(() => window.__cuteScreenE2eDocument?.snapshot()), {
      timeout: 10_000,
      timeoutMsg: 'persisted M03 session did not mount',
    })
    const reopened = await browser.execute(() => window.__cuteScreenE2eDocument?.snapshot())
    expect(reopened).toMatchObject({
      crop: { x: 0, y: 0, width: 120, height: 80 },
      saveState: 'saved',
    })
    expect(reopened?.layers).toHaveLength(2)
    expect(reopened?.layers[0]).toMatchObject({
      kind: 'arrow',
      payload: { path: 'elbow', stroke: { width: 10 } },
    })
    expect(reopened?.layers[1]).toMatchObject({ kind: 'shape', payload: { shape: 'cylinder' } })
    await $('button[aria-label="Arrow"]').click({ button: 'right' })
    await expect($('.cs-tool-configure-popover-host [data-control="stroke"] button')).toHaveAttribute('aria-label', 'Stroke: 10 px')
    await expect($('.cs-tool-configure-popover-host [data-control="arrowPath"] button')).toHaveAttribute('aria-label', 'Geometry: Elbow')
    await browser.keys('Escape')
  })
})
