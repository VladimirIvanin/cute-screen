import '@wdio/tauri-plugin'
import { getCurrentWindow } from '@tauri-apps/api/window'

declare global {
  interface Window {
    __cuteScreenE2eWindow?: {
      hide(): Promise<void>
      isDecorated(): Promise<boolean>
      isVisible(): Promise<boolean>
    }
  }
}

/**
 * Test-only facade over the real Tauri window API. It is available exclusively
 * in the harness bundle and allows E2E to assert native window behaviour.
 */
window.__cuteScreenE2eWindow = {
  hide: () => getCurrentWindow().hide(),
  isDecorated: () => getCurrentWindow().isDecorated(),
  isVisible: () => getCurrentWindow().isVisible(),
}
