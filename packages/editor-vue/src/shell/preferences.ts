import type {
  SupportedLocale,
  ThemePreference,
  UiPreferencesV1,
} from './types'
import { resolveSystemLocale } from './i18n'
import {
  defaultDrawingToolPreferences,
  parseDrawingToolPreferences,
  type DrawingToolPreferencesStorage,
} from '@cute-screen/editor-renderer'

export const UI_PREFERENCES_STORAGE_KEY = 'cute-screen.ui-preferences.v1'
export const DRAWING_TOOL_PREFERENCES_STORAGE_KEY = 'cute-screen.drawing-tool-preferences.v1'

export interface UiPreferencesStorage {
  load(): UiPreferencesV1 | undefined
  save(preferences: UiPreferencesV1): void
}

function isLocale(value: unknown): value is SupportedLocale {
  return value === 'en' || value === 'ru'
}

function isTheme(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system'
}

export function defaultPreferences(languages: readonly string[]): UiPreferencesV1 {
  return {
    schemaVersion: 1,
    locale: resolveSystemLocale(languages),
    theme: 'system',
  }
}

export function parsePreferences(
  value: string | null,
  languages: readonly string[],
): UiPreferencesV1 {
  const fallback = defaultPreferences(languages)
  if (!value) return fallback
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { schemaVersion?: unknown }).schemaVersion === 1 &&
      isLocale((parsed as { locale?: unknown }).locale) &&
      isTheme((parsed as { theme?: unknown }).theme)
    ) {
      const preferences = parsed as UiPreferencesV1
      const hidden: unknown = (parsed as { quickHiddenTools?: unknown }).quickHiddenTools
      const order: unknown = (parsed as { quickToolOrder?: unknown }).quickToolOrder
      const { quickHiddenTools: ignored, quickToolOrder: ignoredOrder, ...base } = preferences
      void ignored
      void ignoredOrder
      const ids = (value: unknown): string[] => Array.isArray(value)
        ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !['select', 'hand', 'crop'].includes(id)))]
        : []
      return {
        ...base,
        ...(Array.isArray(hidden) ? { quickHiddenTools: ids(hidden) } : {}),
        ...(Array.isArray(order) ? { quickToolOrder: ids(order) } : {}),
      }
    }
  } catch (error) {
    void error
    // A damaged preference is an expected recoverable condition.
  }
  return fallback
}

export function createBrowserPreferencesStorage(
  storage: Storage | undefined,
  languages: readonly string[],
): UiPreferencesStorage {
  return {
    load: () => {
      if (!storage) return defaultPreferences(languages)
      try {
        return parsePreferences(storage.getItem(UI_PREFERENCES_STORAGE_KEY), languages)
      } catch (error) {
        void error
        return defaultPreferences(languages)
      }
    },
    save: (preferences) => {
      if (!storage) return
      try {
        storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
      } catch (error) {
        void error
      }
    },
  }
}

/** Browser adapter only; the drawing-preferences codec itself lives in editor-core. */
export function createBrowserDrawingToolPreferencesStorage(
  storage: Storage | undefined,
): DrawingToolPreferencesStorage {
  return {
    load: () => {
      if (!storage) return defaultDrawingToolPreferences()
      try {
        const raw = storage.getItem(DRAWING_TOOL_PREFERENCES_STORAGE_KEY)
        return parseDrawingToolPreferences(raw ? JSON.parse(raw) : undefined)
      } catch (error) {
        void error
        return defaultDrawingToolPreferences()
      }
    },
    save: (preferences) => {
      if (!storage) return
      try {
        storage.setItem(DRAWING_TOOL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
      } catch (error) {
        void error
      }
    },
  }
}
