import type { RenderTextNode } from './contracts'
import { assertFinite, assertPositive, freezeColor } from './validation'

export function freezeTextNode(node: RenderTextNode): RenderTextNode {
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  for (const [field, value] of Object.entries({
    width: node.width,
    height: node.height,
  }))
    assertPositive(value, `${node.id}.${field}`)
  if (node.wrap !== 'autoSize' && node.wrap !== 'fixedWidth') {
    throw new RangeError(`${node.id}.wrap is invalid`)
  }
  if (node.wrap === 'fixedWidth') {
    if (node.fixedWidth === undefined) {
      throw new RangeError(`${node.id}.fixedWidth is required`)
    }
    assertPositive(node.fixedWidth, `${node.id}.fixedWidth`)
  } else if (node.fixedWidth !== undefined) {
    throw new RangeError(
      `${node.id}.fixedWidth is only valid for fixedWidth text`,
    )
  }
  const isBoundary = (offset: number): boolean => {
    if (!Number.isInteger(offset) || offset < 0 || offset > node.text.length)
      return false
    if (offset === 0 || offset === node.text.length) return true
    const previous = node.text.charCodeAt(offset - 1)
    const next = node.text.charCodeAt(offset)
    return !(
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      next >= 0xdc00 &&
      next <= 0xdfff
    )
  }
  let runEnd = 0
  const runs = node.runs.map((run, index) => {
    if (
      run.start !== runEnd ||
      run.end <= run.start ||
      !isBoundary(run.start) ||
      !isBoundary(run.end)
    ) {
      throw new RangeError(
        `${node.id}.runs[${index}] must be contiguous UTF-16 ranges`,
      )
    }
    runEnd = run.end
    if (!run.fontFamily)
      throw new Error(`${node.id}.runs[${index}].fontFamily is empty`)
    assertPositive(run.fontSize, `${node.id}.runs[${index}].fontSize`)
    if (
      !Number.isInteger(run.fontWeight) ||
      run.fontWeight < 100 ||
      run.fontWeight > 900 ||
      run.fontWeight % 100 !== 0
    ) {
      throw new RangeError(`${node.id}.runs[${index}].fontWeight is invalid`)
    }
    if (!['normal', 'italic'].includes(run.fontStyle)) {
      throw new RangeError(`${node.id}.runs[${index}].fontStyle is invalid`)
    }
    return Object.freeze({ ...run, color: freezeColor(run.color) })
  })
  let paragraphEnd = 0
  const paragraphs = node.paragraphs.map((paragraph, index) => {
    const terminalEmpty =
      index === node.paragraphs.length - 1 &&
      paragraph.start === node.text.length &&
      paragraph.end === node.text.length &&
      node.text.endsWith('\n')
    if (
      paragraph.start !== paragraphEnd ||
      (paragraph.end <= paragraph.start && !terminalEmpty) ||
      !isBoundary(paragraph.start) ||
      !isBoundary(paragraph.end)
    ) {
      throw new RangeError(
        `${node.id}.paragraphs[${index}] must be contiguous UTF-16 ranges`,
      )
    }
    paragraphEnd = paragraph.end
    if (!['start', 'center', 'end'].includes(paragraph.alignment)) {
      throw new RangeError(
        `${node.id}.paragraphs[${index}].alignment is invalid`,
      )
    }
    if (paragraph.listKind !== 'none' && paragraph.listKind !== 'bullet') {
      throw new RangeError(
        `${node.id}.paragraphs[${index}].listKind is invalid`,
      )
    }
    return Object.freeze({ ...paragraph })
  })
  if (
    (node.text.length === 0 &&
      (runs.length !== 0 || paragraphs.length !== 0)) ||
    (node.text.length > 0 &&
      (runs.length === 0 ||
        paragraphs.length === 0 ||
        runEnd !== node.text.length ||
        paragraphEnd !== node.text.length))
  ) {
    throw new RangeError(`${node.id} rich text ranges must cover text exactly`)
  }
  return Object.freeze({
    ...node,
    runs: Object.freeze(runs),
    paragraphs: Object.freeze(paragraphs),
  })
}
