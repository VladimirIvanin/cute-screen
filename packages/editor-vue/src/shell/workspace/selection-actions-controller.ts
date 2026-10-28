import { annotationTool } from '@cute-screen/editor-renderer'
import { measuredTextCommand } from '../../text-layout'
import {
  computed,
  ref,
  type Ref,
} from 'vue'
import {
  createDuplicateLayerCommand,
  extractLayerStyle,
  styleCommand,
  canRemoveCalloutStep,
  type EditorCommand,
  type EditorDocumentV1,
  type LayerNode,
  type LayerStyle,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type { useEditorShellStore } from '../store'

// Shared by document mounts in this application session; never persisted as document content.
const styleClipboard = ref<LayerStyle>()
export interface CanvasMenuRequest {
  readonly clientX: number
  readonly clientY: number
  readonly layerId?: string
}
export interface CanvasMenuItem {
  readonly id: string
  readonly label: string
  readonly disabled: boolean
  readonly reason?: string
}
export function sameToolLayerIds(
  layers: readonly LayerNode[],
  layerId: string,
): string[] {
  const source = layers.find((layer) => layer.id === layerId)
  if (
    !source ||
    (source.kind === 'image' &&
      source.payload.role === 'base')
  ) return []
  const tool = annotationTool(source)
  const space = source.space ?? 'content'
  return layers.filter((layer) =>
    annotationTool(layer) === tool &&
    (layer.space ?? 'content') === space &&
    !(layer.kind === 'image' && layer.payload.role === 'base'),
  ).map((layer) => layer.id)
}
interface SelectionContext {
  props: ResolvedEditorShellProps
  store: ReturnType<typeof useEditorShellStore>
  document: Ref<EditorDocumentV1 | undefined>
  error: Ref<string | undefined>
  rememberedStyles: Ref<Partial<Record<import('@cute-screen/editor-renderer').AnnotationTool, LayerStyle>>>
  changeCallout?: (id: string, value: string) => void
  paste: () => Promise<void>
  undo: () => void
  redo: () => void
  fit: () => void
}
export function createSelectionActions(context: SelectionContext) {
  const { store } = context
  const menu = ref<CanvasMenuRequest>()
  const selected = () =>
    context.document.value?.layers.filter((layer) => store.selectedLayerIds.includes(layer.id)) ?? []
  const text = (en: string, ru: string) => (store.locale === 'ru' ? ru : en)
  const blocked = () =>
    !context.props.documentSession || context.props.readOnlyDocument || selected().some((layer) => layer.locked)
  function execute(commands: readonly EditorCommand[]): void {
    if (
      !commands.length ||
      !context.props.documentSession ||
      context.props.readOnlyDocument
    ) return
    context.props.documentSession.execute(commands.length === 1 ? commands[0]! : { type: 'batch', commands })
  }
  function copyStyle(): void {
    const layers = selected()
    if (layers.length === 1) styleClipboard.value = extractLayerStyle(layers[0]!)
  }
  function pasteStyle(): void {
    if (blocked() || !styleClipboard.value) return
    const layers = selected()
    const command = styleCommand(
      layers,
      styleClipboard.value,
      context.document.value?.crop ?? context.document.value?.canvas,
    )
    if (!command) {
      context.error.value = text('No compatible style changes', 'Нет совместимых изменений стиля')
      return
    }
    execute([measuredTextCommand(command)])
    if (layers.every((layer) => annotationTool(layer) === annotationTool(layers[0]!)) && layers[0])
      context.rememberedStyles.value = {
        ...context.rememberedStyles.value,
        [annotationTool(layers[0])]: {
          ...context.rememberedStyles.value[annotationTool(layers[0])],
          ...styleClipboard.value,
        },
      }
  }
  function sameToolIds(layerId: string): string[] {
    return sameToolLayerIds(context.document.value?.layers ?? [], layerId)
  }
  function selectSameTool(layerId: string | undefined): void {
    if (!layerId) return
    const ids = sameToolIds(layerId)
    if (ids.length < 2) return
    store.selectTool('select')
    store.selectLayers(ids)
  }
  const { duplicate, remove, reorder, lock, hide } = createSelectionMutations(context, { selected, blocked, execute })
  const actions: Record<string, () => void> = {
    copyStyle,
    pasteStyle,
    duplicate,
    delete: remove,
    up: () => reorder('up'),
    down: () => reorder('down'),
    lock,
    hide,
    paste: () => {
      void context.paste()
    },
    undo: context.undo,
    redo: context.redo,
    fit: context.fit,
    actual: () => store.setZoom(100),
  }
  function action(id: string): void {
    const layerId = menu.value?.layerId
    menu.value = undefined
    if (id === 'selectSameTool') selectSameTool(layerId)
    else if (id.startsWith('callout')) context.changeCallout?.(id, '')
    else actions[id]?.()
  }
  const items = computed(() => selectionMenuItems(context, menu.value, sameToolIds))

  return {
    canvasMenu: menu,
    canvasMenuItems: items,
    canvasMenuAction: action,
    copyStyle,
    pasteStyle,
    duplicateSelection: duplicate,
    deleteSelection: remove,
    reorderSelection: reorder,
    openCanvasMenu(request: CanvasMenuRequest) {
      if (request.layerId) {
        store.selectTool('select')
        if (!store.selectedLayerIds.includes(request.layerId)) store.selectLayer(request.layerId)
      } else store.clearLayerSelection()
      menu.value = request
    },
  }
}

function createSelectionMutations(
  context: SelectionContext,
  ports: {
    selected: () => readonly import('@cute-screen/editor-renderer').LayerNode[]
    blocked: () => boolean
    execute: (commands: readonly EditorCommand[]) => void
  },
) {
  const { store } = context
  const { selected, blocked, execute } = ports
  function duplicate(): void {
    if (blocked()) return
    execute(
      selected().map((layer) =>
        createDuplicateLayerCommand(layer, {
          id: crypto.randomUUID(),
          zoom: store.zoom / 100,
          cascadeIndex: 1,
        }),
      ),
    )
  }
  function remove(): void {
    if (blocked()) return
    const layers = context.document.value?.layers ?? []
    execute(
      layers
        .flatMap((layer, index) =>
          store.selectedLayerIds.includes(layer.id) ? [{ type: 'removeLayer' as const, layer, index }] : [],
        )
        .reverse(),
    )
  }
  function reorder(direction: 'up' | 'down'): void {
    if (blocked()) return
    const layers = [...(context.document.value?.layers ?? [])]
    const ids = new Set(store.selectedLayerIds)
    const commands: EditorCommand[] = []
    const indices = layers.map((_, index) => index)
    if (direction === 'up') indices.reverse()
    for (const index of indices) {
      const to = index + (direction === 'up' ? 1 : -1)
      const layer = layers[index]
      const neighbor = layers[to]
      if (
        !layer ||
        !neighbor ||
        !ids.has(layer.id) ||
        ids.has(neighbor.id) ||
        (layer.space ?? 'content') !== (neighbor.space ?? 'content')
      ) continue
      commands.push({
        type: 'reorderLayer',
        layerId: layer.id,
        fromIndex: index,
        toIndex: to,
      })
      layers[index] = neighbor
      layers[to] = layer
    }
    execute(commands)
  }

  function lock(): void {
    if (context.props.readOnlyDocument) return
    const locked = !selected().some((layer) => layer.locked)
    execute(selected().map((before) => ({ type: 'updateLayer', before, after: { ...before, locked } })))
  }
  function hide(): void {
    if (!blocked())
      execute(selected().map((before) => ({ type: 'updateLayer', before, after: { ...before, visible: false } })))
  }
  return { duplicate, remove, reorder, lock, hide }
}
function selectionMenuItems(
  context: SelectionContext,
  menu: CanvasMenuRequest | undefined,
  sameToolIds: (layerId: string) => readonly string[],
): readonly CanvasMenuItem[] {
  const { store } = context
  const selected = () =>
    context.document.value?.layers.filter((layer) => store.selectedLayerIds.includes(layer.id)) ?? []
  const blocked = () =>
    !context.props.documentSession || context.props.readOnlyDocument || selected().some((layer) => layer.locked)
  const text = (en: string, ru: string) => (store.locale === 'ru' ? ru : en)

  const disabled = blocked()
  const layers = selected()
  const reason = context.props.readOnlyDocument || !context.props.documentSession
    ? text('Read-only document', 'Документ только для чтения')
    : text('Unlock the entire selection', 'Разблокируйте всё выделение')
  if (!menu?.layerId)
    return [
      {
        id: 'paste',
        label: text('Paste', 'Вставить'),
        disabled: context.props.readOnlyDocument || !context.props.clipboardBridge,
        reason: context.props.readOnlyDocument ? text('Read-only document', 'Документ только для чтения') : text('Clipboard is unavailable', 'Буфер обмена недоступен'),
      },
      ...(!context.props.quickMode
        ? [
            {
              id: 'undo',
              label: text('Undo', 'Отменить'),
              disabled: context.props.readOnlyDocument || !store.documentHistory.canUndo,
              reason: context.props.readOnlyDocument ? reason : text('No action to undo', 'Нечего отменять'),
            },
            {
              id: 'redo',
              label: text('Redo', 'Повторить'),
              disabled: context.props.readOnlyDocument || !store.documentHistory.canRedo,
              reason: context.props.readOnlyDocument ? reason : text('No action to redo', 'Нечего повторять'),
            },
            { id: 'fit', label: text('Fit', 'Вместить'), disabled: false },
            { id: 'actual', label: '1:1', disabled: false },
          ]
        : []),
    ]
  return [
    {
      id: 'selectSameTool',
      label: text('Select all of this tool', 'Выделить все объекты этого инструмента'),
      disabled: sameToolIds(menu.layerId).length < 2,
      reason: text('No other objects of this tool here', 'Здесь нет других объектов этого инструмента'),
    },
    ...(layers.length === 1 && layers[0]?.kind === 'callout' ? [
      { id: 'calloutInsert', label: text('Add step', 'Добавить ступень'), disabled: disabled || ['straight', 'quadratic'].includes(layers[0].payload.route.path), reason },
      { id: 'calloutRemoveStep', label: text('Remove last step', 'Удалить последнюю ступень'), disabled: disabled || !canRemoveCalloutStep(layers[0].payload, 1), reason },
      { id: 'calloutReset', label: text('Reset route', 'Сбросить маршрут'), disabled: disabled || layers[0].payload.route.path !== 'orthogonal', reason },
    ] : []),
    {
      id: 'copyStyle',
      label: text('Copy style', 'Копировать стиль'),
      disabled: layers.length !== 1,
      reason: text('Select one object', 'Выберите один объект'),
    },
    {
      id: 'pasteStyle',
      label: text('Paste style', 'Вставить стиль'),
      disabled: disabled || !styleClipboard.value,
      reason: disabled ? reason : text('Copy a style first', 'Сначала скопируйте стиль'),
    },
    ...(['duplicate', 'delete', 'up', 'down', 'hide'] as const).map((id, index) => ({
      id,
      label: [
        text('Duplicate', 'Дублировать'),
        text('Delete', 'Удалить'),
        text('Bring forward', 'На слой выше'),
        text('Send backward', 'На слой ниже'),
        text('Hide', 'Скрыть'),
      ][index]!,
      disabled: disabled || (id === 'up' || id === 'down') && !canMoveSelection(context, id),
      reason: disabled ? reason : text('Already at the edge of the layer stack', 'Уже на краю списка слоёв'),
    })),
    {
      id: 'lock',
      label: layers.some((layer) => layer.locked) ? text('Unlock', 'Разблокировать') : text('Lock', 'Заблокировать'),
      disabled: context.props.readOnlyDocument || !context.props.documentSession,
      reason,
    },
  ]
}

function canMoveSelection(
  context: SelectionContext,
  direction: 'up' | 'down',
): boolean {
  const layers = context.document.value?.layers ?? []
  const ids = new Set(context.store.selectedLayerIds)
  return layers.some((layer, index) => {
    const neighbor = layers[index + (direction === 'up' ? 1 : -1)]
    return ids.has(layer.id) && neighbor !== undefined &&
      (!ids.has(neighbor.id) || (layer.space ?? 'content') !== (neighbor.space ?? 'content'))
  })
}
