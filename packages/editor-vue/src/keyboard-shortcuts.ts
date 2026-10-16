/**
 * Resolves a Latin letter shortcut from the physical keyboard position.
 *
 * `KeyboardEvent.key` contains the layout-dependent character, while `code`
 * identifies the physical key. Browsers without a usable `code` retain the
 * historic key-based behaviour for compatibility.
 */
export function shortcutLetter(event: KeyboardEvent): string | undefined {
  const code = event.code
  const physicalLetter = /^Key([A-Z])$/u.exec(code)
  if (physicalLetter) return physicalLetter[1]!.toLowerCase()
  if (code && code !== 'Unidentified') return undefined

  const key = event.key
  return /^[A-Za-z]$/u.test(key) ? key.toLowerCase() : undefined
}
