import {
  inject,
  onBeforeUnmount,
  onMounted,
  useId,
  watch,
  type Ref,
} from 'vue'
import {
  numericDefaultsKey,
  numericContextKey,
  numericPreviewKey,
  type NumericPreviewService,
} from './numeric-preview'
import {
  createNumericActions,
  createNumericState,
  type NumericDraftActions,
  type NumericDraftEvents,
  type NumericDraftProps,
  type NumericDraftState,
} from './numeric-draft-model'

/** String editing and reversible gestures shared by all numeric surfaces. */
export function useNumericDraft(
  props: NumericDraftProps,
  host: Ref<HTMLElement | undefined>,
  events: NumericDraftEvents,
) {
  const service = inject(numericPreviewKey, undefined)
  const defaultsTool = inject(numericDefaultsKey, () => undefined)
  const context = inject(numericContextKey, () => '')
  const errorId = `numeric-error-${useId()}`
  const state = createNumericState(props, service)
  const actions = createNumericActions(state, events, service, defaultsTool)
  const keyboard = createNumericKeyboard(state, actions, host)
  const pointer = createNumericPointer(state, actions, host)
  useNumericLifecycle(state, actions, keyboard, pointer, context, events, service)
  return { ...state, ...actions, ...keyboard, ...pointer, errorId }
}
function createNumericKeyboard(
  state: NumericDraftState,
  actions: NumericDraftActions,
  host: Ref<HTMLElement | undefined>,
) {
  const { blocked, draft, editing, keys, gesture, parsed, shownMin, shownMax, shownValue } = state
  const { cancel, commit, increment, preview, finish, format } = actions
  function isNumericTarget(event: Event): boolean {
    return event.target instanceof Element && Boolean(event.target.matches('input') || event.target.closest('[role="slider"]'))
  }

  function escape(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.key !== 'Escape' ||
      !editing.value ||
      gesture.composing ||
      event.isComposing
    ) return
    if (
      !gesture.pointer &&
      !keys.size &&
      !(event.target instanceof Node && host.value?.contains(event.target))
    ) return
    event.preventDefault()
    event.stopPropagation()
    cancel('gesture')
  }

  function keydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      gesture.composing ||
      !isNumericTarget(event)
    ) return
    escape(event)
    if (event.defaultPrevented || blocked.value) return
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) return
    if (step(event)) return
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commit()
    } else if (event.key === 'Tab') finish()
  }

  function keyup(event: KeyboardEvent): void {
    if (!keys.delete(event.key)) return
    if (!keys.size) commit()
  }

  function step(event: KeyboardEvent): boolean {
    const slider = event.target instanceof Element && Boolean(event.target.closest('[role="slider"]'))
    const directions: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, ArrowRight: 1, ArrowLeft: -1 }
    const direction = directions[event.key]
    const endpoint = slider && (event.key === 'Home' || event.key === 'End')
    if (!(
      direction &&
      (slider ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown') ||
        endpoint
    )) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat && !keys.has(event.key)) return true
    keys.add(event.key)
    if (endpoint) {
      if (parsed.value !== undefined) preview(format(event.key === 'Home' ? shownMin.value : shownMax.value ?? shownValue.value))
    } else increment(direction!, event.shiftKey ? 10 : 1)
    return true
  }
  function compositionstart(): void {
    gesture.composing = true
  }

  function compositionend(): void {
    gesture.composing = false
    if (editing.value) preview(draft.value)
  }

  return { escape, keydown, keyup, compositionstart, compositionend }
}
function createNumericPointer(
  state: NumericDraftState,
  actions: NumericDraftActions,
  host: Ref<HTMLElement | undefined>,
) {
  const { blocked, editing, gesture } = state
  const { preview, commit, cancel, finish, format } = actions
  function pointerdown(event: PointerEvent): void {
    if (blocked.value || event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.n-slider')) {
      gesture.cancelledPointer = false
      gesture.pointer = true
    }
  }

  function sliderUpdate(value: number): void {
    if (!gesture.cancelledPointer) preview(format(value))
  }

  function pointerup(): void {
    if (gesture.pointer && !gesture.cancelledPointer) queueMicrotask(commit)
  }

  function pointercancel(): void {
    if (gesture.pointer) cancel('gesture')
  }

  function outside(event: PointerEvent): void {
    if (
      !editing.value ||
      !(event.target instanceof Element) ||
      host.value?.contains(event.target)
    ) return
    const contextTargets = [
      '[data-tool-id]', '[data-layer-id]', '[data-brand-id]', '[data-card-fill]',
      '[data-gradient-stop]', '.cs-card-gradient-handle', '.cs-canvas', '.cs-canvas-stage', '.cs-canvas-surface',
      '[data-composition-reset]',
    ].join(',')
    if (event.target.closest(contextTargets)) cancel()
    else finish()
  }

  function blur(event: FocusEvent): void {
    if (gesture.pointer) return
    queueMicrotask(() => {
      if (!editing.value || document.activeElement === event.target) return
      if (event.relatedTarget instanceof Node && host.value?.contains(event.relatedTarget)) return
      finish()
    })
  }

  return { pointerdown, sliderUpdate, pointerup, pointercancel, outside, blur }
}
function useNumericLifecycle(
  state: NumericDraftState,
  actions: NumericDraftActions,
  keyboard: ReturnType<typeof createNumericKeyboard>,
  pointer: ReturnType<typeof createNumericPointer>,
  context: () => string,
  events: NumericDraftEvents,
  service: NumericPreviewService | undefined,
): void {
  const { props, owner, editing, gesture, scale, parsed, blocked } = state
  const { reset } = actions
  const cancel = () => actions.cancel()
  const { escape, keyup } = keyboard
  const { outside, pointerup, pointercancel } = pointer
  const unregister = service?.register?.(owner, () => {
    const pending = editing.value
    gesture.cancelledPointer = gesture.pointer
    reset()
    if (pending) events.cancel('context')
  })
  watch(() => [props.value, props.mixed, props.displayScale, props.min, props.max, props.step] as const, (
    next,
    previous,
  ) => {
    // Local Apply/Cancel surfaces may echo their own preview into the field.
    const sameConstraints = previous && next.slice(1).every((value, index) => value === previous[index + 1])
    if (
      editing.value &&
      sameConstraints &&
      (props.value === parsed.value! / scale.value ||
        props.value === gesture.lastCommitted)
    ) return
    if (editing.value) cancel()
    else reset()
  }, { immediate: true })
  watch(blocked, (disabled) => {
    if (disabled) cancel()
  })
  watch(context, cancel, { flush: 'sync' })
  onMounted(() => {
    document.addEventListener('keydown', escape, true)
    document.addEventListener('keyup', keyup, true)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('pointerup', pointerup)
    document.addEventListener('pointercancel', pointercancel)
    window.addEventListener('blur', cancel)
  })
  onBeforeUnmount(() => {
    unregister?.()
    cancel()
    document.removeEventListener('keydown', escape, true)
    document.removeEventListener('keyup', keyup, true)
    document.removeEventListener('pointerdown', outside, true)
    document.removeEventListener('pointerup', pointerup)
    document.removeEventListener('pointercancel', pointercancel)
    window.removeEventListener('blur', cancel)
  })
}
