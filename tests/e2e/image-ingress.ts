import { browser } from '@wdio/globals'

export type ImageDocument = {
  id: string
  layers: Array<{
    id: string
    kind: string
    transform: { translateX: number; translateY: number; scaleX: number; scaleY: number }
    localBounds: { width: number; height: number }
    payload: { role?: string; intrinsicWidth?: number; intrinsicHeight?: number }
  }>
}

export async function imageDocument(): Promise<ImageDocument> {
  return browser.execute(() => {
    const state = window as unknown as {
      __cuteScreenE2eQuick?: { snapshot(): ImageDocument }
      __cuteScreenE2eM08?: { snapshot(): { document: ImageDocument } }
      __cuteScreenE2eM05?: { snapshot(): ImageDocument }
    }
    const document = state.__cuteScreenE2eQuick?.snapshot()
      ?? state.__cuteScreenE2eM08?.snapshot()?.document
      ?? state.__cuteScreenE2eM05?.snapshot()
    if (!document) throw new Error('Image document has not mounted')
    return document
  })
}

export async function nativeImageIngress(
  action: string,
  fixture = 'ui-4k.png',
): Promise<void> {
  await browser.execute(async (action, fixture) => {
    const rect = document.querySelector('.cs-empty-state')
      ? document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
      : document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    type Native = { __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } } }
    const native = window as unknown as Native
    await native.__TAURI__.core.invoke('test_image_ingress', { action, fixture,
      x: (rect.left + rect.width / 2) * devicePixelRatio,
      y: (rect.top + rect.height / 2) * devicePixelRatio })
  }, action, fixture)
}
