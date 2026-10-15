import {
  nextTick,
  type Ref,
  type ShallowRef,
} from 'vue'
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
  readonly toolConfigureLayout: Ref<{ readonly left: number; readonly top: number } | undefined>
  readonly configureDefaultsTool: Ref<string | undefined>
  readonly precisionChangeBlocked: (id: string) => boolean
  readonly onContextChange: (id: string, value: string) => void
  readonly translate: (key: 'readOnlyDocument') => string
  readonly saveDrawingPreferences: (value: DrawingToolPreferencesV2) => void
}

function rememberColor(
  context: ToolUiControllerContext,
  value: string,
): void {
  const color = parseHexColor(value)
  if (!color) return
  context.drawingPreferences.value = rememberDrawingColor(context.drawingPreferences.value, color)
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
    await context.props.clipboardBridge.writeClipboardText(value, crypto.randomUUID())
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(value)
  }
}

async function onColorSample(
  context: ToolUiControllerContext,
  value: string,
  defaultsTool: string | undefined,
): Promise<void> {
  const normalized = value.toUpperCase()
  const target = context.samplingControl.value
  if (target && context.precisionChangeBlocked(target)) {
    context.samplingControl.value = undefined
    context.eyedropperColor.value = undefined
    context.eyedropperFeedback.value = context.translate('readOnlyDocument')
    return
  }
  if (target) {
    context.configureDefaultsTool.value = defaultsTool
    try {
      onColorChange(context, target, normalized)
    } finally {
      context.configureDefaultsTool.value = undefined
    }
  } else rememberColor(context, normalized)
  context.samplingControl.value = undefined
  context.eyedropperColor.value = normalized
  context.eyedropperFeedback.value =
    context.locale.value === 'ru' ? `Цвет выбран: ${normalized}` : `Colour selected: ${normalized}`
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
  const anchor = context.toolConfigure.value?.anchor
  context.toolConfigure.value = undefined
  context.toolConfigureLayout.value = undefined
  anchor?.focus({ preventScroll: true })
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
    (target instanceof Element &&
      target.closest(
        '.cs-tool-configure-popover-host, .cs-arrow-toolbar-popover, .cs-overlay-root, .n-popover, .n-base-select-menu, .cs-color-picker-popover',
      ))
  ) {
    return
  }
  closeToolConfigure(context)
}

export function createToolUiController(context: ToolUiControllerContext) {
  let samplingDefaultsTool: string | undefined
  return {
    onToolConfigureKeydown: (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !context.toolConfigure.value ||
        event.defaultPrevented
      ) return
      const nestedOpen = document.querySelector(
        '.cs-tool-configure-popover-host [aria-haspopup="dialog"][aria-expanded="true"], .cs-tool-configure-popover-host [role="combobox"][aria-expanded="true"]',
      )
      if (
        nestedOpen &&
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="listbox"]')
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      closeToolConfigure(context)
    },
    onColorChange: (id: string, value: string) => onColorChange(context, id, value),
    startEyedropper: (id: string) => {
      if (context.precisionChangeBlocked(id)) return
      samplingDefaultsTool = context.toolConfigure.value?.toolId
      closeToolConfigure(context)
      context.samplingControl.value = id
      context.eyedropperColor.value = undefined
      context.eyedropperFeedback.value = undefined
    },
    onColorSample: (value: string) => {
      const defaultsTool = samplingDefaultsTool
      samplingDefaultsTool = undefined
      return onColorSample(context, value, defaultsTool)
    },
    onColorSampleError: (message: string) => {
      context.eyedropperFeedback.value = message
    },
    onColorSampleCancel: () => {
      context.samplingControl.value = undefined
      context.eyedropperColor.value = undefined
      context.eyedropperFeedback.value =
        context.locale.value === 'ru' ? 'Выбор цвета отменён' : 'Colour sampling cancelled'
    },
    onToolConfigureOutsidePointer: (event: PointerEvent) => onToolConfigureOutsidePointer(context, event),
    openToolConfigure: (toolId: string, anchor: HTMLElement) => {
      context.store.selectTool(toolId)
      if (
        ![
          'arrow',
          'shape',
          'pencil',
          'marker',
          'text',
          'callout',
          'numberedMarker',
          'censor',
          'spotlight',
          'ruler',
          'loupe',
          'crop',
        ].includes(toolId)
      ) {
        closeToolConfigure(context)
        return
      }
      const rect = anchor.getBoundingClientRect()
      context.toolConfigure.value = { toolId, anchor }
      context.toolConfigureLayout.value = {
        left: Math.max(
          Math.min(340, window.innerWidth / 2),
          Math.min(window.innerWidth - Math.min(340, window.innerWidth / 2), rect.left + rect.width / 2),
        ),
        top: rect.top,
      }
      void nextTick(() =>
        document
          .querySelector<HTMLElement>(
            '.cs-tool-configure-popover-host button:not(:disabled), .cs-tool-configure-popover-host select',
          )
          ?.focus({ preventScroll: true }))
    },
    closeToolConfigure: () => closeToolConfigure(context),
    onToolConfigureChange: (id: string, value: string) => {
      context.configureDefaultsTool.value = context.toolConfigure.value?.toolId
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
