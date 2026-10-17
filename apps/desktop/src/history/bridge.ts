import type {
  HistoryRequest,
  HistoryResponse,
} from '../generated/desktop-ipc'

import type { HistoryBridge } from './contracts'
export type { HistoryBridge } from './contracts'

export { nativeHistory } from '../platform/tauri/history-adapter'

export async function historyRequest<K extends HistoryResponse['kind']>(
  bridge: HistoryBridge,
  request: HistoryRequest,
  expected: K,
): Promise<Extract<HistoryResponse, { kind: K }>> {
  const result = await bridge.request(request)
  if (result.kind !== expected) throw new Error(`Unexpected history response: ${result.kind}`)
  return result as Extract<HistoryResponse, { kind: K }>
}

export function historyBytes(
  bytes: number,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024)) + (locale === 'ru' ? ' МиБ' : ' MiB')
}
