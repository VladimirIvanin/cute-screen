import { checked } from './tool-settings-validation'
import { syncRememberedToolStyles } from './tool-style-defaults'
import {
  computed,
  onMounted,
  watch,
} from 'vue'
import {
  parseToolSettingsPreferences,
  type JsonObject,
  type LayerNode,
  type LayerStyle,
} from '@cute-screen/editor-renderer'
import { DRAWING_TOOL_PREFERENCES_STORAGE_KEY } from '../preferences'
import type { useEditorShellStore } from '../store'
import type { createWorkspaceState } from './workspace-state'
import type { TextToolDefaults } from '../canvas/contracts'

export const TOOL_SETTINGS_STORAGE_KEY = 'cute-screen.tool-settings.v3'
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export function loadToolSettings(storage: Storage | undefined) {
  const raw = storage?.getItem(TOOL_SETTINGS_STORAGE_KEY) ?? storage?.getItem(DRAWING_TOOL_PREFERENCES_STORAGE_KEY)
  return parseToolSettingsPreferences(raw ? JSON.parse(raw) : undefined)
}
type TextKind = 'text' | 'callout' | 'numberedMarker'
const isTextKind = (kind: string | undefined): kind is TextKind =>
  ['text', 'callout', 'numberedMarker'].includes(kind ?? '')
export function useToolSettingsMemory(
  workspace: ReturnType<typeof createWorkspaceState>,
  store: ReturnType<typeof useEditorShellStore>,
  storage: Storage | undefined,
) {
  const standard = copy(workspace.textDefaults.value)
  const texts: Record<TextKind, TextToolDefaults> = {
    text: standard,
    callout: copy(standard),
    numberedMarker: {
      ...copy(standard),
      fontSize: 16,
      weight: 700,
      alignment: 'center',
      color: { red: 1, green: 1, blue: 1, alpha: 1 },
    },
  }
  let backup: { kind: TextKind; defaults: TextToolDefaults } | undefined
  const kind = computed<TextKind>(() => {
    const candidate = workspace.textDraft.value?.kind ?? workspace.configureDefaultsTool.value ?? store.activeToolId
    if (isTextKind(candidate)) return candidate
    const layer = workspace.activeDocument.value?.layers.find((entry) => entry.id === store.selectedLayerId)
    return store.activeToolId === 'select' && isTextKind(layer?.kind) ? layer.kind : 'text'
  })
  watch(
    kind,
    (next, previous) => {
      if (!workspace.textDraft.value) texts[previous] = copy(workspace.textDefaults.value)
      workspace.textDefaults.value = copy(texts[next])
    },
    { flush: 'sync' },
  )
  watch(
    workspace.textDraft,
    (draft, previous) => {
      if (draft && !previous) backup = { kind: draft.kind, defaults: copy(texts[draft.kind]) }
    },
    { flush: 'sync' },
  )
  watch(
    workspace.textDefaults,
    (value) => {
      if (!workspace.textDraft.value) texts[kind.value] = copy(value)
    },
    { flush: 'sync' },
  )
  function cancel(): void {
    if (backup) {
      texts[backup.kind] = backup.defaults
      if (kind.value === backup.kind) workspace.textDefaults.value = copy(backup.defaults)
      backup = undefined
    }
  }
  function rememberText(layer: LayerNode): void {
    if (
      layer.kind !== 'text' &&
      layer.kind !== 'callout' &&
      layer.kind !== 'numberedMarker'
    ) return
    const content = layer.kind === 'numberedMarker' ? layer.payload.label : layer.payload.content
    const first = content.spans[0]
    const paragraph = content.paragraphs[0]
    const base = texts[layer.kind]
    const patch = first
      ? Object.fromEntries(
          Object.entries(first).filter(
            ([key, value]) =>
              !['start', 'end'].includes(key) &&
              content.spans.every(
                (span) => JSON.stringify((span as unknown as JsonObject)[key]) === JSON.stringify(value),
              ),
          ),
        )
      : {}
    texts[layer.kind] = {
      ...base,
      ...patch,
      ...(paragraph ? { alignment: paragraph.alignment, listKind: paragraph.listKind } : {}),
    }
    if (kind.value === layer.kind) workspace.textDefaults.value = copy(texts[layer.kind])
    backup = undefined
  }
  watch(workspace.rememberedStyles, () => syncRememberedToolStyles(workspace, texts, kind), { flush: 'sync' })
  useMemoryPersistence(workspace, store, storage, texts, kind)
  return { cancelTextDefaults: cancel, rememberTextDefaults: rememberText }
}

function useMemoryPersistence(
  workspace: ReturnType<typeof createWorkspaceState>,
  store: ReturnType<typeof useEditorShellStore>,
  storage: Storage | undefined,
  texts: Record<TextKind, TextToolDefaults>,
  kind: import('vue').Ref<TextKind>,
): void {
  let ready = false
  onMounted(() => {
    try {
      const preferences = loadToolSettings(storage)
      for (const tool of ['text', 'callout', 'numberedMarker'] as const)
        texts[tool] = checked(texts[tool], preferences.settings[tool])
      workspace.textDefaults.value = copy(texts[kind.value])
      workspace.calloutStroke.value = checked(workspace.calloutStroke.value, preferences.settings.callout?.stroke)
      workspace.precisionDefaults.value = checked(workspace.precisionDefaults.value, preferences.settings.precision)
      const marker = preferences.settings.marker?.shape
      if (typeof marker === 'string' && ['circle', 'square', 'diamond', 'star'].includes(marker))
        workspace.markerShape.value = marker as typeof workspace.markerShape.value
      workspace.rememberedStyles.value = (preferences.settings.styles ?? {}) as Partial<
        Record<LayerNode['kind'], LayerStyle>
      >
    } catch (error) {
      console.warn('Tool settings could not be restored', error)
    }
    ready = true
  })
  watch(
    [
      workspace.drawingDefaults,
      workspace.drawingPreferences,
      workspace.textDefaults,
      workspace.calloutStroke,
      workspace.precisionDefaults,
      workspace.markerShape,
      workspace.rememberedStyles,
      workspace.textDraft,
    ],
    () => {
      if (!ready || workspace.textDraft.value) return
      try {
        if (!storage) throw new Error('Local preferences storage is unavailable')
        const settings = {
          ...copy(texts),
          callout: {
            ...copy(texts.callout),
            stroke: copy(workspace.calloutStroke.value),
          },
          precision: copy(workspace.precisionDefaults.value),
          styles: copy(workspace.rememberedStyles.value),
          marker: { shape: workspace.markerShape.value },
        }
        storage.setItem(
          TOOL_SETTINGS_STORAGE_KEY,
          JSON.stringify({
            schemaVersion: 3,
            drawing: {
              ...workspace.drawingPreferences.value,
              defaults: workspace.drawingDefaults.value,
            },
            settings,
          }),
        )
      } catch (error) {
        console.warn('Tool settings could not be saved', error)
        workspace.eyedropperFeedback.value =
          store.locale === 'ru'
            ? 'Настройки действуют в этой сессии, но сохранить их не удалось.'
            : 'Settings apply in this session, but could not be saved.'
      }
    },
    { deep: true },
  )
}
