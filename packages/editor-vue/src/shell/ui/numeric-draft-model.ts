import {
  computed,
  ref,
} from 'vue'
import type { NumericPreviewService } from './numeric-preview'

export interface NumericDraftProps {
  readonly value: number
  readonly min: number
  readonly max?: number | undefined
  readonly step: number
  readonly displayScale?: number | undefined
  readonly mixed?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly controlId?: string | undefined
  readonly previewValue?: ((value: number) => string) | undefined
  readonly layerId?: string | undefined
  readonly commitUnchanged?: boolean | undefined
}

export type NumericCancelReason = 'gesture' | 'invalid' | 'context'

export interface NumericDraftEvents {
  preview(value: number): void
  commit(value: number): void
  cancel(reason?: NumericCancelReason): void
  invalid?(value: boolean): void
}

export function formatNumeric(value: number): string {
  const text = String(value)
  if (!text.includes('e')) return text
  const [coefficient, exponent] = text.split('e')
  const sign = coefficient!.startsWith('-') ? '-' : ''
  const absolute = coefficient!.replace('-', '')
  const digits = absolute.replace('.', '')
  const point = (absolute.split('.')[0]?.length ?? 0) + Number(exponent)
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

function parseNumeric(
  draft: string,
  min: number,
  max: number | undefined,
  step: number,
): number | undefined {
  const raw = draft.trim().replace(',', '.')
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return undefined
  const value = Number(raw)
  // At large magnitudes Number() can round a fractional literal into an integer.
  if (
    Number.isInteger(step) &&
    Number.isInteger(min) &&
    /[1-9]/.test(raw.split('.')[1] ?? '')
  ) {
    return undefined
  }
  const steps = (value - min) / step
  if (
    !Number.isFinite(value) ||
    value < min ||
    max !== undefined &&
    value > max ||
    Math.abs(steps - Math.round(steps)) > 0.000001
  ) return undefined
  return value
}

function createNumericState(
  props: NumericDraftProps,
  service: NumericPreviewService | undefined,
) {
  const owner = Symbol('numeric-draft')
  const blocked = computed(() => Boolean(props.disabled || service?.isBlocked?.()))
  const scale = computed(() => props.displayScale ?? 1)
  const shownMin = computed(() => props.min * scale.value)
  const shownMax = computed(() => props.max === undefined ? undefined : props.max * scale.value)
  const shownStep = computed(() => props.step * scale.value)
  const draft = ref('')
  const invalid = ref(false)
  const editing = ref(false)
  const keys = new Set<string>()
  const gesture = { pointer: false, cancelledPointer: false, composing: false, lastCommitted: props.value }
  const parsed = computed(() => parseNumeric(draft.value, shownMin.value, shownMax.value, shownStep.value))
  const shownValue = computed(() => parsed.value ?? props.value * scale.value)
  const ariaValue = computed(() => invalid.value || props.mixed && !editing.value ? undefined : parsed.value)
  return { props, owner, blocked, scale, shownMin, shownMax, shownStep, draft, invalid, editing,
    keys, gesture, parsed, shownValue, ariaValue }
}
export type NumericDraftState = ReturnType<typeof createNumericState>
function stepNumericDraft(
  state: NumericDraftState,
  preview: (value: string) => void,
  direction: number,
  multiplier = 1,
): void {
  const { props, blocked, editing, parsed, scale, shownMin, shownMax, shownStep } = state
  if (
    blocked.value ||
    props.mixed &&
    !editing.value
  ) return
  const current = parsed.value ?? (!editing.value ? props.value * scale.value : undefined)
  if (current === undefined) return
  const index = (current - shownMin.value) / shownStep.value
  const onGrid = Math.abs(index - Math.round(index)) <= 0.000001
  const snapped = direction > 0 ? Math.floor(index) + 1 : Math.ceil(index) - 1
  const raw = onGrid ? current + direction * shownStep.value * multiplier
    : shownMin.value + (snapped + direction * (multiplier - 1)) * shownStep.value
  const moved = Number.isInteger(current) && Number.isInteger(shownStep.value) ? raw : Number(raw.toPrecision(15))
  const next = Math.max(shownMin.value, Math.min(shownMax.value ?? Infinity, moved))
  if (next !== current) preview(formatNumeric(next))
}

function createNumericActions(
  state: NumericDraftState,
  events: NumericDraftEvents,
  service: NumericPreviewService | undefined,
  defaultsTool: () => string | undefined,
) {
  const { props, owner, blocked, scale, draft, invalid, editing, keys, gesture, parsed } = state
  function validate(): number | undefined {
    const value = parsed.value
    invalid.value = value === undefined
    events.invalid?.(invalid.value)
    return value
  }

  function reset(): void {
    const displayed = props.value * scale.value
    draft.value = props.mixed ? '' : formatNumeric(scale.value === 1 ? displayed : Number(displayed.toPrecision(15)))
    invalid.value = false
    editing.value = false
    gesture.composing = false
    gesture.pointer = false
    keys.clear()
    gesture.lastCommitted = props.value
    events.invalid?.(false)
  }

  function preview(next: string): void {
    if (blocked.value) return
    draft.value = next
    editing.value = true
    if (gesture.composing) return
    if (props.controlId) service?.activate?.(owner)
    const value = validate()
    if (value === undefined) {
      service?.cancel(owner)
      events.cancel('invalid')
      return
    }
    const actual = value / scale.value
    events.preview(actual)
    if (props.controlId) service?.preview(owner, {
      id: props.controlId,
      defaultsTool: defaultsTool(),
      layerId: props.layerId,
    }, props.previewValue?.(actual) ?? String(actual))
  }

  function commit(): void {
    if (
      blocked.value ||
      !editing.value ||
      gesture.composing
    ) return
    const value = validate()
    if (value === undefined) return
    const actual = value / scale.value
    const changed = actual !== gesture.lastCommitted || props.mixed || props.commitUnchanged
    editing.value = false
    gesture.pointer = false
    keys.clear()
    service?.cancel(owner)
    if (changed) {
      gesture.lastCommitted = actual
      events.commit(actual)
    }
  }

  function cancel(reason: NumericCancelReason = 'context'): void {
    const pending = editing.value
    gesture.cancelledPointer = gesture.pointer
    service?.cancel(owner)
    reset()
    if (pending) events.cancel(reason)
  }

  function finish(): void {
    if (invalid.value) cancel('gesture')
    else commit()
  }

  function increment(
    direction: number,
    multiplier = 1,
  ): void {
    stepNumericDraft(state, preview, direction, multiplier)
  }
  return { reset, preview, commit, cancel, finish, increment, format: formatNumeric }
}
export type NumericDraftActions = ReturnType<typeof createNumericActions>
export {
  createNumericState,
  createNumericActions,
}
