import type {
  RenderGroupNode,
  RenderOutputBounds,
} from '@cute-screen/editor-core'

/** One edge texel outside the clip prevents the image rectangle and the rounded
 * clip from antialiasing the same boundary twice. It never changes content fit. */
export function groupBackdropGeometry(
  node: RenderGroupNode,
  scale: number,
) {
  const c = node.clip
  const requestedWidth = Math.max(1, Math.round(c.width * scale))
  const requestedHeight = Math.max(1, Math.round(c.height * scale))
  const limit = Math.min(1, 32768 / (requestedWidth + 2), 32768 / (requestedHeight + 2),
    Math.sqrt(134217728 / ((requestedWidth + 2) * (requestedHeight + 2))))
  const width = Math.max(1, Math.floor((requestedWidth + 2) * limit) - 2)
  const height = Math.max(1, Math.floor((requestedHeight + 2) * limit) - 2)
  const x = width / c.width, y = height / c.height
  const d = node.destination
  return {
    width: width + 2,
    height: height + 2,
    content: { x: 1 + (d.x - c.x) * x, y: 1 + (d.y - c.y) * y, width: d.width * x, height: d.height * y },
    destination: { x: c.x - 1 / x, y: c.y - 1 / y, width: c.width + 2 / x, height: c.height + 2 / y },
  }
}

/** Copy the completed screen's boundary, including its alpha, into the gutter. */
export function backdropEdgeCopies(
  width: number,
  height: number,
): ReadonlyArray<readonly [RenderOutputBounds, RenderOutputBounds]> {
  const w = width - 2, h = height - 2
  return [
    [{ x: 1, y: 1, width: w, height: 1 }, { x: 1, y: 0, width: w, height: 1 }],
    [{ x: 1, y: h, width: w, height: 1 }, { x: 1, y: h + 1, width: w, height: 1 }],
    [{ x: 1, y: 1, width: 1, height: h }, { x: 0, y: 1, width: 1, height: h }],
    [{ x: w, y: 1, width: 1, height: h }, { x: w + 1, y: 1, width: 1, height: h }],
    ...[0, 1].flatMap((right) => [0, 1].map((bottom) => [
      { x: right ? w : 1, y: bottom ? h : 1, width: 1, height: 1 },
      { x: right ? w + 1 : 0, y: bottom ? h + 1 : 0, width: 1, height: 1 },
    ] as const)),
  ]
}
