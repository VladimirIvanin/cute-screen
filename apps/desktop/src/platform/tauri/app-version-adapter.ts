import { getVersion } from '@tauri-apps/api/app'
import {
  invoke,
  isTauri,
} from '@tauri-apps/api/core'

export async function readAppVersion(): Promise<string> {
  if (isTauri()) return getVersion()
  return import.meta.env.VITE_APP_VERSION
}

export async function openUpdatePage(english: boolean): Promise<void> {
  if (isTauri()) {
    await invoke('open_update_page')
    return
  }
  const ua = navigator.userAgent
  const os = /Windows/u.test(ua) ? 'windows' : /Macintosh/u.test(ua) ? 'macos' : /Linux/u.test(ua) ? 'linux' : null
  const url = new URL(english
    ? 'https://vladimirivanin.github.io/cute-screen/en/'
    : 'https://vladimirivanin.github.io/cute-screen/')
  if (os) {
    url.searchParams.set('version', import.meta.env.VITE_APP_VERSION)
    url.searchParams.set('os', os)
  }
  window.open(url.toString(), '_blank', 'noopener')
}
