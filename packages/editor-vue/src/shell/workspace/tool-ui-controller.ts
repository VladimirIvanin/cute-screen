import type { Ref, ShallowRef } from 'vue'
import {
  rememberDrawingColor,
  type DrawingToolPreferencesV2,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import { parseHexColor } from '../tools/effects/color'

interface ToolConfigureState {
  readonly toolId: string
  readonly anchor: HTMLElement
}

export interface ToolUiControllerContext {
  readonly props: ResolvedEditorShellProps
  readonly store: { selectTool(id: string): void }
  readonly locale: Ref<'en' | 'ru'>
  readonly drawingPreferences: ShallowRef<DrawingToolPreferencesV2>
  readonly samplingControl: Ref<string | undefined>
  readonly eyedropperFeedback: Ref<string | undefined>
  readonly eyedropperColor: Ref<string | undefined>
  readonly toolError: Ref<string | undefined>
  readonly toolConfigure: Ref<ToolConfigureState | undefined>
  readonly toolConfigureLayout: Ref<
    { readonly left: number; readonly top: number } | undefined
  >
  readonly configureDefaultsTool: Ref<'arrow' | undefined>
  readonly precisionChangeBlocked: (id: string) => boolean
  readonly onContextChange: (id: string, value: string) => void
  readonly translate: (key: 'readOnlyDocument') => string
  readonly saveDrawingPreferences: (value: DrawingToolPreferencesV2) => void
}

function rememberColor(context: ToolUiControllerContext, value: string): void {
  const color = parseHexColor(value)
  if (!color) return
  context.drawingPreferences.value = rememberDrawingColor(
    context.drawingPreferences.value,
    color,
  )
  context.saveDrawingPreferences(context.drawingPreferences.value)
}

function onColorChange(
  context: ToolUiControllerContext,
  id: string,
  value: string,
): void {
  if (context.precisionChangeBlocked(id)) return
  context.onContextChange(id, value)
  rememberColor(context, value)
}

async function writeSampleToClipboard(
  context: ToolUiControllerContext,
  value: string,
): Promise<void> {
  if (context.props.clipboardBridge?.writeClipboardText) {
    await context.props.clipboardBridge.writeClipboardText(
      value,
      crypto.randomUUID(),
    )
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(value)
  }
}

async function onColorSample(
  context: ToolUiControllerContext,
  value: string,
): Promise<void> {
  const normalized = value.toUpperCase()
  const target = context.samplingControl.value
  if (target && context.precisionChangeBlocked(target)) {
    context.samplingControl.value = undefined
    context.eyedropperColor.value = undefined
    context.eyedropperFeedback.value = context.translate('readOnlyDocument')
    return
  }
  if (target) onColorChange(context, target, normalized)
  else rememberColor(context, normalized)
  context.samplingControl.value = undefined
  context.eyedropperColor.value = normalized
  context.eyedropperFeedback.value =
    context.locale.value === 'ru'
      ? `Цвет выбран: ${normalized}`
      : `Colour selected: ${normalized}`
  try {
    await writeSampleToClipboard(context, normalized)
  } catch (error) {
    console.warn('cute-screen eyedropper clipboard write failed', error)
    context.eyedropperFeedback.value =
      context.locale.value === 'ru'
        ? `Цвет выбран: ${normalized}. Не удалось скопировать HEX.`
        : `Colour selected: ${normalized}. HEX could not be copied.`
  }
}

function closeToolConfigure(context: ToolUiControllerContext): void {
  context.toolConfigure.value = undefined
  context.toolConfigureLayout.value = undefined
}

function onToolConfigureOutsidePointer(
  context: ToolUiControllerContext,
  event: PointerEvent,
): void {
  const configure = context.toolConfigure.value
  if (!configure) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (
    configure.anchor.contains(target) ||
    (target instanceof HTMLElement &&
      target.closest(
        '.cs-tool-configure-popover-host, .cs-arrow-toolbar-popover',
      ))
  ) {
    return
  }
  closeToolConfigure(context)
}

export function createToolUiController(context: ToolUiControllerContext) {
  return {
    onColorChange: (id: string, value: string) =>
      onColorChange(context, id, value),
    startEyedropper: (id: string) => {
      if (context.precisionChangeBlocked(id)) return
      context.samplingControl.value = id
      context.eyedropperColor.value = undefined
      context.eyedropperFeedback.value = undefined
    },
    onColorSample: (value: string) => onColorSample(context, value),
    onColorSampleError: (message: string) => {
      context.eyedropperFeedback.value = message
    },
    onColorSampleCancel: () => {
      context.samplingControl.value = undefined
      context.eyedropperColor.value = undefined
      context.eyedropperFeedback.value =
        context.locale.value === 'ru'
          ? 'Выбор цвета отменён'
          : 'Colour sampling cancelled'
    },
    onToolConfigureOutsidePointer: (event: PointerEvent) =>
      onToolConfigureOutsidePointer(context, event),
    openToolConfigure: (toolId: string, anchor: HTMLElement) => {
      if (toolId !== 'arrow') return
      const rect = anchor.getBoundingClientRect()
      context.toolConfigure.value = { toolId, anchor }
      context.toolConfigureLayout.value = {
        left: rect.left + rect.width / 2,
        top: rect.top,
      }
    },
    closeToolConfigure: () => closeToolConfigure(context),
    onToolConfigureChange: (id: string, value: string) => {
      context.configureDefaultsTool.value = 'arrow'
      try {
        context.onContextChange(id, value)
      } finally {
        context.configureDefaultsTool.value = undefined
      }
    },
    selectTool: (id: string) => {
      context.toolError.value = undefined
      context.store.selectTool(id)
      if (id === 'eyedropper') {
        context.eyedropperColor.value = undefined
        context.eyedropperFeedback.value = undefined
      }
    },
  }
}
