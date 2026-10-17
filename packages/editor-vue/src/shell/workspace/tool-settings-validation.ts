const enums: Record<string, readonly string[]> = {
  alignment: ['start', 'center', 'end'],
  listKind: ['none', 'bullet'],
  shape: ['circle', 'square', 'diamond', 'star', 'rectangle', 'ellipse'],
  region: ['rectangle', 'freeform'],
  mode: ['pixelate', 'blur', 'solid'],
  unit: ['pixels', 'percent'],
  percentBasis: ['canvasWidth', 'canvasHeight', 'canvasDiagonal'],
  feather: ['soft', 'strong'],
  style: ['solid', 'dashed', 'dotted'],
}
function checkedNumber(
  fallback: number,
  value: unknown,
  key: string,
): number {
  const unit = ['red', 'green', 'blue', 'alpha', 'dimOpacity'].includes(key)
  const minimum = unit || ['radius', 'padding', 'borderWidth'].includes(key) ? 0 : 1
  const maximum = unit ? 1 : key === 'fontSize' ? 256 : key === 'snapAngleIncrementDegrees' ? 90 : 2048
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) return fallback
  if (
    key === 'weight' &&
    (value % 100 !== 0 ||
      value > 900)
  ) return fallback
  return value
}
function checkedString(
  fallback: string,
  value: unknown,
  key: string,
): string {
  if (typeof value !== 'string' || value.length >= 128) return fallback
  return enums[key] && !enums[key].includes(value) ? fallback : value
}
/** Persisted defaults are merged only into known, typed fields. */
export function checked<T>(
  fallback: T,
  value: unknown,
  key = '',
): T {
  if (typeof fallback === 'number') return checkedNumber(fallback, value, key) as T
  if (key === 'feather' && value === null) return value as T
  if (typeof fallback === 'string') return checkedString(fallback, value, key) as T
  if (typeof fallback === 'boolean') return (typeof value === 'boolean' ? value : fallback) as T
  if (fallback === null) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('color' in value)
    ) return fallback
    return checked({ color: { red: 0, green: 0, blue: 0, alpha: 1 }, padding: 0, radius: 0 }, value) as T
  }
  if (typeof fallback !== 'object' || Array.isArray(fallback)) return fallback
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return Object.fromEntries(
    Object.entries(fallback as object).map(([field, item]) => [field, checked(item, record[field], field)]),
  ) as T
}
