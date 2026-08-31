import '@wdio/tauri-plugin'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const e2eWindowAdapter = Object.freeze({
  close: () => getCurrentWindow().close(),
  hide: () => getCurrentWindow().hide(),
  isDecorated: () => getCurrentWindow().isDecorated(),
  isVisible: () => getCurrentWindow().isVisible(),
})
