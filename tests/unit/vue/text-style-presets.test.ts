import { describe, expect, it } from 'vitest'

import {
  TEXT_STYLE_PRESETS_STORAGE_KEY,
  createBrowserTextStylePresetsStorage,
} from '../../../packages/editor-vue/src/text-style-presets'

function values() {
  return {
    font: {
      source: 'bundled' as const,
      family: 'Roboto',
      weight: 700 as const,
      style: 'normal' as const,
    },
    fontSize: 24,
    weight: 700 as const,
    italic: false,
    underline: true,
    letterSpacing: 2,
    alignment: 'center' as const,
    lineHeight: 1.5,
    color: { red: 0.2, green: 0.5, blue: 1, alpha: 1 },
    fill: {
      kind: 'solid' as const,
      color: { red: 0.2, green: 0.5, blue: 1, alpha: 1 },
      opacity: 1,
    },
    outline: null,
    background: null,
    opacity: 0.8,
    blendMode: 'screen' as const,
    shadows: [],
  }
}

describe('M07 local text style presets', () => {
  it('round-trips a codec-validated personal preset through local storage', () => {
    const storage = new Map<string, string>()
    const adapter: Storage = {
      get length() {
        return storage.size
      },
      clear: () => storage.clear(),
      getItem: (key) => storage.get(key) ?? null,
      key: () => null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, value),
    }
    const presets = createBrowserTextStylePresetsStorage(adapter)

    presets.save(values())

    expect(
      JSON.parse(storage.get(TEXT_STYLE_PRESETS_STORAGE_KEY) ?? '{}'),
    ).toMatchObject({
      schemaVersion: 1,
    })
    expect(presets.load()).toMatchObject({
      id: 'personal',
      label: 'My preset',
      values: { underline: true, letterSpacing: 2, blendMode: 'screen' },
    })
  })

  it('ignores a corrupt or out-of-contract stored style', () => {
    const storage = new Map<string, string>([
      [
        TEXT_STYLE_PRESETS_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          values: { fontSize: Number.POSITIVE_INFINITY },
        }),
      ],
    ])
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as unknown as Storage

    expect(createBrowserTextStylePresetsStorage(adapter).load()).toBeUndefined()
  })
})
