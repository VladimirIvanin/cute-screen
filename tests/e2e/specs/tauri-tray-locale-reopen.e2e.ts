import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

describe('native tray locale after process restart', () => {
  it('creates the tray in Russian before WebView preference hydration', async () => {
    await expect($('button[aria-label="Настройки"]')).toExist()
    const labels = await browser.execute(async () => {
      type Native = { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
      return (window as unknown as Native).__TAURI__.core.invoke<{ startup: string[] }>('test_tray_labels')
    })
    expect(labels.startup).toEqual(['Снимок области', 'Снимок экрана', 'Снимок окна', 'Снимок активного окна', 'Повторить область', 'Открыть редактор', 'Настройки…', 'Выход'])
    await writeFile(path.resolve(process.env.CUTE_SCREEN_WDIO_ARTIFACTS!, 'tray-locale-reopen.json'), JSON.stringify(labels, null, 2))
  })
})
