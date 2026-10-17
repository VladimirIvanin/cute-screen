export function focusPopoverControl(panel: HTMLElement | undefined): void {
  // Selector lists return the first DOM match, regardless of selector order.
  const target = panel?.querySelector<HTMLElement>('button[aria-pressed="true"]:not(:disabled)')
    ?? panel?.querySelector<HTMLElement>('input:not(:disabled)')
    ?? panel?.querySelector<HTMLElement>('button:not(:disabled)')
  target?.focus({ preventScroll: true })
}
