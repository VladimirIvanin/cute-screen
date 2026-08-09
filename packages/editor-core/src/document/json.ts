import type { JsonObject, JsonValue } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function readJsonObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`)
  return value
}

function freezeJsonValue(
  value: unknown,
  field: string,
  ancestors: WeakSet<object>,
): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${field} must be finite JSON`)
    return value
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value))
      throw new Error(`${field} must not contain cycles`)
    ancestors.add(value)
    const items = value.map((item, index) =>
      freezeJsonValue(item, `${field}[${index}]`, ancestors),
    )
    ancestors.delete(value)
    return Object.freeze(items)
  }
  if (isRecord(value)) {
    if (ancestors.has(value))
      throw new Error(`${field} must not contain cycles`)
    ancestors.add(value)
    const result: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = freezeJsonValue(item, `${field}.${key}`, ancestors)
    }
    ancestors.delete(value)
    return Object.freeze(result)
  }
  throw new Error(`${field} must contain only JSON values`)
}

export function freezeJsonObject(value: unknown, field: string): JsonObject {
  const source = readJsonObject(value, field)
  return freezeJsonValue(source, field, new WeakSet()) as JsonObject
}

export function collectExtras(
  source: Record<string, unknown>,
  knownFields: readonly string[],
): JsonObject | undefined {
  const known = new Set(knownFields)
  const extras: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!known.has(key)) extras[key] = value
  }
  return Object.keys(extras).length === 0
    ? undefined
    : freezeJsonObject(extras, 'extras')
}

export function jsonEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) {
    return false
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false
    }
    return left.every((value, index) => jsonEquals(value, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every(
    (key) => Object.hasOwn(right, key) && jsonEquals(left[key], right[key]),
  )
}
