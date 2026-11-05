/** Demo-only projection: never changes the shared tool catalogue or document. */
export function installResponsiveTools(rail: HTMLElement): () => void {
  const priority = ['select', 'hand', 'arrow', 'pencil', 'text', 'marker', 'censor', 'line', 'shape', 'numberedMarker', 'callout']
  function update(): void {
    const buttons = [...rail.querySelectorAll<HTMLElement>('[data-tool-id]')]
    const capacity = Math.max(2, Math.floor((rail.clientWidth - 10 - 44) / 44))
    const ordered = [...buttons].sort((a, b) => {
      const rank = (button: HTMLElement) => {
        const index = priority.indexOf(button.dataset.toolId ?? '')
        return index < 0 ? priority.length + buttons.indexOf(button) : index
      }
      return rank(a) - rank(b)
    })
    const visible = ordered.slice(0, capacity)
    const active = buttons.find((button) => button.getAttribute('aria-pressed') === 'true')
    if (active && !visible.includes(active)) visible[Math.max(2, visible.length - 1)] = active
    const selected = new Set(visible)
    for (const button of buttons) button.dataset.demoVisible = String(selected.has(button))
  }
  const resize = new ResizeObserver(update)
  resize.observe(rail)
  const selection = new MutationObserver(update)
  selection.observe(rail, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] })
  update()
  return () => {
    resize.disconnect()
    selection.disconnect()
  }
}
