import {
  computed,
  onBeforeUnmount,
  shallowRef,
  ref,
  watch,
} from 'vue'
import { findEmoji } from '@cute-screen/editor-renderer'
import { loadEmoji } from '../../emoji/resources'
import type { ResolvedEditorShellProps } from '../contracts'
import type { useEditorShellStore } from '../store'
import type { createWorkspaceState } from './workspace-state'

export interface EmojiContext {
  readonly props: ResolvedEditorShellProps
  readonly store: ReturnType<typeof useEditorShellStore>
  readonly workspace: ReturnType<typeof createWorkspaceState>
}

export function emojiContainsPoint(
  bounds: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
): boolean {
  return point.x >= bounds.x && point.y >= bounds.y &&
    point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height
}

export const EMOJI_PREFERENCES_KEY = 'cute-screen.emoji.v1'
export function parseEmojiPreferences(value: unknown) {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    assetId: typeof data.assetId === 'string' && findEmoji(data.assetId) ? data.assetId : '1f446',
    size: typeof data.size === 'number' && Number.isFinite(data.size) ? Math.max(16, Math.min(256, data.size)) : 64,
    recentIds: Array.isArray(data.recentIds) ? [...new Set(data.recentIds.filter((id): id is string => typeof id === 'string' && Boolean(findEmoji(id))))].slice(0, 12) : [],
  }
}

export function createEmojiState(context: EmojiContext) {
  const { workspace, props, store } = context
  const preferences = shallowRef(parseEmojiPreferences(undefined))
  try {
    preferences.value = parseEmojiPreferences(JSON.parse(localStorage.getItem(EMOJI_PREFERENCES_KEY) ?? 'null'))
  } catch (error) {
    console.warn('cute-screen emoji preferences could not be read', error)
  }
  const image = shallowRef<HTMLImageElement>()
  const pending = ref(false)
  const failure = ref<string>()
  let generation = 0
  let disposed = false
  const selected = computed(() => {
    if (
      store.activeToolId !== 'select' ||
      workspace.toolConfigure.value ||
      workspace.configureDefaultsTool.value ||
      store.selectedLayerIds.length !== 1
    ) return undefined
    const layer = workspace.activeDocument.value?.layers.find((entry) => entry.id === store.selectedLayerId)
    return layer?.kind === 'emoji' ? layer : undefined
  })
  function save(): void {
    try {
      localStorage.setItem(EMOJI_PREFERENCES_KEY, JSON.stringify(preferences.value))
    } catch (error) {
      console.warn('cute-screen emoji preferences could not be saved', error)
    }
  }
  function remember(id: string): void {
    const recentIds = [id, ...preferences.value.recentIds.filter((entry) => entry !== id)].slice(0, 12)
    preferences.value = { ...preferences.value, recentIds }
    save()
  }
  async function prepare(): Promise<void> {
    const epoch = ++generation
    image.value = undefined
    failure.value = undefined
    if (
      store.activeToolId !== 'emoji' ||
      props.readOnlyDocument ||
      props.quickSelectionMode
    ) {
      pending.value = false
      return
    }
    pending.value = true
    try {
      const loaded = await loadEmoji(preferences.value.assetId)
      if (!disposed && epoch === generation) image.value = loaded
    } catch (error) {
      if (!disposed && epoch === generation) {
        console.warn('cute-screen emoji loading failed', error)
        failure.value = store.locale === 'ru' ? 'Не удалось загрузить эмоджи. Повторите попытку.' : 'Could not load the emoji. Please retry.'
      }
    } finally {
      if (!disposed && epoch === generation) pending.value = false
    }
  }
  watch(() => [
    store.activeToolId, workspace.toolActivationRevision.value, workspace.activeDocument.value?.id,
    preferences.value.assetId, props.readOnlyDocument, props.quickSelectionMode,
  ], () => {
    void prepare()
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => {
    disposed = true
    generation++
  })
  return { preferences, image, pending, failure, selected, save, remember, prepare,
    epoch: () => generation,
    valid: (epoch: number) => !disposed && epoch === generation }
}
export type EmojiState = ReturnType<typeof createEmojiState>
