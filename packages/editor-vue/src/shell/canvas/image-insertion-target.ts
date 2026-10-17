import type { ImageInsertionTarget } from '../../texture-fill'
import type { ViewportOutputBounds } from './contracts'

function acceptsDrop(
  container: HTMLElement,
  point: { readonly x: number; readonly y: number },
): boolean {
  const hit = document.elementFromPoint(point.x, point.y)
  if (
    !hit ||
    !container.contains(hit) ||
    hit.closest('button, input, textarea, [role="dialog"], [role="toolbar"]')
  ) return false
  return hit.matches('.cs-canvas, .cs-canvas-stage, .cs-canvas-surface, .cs-canvas-scroll') || Boolean(hit.closest('.cs-empty-state'))
}

function availableRect(
  container: HTMLElement,
  viewport: DOMRect,
  rect: DOMRect,
) {
  const left = Math.max(viewport.left, rect.left)
  let top = Math.max(viewport.top, rect.top)
  const right = Math.min(viewport.right, rect.right)
  let bottom = Math.min(viewport.bottom, rect.bottom)
  const shell = container.closest('.cs-editor-shell')
  for (const panel of shell?.querySelectorAll<HTMLElement>('.cs-toolrail, .cs-context-toolbar, .cs-selection-floating-toolbar, .cs-topbar') ?? []) {
    const panelRect = panel.getBoundingClientRect()
    if (
      panelRect.right <= left ||
      panelRect.left >= right ||
      panelRect.bottom <= top ||
      panelRect.top >= bottom
    ) continue
    if (panelRect.top > top + (bottom - top) / 2) bottom = panelRect.top - 16
    else top = panelRect.bottom + 16
  }
  return { left, top, right, bottom }
}

/** Measured on demand, never on a reactive scene/pointermove projection. */
export function visibleImageTarget(
  container: HTMLElement | undefined,
  scene: HTMLCanvasElement | undefined,
  output: ViewportOutputBounds | undefined,
  crop: ViewportOutputBounds | undefined,
  point?: { readonly x: number; readonly y: number },
): ImageInsertionTarget | undefined {
  if (!container) return undefined
  const viewport = container.getBoundingClientRect()
  if (point && !acceptsDrop(container, point)) return undefined
  if (!scene || !output) {
    return viewport.width > 0 && viewport.height > 0
      ? { bounds: { x: 0, y: 0, width: viewport.width, height: viewport.height } } : undefined
  }
  const rect = scene.getBoundingClientRect()
  let { left, top, right, bottom } = availableRect(container, viewport, rect)
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    right <= left ||
    bottom <= top
  ) return undefined
  const sx = output.width / rect.width
  const sy = output.height / rect.height
  const frame = crop ?? output
  left = Math.max(frame.x, output.x + (left - rect.left) * sx)
  top = Math.max(frame.y, output.y + (top - rect.top) * sy)
  right = Math.min(frame.x + frame.width, output.x + (right - rect.left) * sx)
  bottom = Math.min(frame.y + frame.height, output.y + (bottom - rect.top) * sy)
  if (right <= left || bottom <= top) return undefined
  return {
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    ...(point ? { center: { x: output.x + (point.x - rect.left) * sx, y: output.y + (point.y - rect.top) * sy } } : {}),
  }
}
