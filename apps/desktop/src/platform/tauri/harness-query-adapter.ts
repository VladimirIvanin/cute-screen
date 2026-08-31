import { invoke } from '@tauri-apps/api/core'

export async function readE2eHarnessQuery(): Promise<string | null> {
  return invoke<string | null>('get_e2e_harness_query')
}
