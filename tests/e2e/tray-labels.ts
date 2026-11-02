import { browser } from '@wdio/globals'

// macOS offers only Area and Screen capture in the tray (ADR-164).
export const russianTrayLabels = [
  'Снимок области',
  'Снимок экрана',
  'Снимок окна',
  'Снимок активного окна',
  'Повторить область',
  'Открыть редактор',
  ...(process.platform === 'linux' ? ['Открыть изображение', 'История'] : []),
  'Проверить обновления',
  'Настройки',
  'Выход',
].filter((label) => process.platform !== 'darwin' || ![
  'Снимок окна', 'Снимок активного окна', 'Повторить область',
].includes(label))

export interface TrayMenuItem {
  id: string
  text: string
  enabled: boolean
}

export interface TrayLabels {
  items: TrayMenuItem[]
  startup: string[]
  menuIds: string[]
  appMenuInstalled: boolean
  recentLabel: string | null
  recent: TrayMenuItem[]
}

export async function nativeTrayLabels(): Promise<TrayLabels> {
  return browser.execute(async () => {
    type Native = { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
    return (window as unknown as Native).__TAURI__.core.invoke<TrayLabels>('test_tray_labels')
  })
}
