import {
  browser,
  expect,
} from '@wdio/globals'
import type { LinuxCaptureMethods } from '../../../apps/desktop/src/generated/desktop-ipc'

describe('Wayland capture method after restart', () => {
  it('restores the selected method from the persisted production preference', async () => {
    const snapshot = await browser.execute(async () => {
      const native = window as unknown as { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
      return native.__TAURI__.core.invoke<LinuxCaptureMethods>('capture_methods')
    })
    const method = process.env.CUTE_SCREEN_E2E_CAPTURE_METHOD === 'gnomeScreenshot' ? 'gnomeScreenshot' : 'gnomeShell'
    expect(snapshot.selected).toBe(method)
    expect(snapshot.resolved).toBe(method)
  })
})
