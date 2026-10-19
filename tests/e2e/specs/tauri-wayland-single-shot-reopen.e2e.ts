import {
  browser,
  expect,
} from '@wdio/globals'
import type { LinuxCaptureMethods } from '../../../apps/desktop/src/generated/desktop-ipc'

describe('Wayland capture method after restart', () => {
  it('restores the selected helper from the persisted production preference', async () => {
    const snapshot = await browser.execute(async () => {
      const native = window as unknown as { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
      return native.__TAURI__.core.invoke<LinuxCaptureMethods>('capture_methods')
    })
    expect(snapshot.selected).toBe('gnomeScreenshot')
    expect(snapshot.resolved).toBe('gnomeScreenshot')
  })
})
