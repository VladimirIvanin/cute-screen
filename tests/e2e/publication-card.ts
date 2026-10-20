import { browser } from '@wdio/globals'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'
export async function cardDocument(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eM08: { snapshot(): { document: EditorDocumentV1 } } }
    return state.__cuteScreenE2eM08.snapshot().document
  })
}
export async function cardNative<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return browser.execute(async (name, args) => {
    const state = window as typeof window & {
      __TAURI__: { core: { invoke<T>(name: string, args: unknown): Promise<T> } }
    }
    return state.__TAURI__.core.invoke<T>(name, args)
  }, command, args)
}
