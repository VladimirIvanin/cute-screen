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
import {
  hasToolSettings,
  showsCreationDefaults,
} from '../tools/settings-policy'
import { ownsSurfaceTarget } from '../ui/transient-surface'
import { parseHexColor } from '../tools/effects/color'

interface ToolConfigureState {
  readonly toolId: string
  readonly anchor: HTMLElement
}

export interface ToolUiControllerContext {
  readonly activeToolId: Ref<string | undefined>
  readonly props: ResolvedEditorShellProps
  readonly finishTextEditing: (continuation: () => void) => void
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
  readonly requestContentImageImport: () => void
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

function closeToolConfigure(
  context: ToolUiControllerContext,
  restoreFocus = false,
): void {
  const anchor = context.toolConfigure.value?.anchor
  context.toolConfigure.value = undefined
  context.toolConfigureLayout.value = undefined
  if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true })
}

function onToolConfigureOutsidePointer(
  context: ToolUiControllerContext,
  event: PointerEvent,
): void {
  const configure = context.toolConfigure.value
  if (!configure) return
  const target = event.target
  if (!(target instanceof Node)) return
  const host = document.getElementById('cs-tool-defaults')
  if (configure.anchor.contains(target) || ownsSurfaceTarget(host?.dataset.csSurface, target)) return
  closeToolConfigure(context)
}

function restoreActivationFocus(
  previous: Element | null,
  shell: Element | null,
  toolId: string,
): void {
  if (previous?.isConnected !== false || document.activeElement !== document.body) return
  shell?.querySelector<HTMLElement>(`.cs-toolrail [data-tool-id="${toolId}"]`)?.focus({ preventScroll: true })
}

function activateTool(
  context: ToolUiControllerContext,
  toolId: string,
  continuation?: () => void,
): void {
  const previous = document.activeElement
  const shell = previous?.closest('.cs-editor-shell') ?? null
  const transientFocus = Boolean(previous?.closest('.cs-tool-defaults-toolbar, .cs-tool-configure-popover-host, .cs-overlay-root'))
  context.finishTextEditing(() => {
    closeToolConfigure(context)
    context.toolError.value = undefined
    context.samplingControl.value = undefined
    context.eyedropperColor.value = undefined
    context.eyedropperFeedback.value = undefined
    if (toolId === 'image') context.requestContentImageImport()
    else context.store.selectTool(toolId)
    if (transientFocus) void nextTick(() => restoreActivationFocus(previous, shell, toolId))
    continuation?.()
  })
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
      const host = document.getElementById('cs-tool-defaults')
      const target = event.target
      if (
        target instanceof Element &&
        ownsSurfaceTarget(host?.dataset.csSurface, target) &&
        (target.closest('[role="dialog"], [role="listbox"]') !== host ||
          target.closest('input, textarea, [role="combobox"], [role="slider"]'))
      ) return
      event.preventDefault()
      event.stopImmediatePropagation()
      closeToolConfigure(context, true)
    },
    onColorChange: (id: string, value: string) => onColorChange(context, id, value),
    startEyedropper: (id: string) => {
      if (context.precisionChangeBlocked(id)) return
      samplingDefaultsTool = context.toolConfigure.value?.toolId ??
        (showsCreationDefaults(context.activeToolId.value) ? context.activeToolId.value : undefined)
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
      if (context.toolConfigure.value?.toolId === toolId && context.toolConfigure.value.anchor === anchor) return
      activateTool(context, toolId, () => {
        if (!hasToolSettings(toolId)) return
        const focusVisibleDefaults = () => {
          const row = anchor.closest('.cs-editor-shell')?.querySelector<HTMLElement>('.cs-tool-defaults-toolbar')
          if (
            !row ||
            row.classList.contains('is-collapsed') ||
            row.inert ||
            getComputedStyle(row).visibility === 'hidden'
          ) return false
          row.querySelector<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')?.focus({ preventScroll: true })
          return true
        }
        if (showsCreationDefaults(toolId) && !context.props.quickMode) {
          void nextTick(focusVisibleDefaults)
          return
        }
        if (showsCreationDefaults(toolId) && focusVisibleDefaults()) return
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
      })
    },
    closeToolConfigure: () => closeToolConfigure(context, true),
    onToolConfigureChange: (id: string, value: string) => {
      context.configureDefaultsTool.value = context.toolConfigure.value?.toolId
      try {
        context.onContextChange(id, value)
      } finally {
        context.configureDefaultsTool.value = undefined
      }
    },
    onCreationChange: (id: string, value: string) => {
      context.configureDefaultsTool.value = context.activeToolId.value
      try {
        onColorChange(context, id, value)
      } finally {
        context.configureDefaultsTool.value = undefined
      }
    },
    selectTool: (id: string) => activateTool(context, id),
  }
}
