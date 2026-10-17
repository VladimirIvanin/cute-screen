import { computed } from 'vue'
import type { ContextToolbarSchema } from '../types'

export function useRulerMeasurement(
  schema: () => ContextToolbarSchema,
  locale: () => 'en' | 'ru',
) {
  const settings = computed(() => schema().toolSettings!)
  const control = computed(() => schema().controls.find((item) => item.id === 'rulerMeasurementMode'))
  const modes = computed(() => control.value?.kind === 'select' ? control.value.options : [])
  const mode = computed(() => control.value?.kind === 'select' && !control.value.mixed ? String(control.value.value) : '')
  const basis = computed(() => modes.value.find((item) => item.value === mode.value)?.label.replace('%', '').trim() ?? '')
  const localized = (value: string) => locale() === 'ru' ? value.replace(/\.(\d+)/u, ',$1') : value
  const length = computed(() => {
    const measured = settings.value.measurement?.length
    if (!measured) return mode.value === 'pixels' ? 'px' : mode.value ? `% ${basis.value}` : '—'
    return `${localized(measured)}${mode.value && mode.value !== 'pixels' ? ` ${basis.value}` : ''}`
  })
  return { settings, modes, mode, localized, length }
}
