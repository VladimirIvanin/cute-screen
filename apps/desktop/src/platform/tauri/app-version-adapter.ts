import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'

export async function readAppVersion(): Promise<string> {
  if (isTauri()) return getVersion()
  return import.meta.env.VITE_APP_VERSION
}
