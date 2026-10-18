import { computed } from 'vue'
import {
  createPlacedEmoji,
  replaceEmoji,
  resizeEmoji,
  findEmoji,
  type EditorCommand,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import { loadEmoji } from '../../emoji/resources'
import type { ContextToolbarSchema } from '../types'
import {
  createEmojiState,
  emojiContainsPoint,
  type EmojiContext,
  type EmojiState,
} from './emoji-state'
export {
  EMOJI_PREFERENCES_KEY,
  parseEmojiPreferences,
} from './emoji-state'

function createEmojiPlacement(
  context: EmojiContext,
  state: EmojiState,
  addLayer: (layer: LayerNode) => void,
) {
  const { workspace, props, store } = context
  const { preferences, pending, failure, remember } = state
  let placing = false
  async function place(point: { x: number; y: number }): Promise<void> {
    const document = workspace.activeDocument.value
    const session = props.documentSession
    if (
      !document ||
      !session ||
      props.readOnlyDocument ||
      props.quickSelectionMode ||
      store.activeToolId !== 'emoji' ||
      placing ||
      pending.value ||
      failure.value
    ) return
    const epoch = state.epoch()
    const { assetId, size } = preferences.value
    placing = true
    try {
      await loadEmoji(assetId)
      if (
        !state.valid(epoch) ||
        workspace.activeDocument.value?.id !== document.id ||
        props.documentSession !== session
      ) return
      const bounds = workspace.canvasViewport.value?.imageInsertionTarget()?.bounds ??
        document.crop ?? { x: 0, y: 0, ...document.canvas }
      if (!emojiContainsPoint(bounds, point)) return
      addLayer(createPlacedEmoji(crypto.randomUUID(), assetId, point, size, bounds))
      remember(assetId)
    } catch (error) {
      console.warn('cute-screen emoji insertion failed', error)
      if (state.valid(epoch)) failure.value = store.locale === 'ru' ? 'Не удалось добавить эмоджи. Повторите попытку.' : 'Could not add the emoji. Please retry.'
    } finally {
      placing = false
    }
  }
  return place
}

export function createEmojiController(
  context: EmojiContext,
  addLayer: (layer: LayerNode) => void,
) {
  const { workspace, props, store } = context
  const state = createEmojiState(context)
  const { preferences, image, pending, failure, selected, save, remember, prepare } = state
  async function replace(id: string): Promise<void> {
    const before = selected.value
    const session = props.documentSession
    const epoch = state.epoch()
    if (
      !before ||
      before.locked ||
      props.readOnlyDocument ||
      !session ||
      pending.value
    ) return
    pending.value = true
    try {
      await loadEmoji(id)
      if (
        !state.valid(epoch) ||
        props.documentSession !== session ||
        selected.value !== before
      ) return
      const after = replaceEmoji(before, id)
      if (after.payload.asset.assetId !== before.payload.asset.assetId)
        session.execute({ type: 'updateLayer', before, after })
      remember(id)
      failure.value = undefined
    } catch (error) {
      console.warn('cute-screen emoji replacement failed', error)
      if (state.valid(epoch)) failure.value = store.locale === 'ru' ? 'Не удалось заменить эмоджи. Повторите выбор.' : 'Could not replace the emoji. Please choose again.'
    } finally {
      if (state.valid(epoch)) pending.value = false
    }
  }
  function change(
    id: string,
    value: string,
    defaults = false,
  ): boolean {
    if (!id.startsWith('emoji')) return false
    if (props.readOnlyDocument) return true
    if (id === 'emojiRetry') {
      void prepare()
      return true
    }
    const layer = defaults ? undefined : selected.value
    if (id === 'emojiAsset' && findEmoji(value)) {
      if (layer) void replace(value)
      else {
        preferences.value = { ...preferences.value, assetId: value }
        save()
      }
    }
    if (id === 'emojiSize') {
      const number = Number(value)
      if (!Number.isFinite(number)) return true
      const size = Math.round(Math.max(16, Math.min(layer ? 32768 : 256, number)))
      if (layer && !layer.locked) {
        const after = resizeEmoji(layer, size)
        if (size !== layer.localBounds?.width) props.documentSession?.execute({ type: 'updateLayer', before: layer, after } satisfies EditorCommand)
      } else if (!layer) {
        preferences.value = { ...preferences.value, size }
        save()
      }
    }
    return true
  }
  function schema(selection: boolean): ContextToolbarSchema | undefined {
    const layer = selection ? selected.value : undefined
    if (
      selection &&
      !layer ||
      !workspace.activeDocument.value ||
      workspace.textDraft.value
    ) return undefined
    return { icon: 'emoji', title: store.locale === 'ru' ? 'Эмоджи' : 'Emoji', hint: '', controls: [],
      disabled: props.readOnlyDocument || Boolean(layer?.locked),
      emoji: {
        assetId: layer?.payload.asset.assetId ?? preferences.value.assetId,
        size: layer?.localBounds?.width ?? preferences.value.size,
        recentIds: preferences.value.recentIds, selection, pending: pending.value, error: failure.value } }
  }
  return {
    placeEmoji: createEmojiPlacement(context, state, addLayer),
    change,
    creationSchema: computed(() => store.activeToolId === 'emoji' ? schema(false) : undefined),
    selectionSchema: computed(() => schema(true)),
    configureSchema: computed(() => workspace.toolConfigure.value?.toolId === 'emoji' ? schema(false) : undefined),
    emojiDefaults: computed(() => ({
      assetId: preferences.value.assetId, size: preferences.value.size, image: image.value,
      blocked: pending.value || Boolean(failure.value) || Boolean(workspace.toolConfigure.value) })),
  }
}
