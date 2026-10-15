export interface PreviewRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}
export interface PreviewPlacement extends PreviewRect {
  readonly side: 'top' | 'bottom' | 'left' | 'right'
}
function overlap(
  a: PreviewRect,
  b: PreviewRect,
): number {
  return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))
}

/** Select by covered area first, then stable side and proximity to the trigger. */
export function previewPlacement(
  anchor: PreviewRect,
  size: { readonly width: number; readonly height: number },
  viewport: PreviewRect,
  obstacles: readonly PreviewRect[],
  previous?: PreviewPlacement,
): PreviewPlacement {
  const gap = 8
  const width = Math.min(size.width, Math.max(1, viewport.width - gap * 2))
  const height = Math.min(size.height, Math.max(1, viewport.height - gap * 2))
  const candidates: PreviewPlacement[] = []
  for (const reference of [anchor, ...obstacles]) {
    const x = anchor.left + (anchor.width - width) / 2
    const y = anchor.top + (anchor.height - height) / 2
    candidates.push(
      { left: x, top: reference.top - height - gap, width, height, side: 'top' },
      { left: x, top: reference.top + reference.height + gap, width, height, side: 'bottom' },
      { left: reference.left - width - gap, top: y, width, height, side: 'left' },
      { left: reference.left + reference.width + gap, top: y, width, height, side: 'right' },
    )
  }
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const fitted = candidates.map((candidate) => ({ ...candidate,
    left: clamp(candidate.left, viewport.left + gap, viewport.left + viewport.width - width - gap),
    top: clamp(candidate.top, viewport.top + gap, viewport.top + viewport.height - height - gap),
  }))
  const cost = (candidate: PreviewPlacement) => {
    const covered = obstacles.reduce((sum, rect) => sum + overlap(candidate, rect), 0) + overlap(candidate, anchor)
    const distance = Math.hypot(candidate.left + width / 2 - anchor.left - anchor.width / 2,
      candidate.top + height / 2 - anchor.top - anchor.height / 2)
    return { covered, stable: previous && candidate.side !== previous.side ? 1 : 0, distance }
  }
  return fitted.sort((a, b) => {
    const ca = cost(a), cb = cost(b)
    return ca.covered - cb.covered || ca.stable - cb.stable || ca.distance - cb.distance
  })[0]!
}

export function previewEnvironment(
  anchor: HTMLElement,
  panel: HTMLElement,
) {
  const root = anchor.closest('.cs-workbench') ?? document.body
  const viewport = root.querySelector('.cs-viewport')?.getBoundingClientRect()
  const view = viewport && viewport.width > 0 && viewport.height > 0
    ? viewport : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  const obstacles: PreviewRect[] = []
  root.querySelectorAll<HTMLElement>('[data-preview-bounds]').forEach((element) => {
    const values = element.dataset.previewBounds?.split(',').map(Number)
    if (values?.length === 4 && values.every(Number.isFinite)) {
      const [left = 0, top = 0, width = 0, height = 0] = values
      obstacles.push({ left: left - 6, top: top - 6, width: width + 12, height: height + 12 })
    }
  })
  root.querySelectorAll<HTMLElement>('.cs-layers-panel, .cs-tool-rail, .cs-toolrail, .cs-context-toolbar, .cs-tool-configure-popover-host').forEach((element) => {
    if (
      element === panel ||
      panel.contains(element) ||
      element.contains(panel)
    ) return
    const rect = element.getBoundingClientRect()
    if (
      rect.width &&
      rect.height &&
      getComputedStyle(element).visibility !== 'hidden'
    ) obstacles.push(rect)
  })
  return { view, obstacles }
}
