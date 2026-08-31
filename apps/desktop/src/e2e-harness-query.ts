import { readE2eHarnessQuery } from './platform/tauri/harness-query-adapter'

export async function resolveHarnessSearch(): Promise<string> {
  if (window.location.search) {
    return window.location.search
  }

  if (import.meta.env.VITE_TEST_HARNESS !== 'true') {
    return window.location.search
  }

  try {
    const query = await readE2eHarnessQuery()
    if (query) {
      return query.startsWith('?') ? query : `?${query}`
    }
  } catch {
    return window.location.search
  }

  return window.location.search
}
