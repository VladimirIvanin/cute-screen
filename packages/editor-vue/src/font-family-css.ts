/** A document family is one name, not an unquoted CSS font-family list. */
export function fontFamilyCss(family: string): string {
  const escaped = family.replace(/["\\\n\r\f]/gu, (character) => `\\${character.codePointAt(0)!.toString(16)} `)
  return `"${escaped}"`
}
