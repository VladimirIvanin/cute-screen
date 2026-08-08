import { invoke } from '@tauri-apps/api/core'

export async function resolveHarnessSearch(): Promise<string> {
  if (window.location.search) {
    return window.location.search
  }

  if (import.meta.env.VITE_TEST_HARNESS !== 'true') {
    return window.location.search
  }

  try {
    const query = await invoke<string | null>('get_e2e_harness_query')
    if (query) {
      return query.startsWith('?') ? query : `?${query}`
    }
  } catch {
    return window.location.search
  }

  return window.location.search
}
