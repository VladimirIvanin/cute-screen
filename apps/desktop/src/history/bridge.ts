import type {
  CleanupPlan,
  HistoryCursor,
  HistoryPage,
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

/** Review all history pages without granting automatic cleanup consent for older captures. */
export async function previewHistoryClear(
  bridge: HistoryBridge,
  activeId: string | undefined,
  current: () => boolean,
): Promise<CleanupPlan | undefined> {
  const ids: string[] = []
  let next: HistoryCursor | null = null
  do {
    const page: HistoryPage = (await historyRequest(bridge, { kind: 'list', cursor: next }, 'page')).page
    if (!current()) return undefined
    ids.push(...page.items
      .filter((item) => !item.protected && item.captureId !== activeId)
      .map((item) => item.captureId))
    next = page.nextCursor
  } while (next)
  const result = await historyRequest(bridge, {
    kind: 'preview', captureIds: ids, includeLegacy: false, clearCache: false,
  }, 'plan')
  return current() ? result.plan : undefined
}
