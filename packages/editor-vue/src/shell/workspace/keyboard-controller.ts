import type { ComputedRef, Ref } from 'vue'
import {
  createDuplicateLayerCommand,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type { ToolDescriptor } from '../types'

export interface KeyboardControllerContext {
  readonly props: ResolvedEditorShellProps
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly tools: ComputedRef<readonly ToolDescriptor[]>
  readonly store: {
    readonly selectedLayerId: string | undefined
    readonly selectedLayerIds: readonly string[]
    readonly zoom: number
    selectTool(id: string): void
    runAction(id: 'openImage'): Promise<void>
    clearFeedback(): void
    setLayersOpen(open: boolean): void
    clearLayerSelection(): void
  }
  readonly undo: () => void
  readonly redo: () => void
  readonly copySelectedTextLayer: (cut: boolean) => Promise<void>
  readonly pasteNativeClipboard: () => Promise<void>
  readonly reorderLayer: (id: string, direction: 'up' | 'down') => void
  readonly moveLayer: (id: string, deltaX: number, deltaY: number) => void
}

function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement &&
      (target.isContentEditable || Boolean(target.closest('[role="slider"]'))))
  )
}

function handleToolShortcut(
  context: KeyboardControllerContext,
  event: KeyboardEvent,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  const shortcut = event.key.toLowerCase()
  const tool = context.tools.value.find(
    (candidate) =>
      !candidate.disabled && candidate.shortcut?.toLowerCase() === shortcut,
  )
  if (!tool) return false
  event.preventDefault()
  context.store.selectTool(tool.id)
  return true
}

function handleOpenOrHistory(
  context: KeyboardControllerContext,
  event: KeyboardEvent,
  key: string,
): boolean {
  const modifier = event.metaKey || event.ctrlKey
  if (!modifier) return false
  if (key === 'o') {
    if (context.props.openImageAvailable) {
      event.preventDefault()
      void context.store.runAction('openImage')
    }
    return true
  }
  if (key !== 'z') return false
  event.preventDefault()
  if (event.shiftKey) context.redo()
  else context.undo()
  return true
}

function handleDuplicate(
  context: KeyboardControllerContext,
  event: KeyboardEvent,
  key: string,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || key !== 'd') return false
  const selectedId = context.store.selectedLayerId
  if (!selectedId) return true
  const source = context.activeDocument.value?.layers.find(
    (layer) => layer.id === selectedId,
  )
  if (source && !source.locked) {
    event.preventDefault()
    context.props.documentSession?.execute(
      createDuplicateLayerCommand(source, {
        id: crypto.randomUUID(),
        zoom: Math.max(0.01, context.store.zoom / 100),
        cascadeIndex: 1,
      }),
    )
  }
  return true
}

function handleClipboard(
  context: KeyboardControllerContext,
  event: KeyboardEvent,
  key: string,
): boolean {
  if (!(event.metaKey || event.ctrlKey)) return false
  if ((key === 'c' || key === 'x') && context.store.selectedLayerId) {
    if (context.props.clipboardBridge?.writeClipboardText) {
      event.preventDefault()
      void context.copySelectedTextLayer(key === 'x')
    }
    return true
  }
  if (key !== 'v') return false
  if (
    context.props.clipboardBridge &&
    context.activeDocument.value &&
    context.props.documentSession
  ) {
    event.preventDefault()
    void context.pasteNativeClipboard()
  }
  return true
}

function handleReorder(
  context: KeyboardControllerContext,
  event: KeyboardEvent,
): boolean {
  if (
    !(event.metaKey || event.ctrlKey) ||
    (event.key !== '[' && event.key !== ']') ||
    !context.store.selectedLayerId
  ) {
    return false
  }
  event.preventDefault()
  context.reorderLayer(
    context.store.selectedLayerId,
    event.key === ']' ? 'up' : 'down',
  )
  return true
}

function handleArrowMove(
  context: KeyboardControllerContext,
  event: KeyboardEvent,
): boolean {
  const deltas: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const delta = deltas[event.key]
  if (!delta || context.store.selectedLayerIds.length === 0) return false
  const selected = new Set(context.store.selectedLayerIds)
  const layers = context.activeDocument.value?.layers.filter((layer) =>
    selected.has(layer.id),
  )
  if (layers?.length && !layers.some((layer) => layer.locked)) {
    event.preventDefault()
    const multiplier = event.shiftKey ? 10 : 1
    context.moveLayer(
      context.store.selectedLayerIds[0]!,
      delta[0] * multiplier,
      delta[1] * multiplier,
    )
  }
  return true
}

function handleDelete(
  context: KeyboardControllerContext,
  event: KeyboardEvent,
): boolean {
  if (
    (event.key !== 'Delete' && event.key !== 'Backspace') ||
    !context.store.selectedLayerId
  ) {
    return false
  }
  const document = context.activeDocument.value
  const layer = document?.layers.find(
    (candidate) => candidate.id === context.store.selectedLayerId,
  )
  if (layer && !layer.locked) {
    event.preventDefault()
    context.props.documentSession?.execute({
      type: 'removeLayer',
      layer,
      index: document?.layers.indexOf(layer) ?? -1,
    })
  }
  return true
}

export function createKeyboardController(context: KeyboardControllerContext) {
  function onKeydown(event: KeyboardEvent): void {
    if (isEditingTarget(event.target)) return
    const key = event.key.toLowerCase()
    if (handleToolShortcut(context, event)) return
    if (handleOpenOrHistory(context, event, key)) return
    if (handleDuplicate(context, event, key)) return
    if (handleClipboard(context, event, key)) return
    if (handleReorder(context, event)) return
    if (handleArrowMove(context, event)) return
    if (handleDelete(context, event)) return
    if (event.key === 'Escape') {
      context.store.clearFeedback()
      context.store.setLayersOpen(false)
      context.store.clearLayerSelection()
    }
  }
  return { onKeydown }
}
