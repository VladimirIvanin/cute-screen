import type { CanvasViewportProps } from './contracts'
/** Pointer state only; insertion never changes the document before a completed drag. */
export class CalloutRouteEditing {
  #dismissedRevision = -1
  constructor(private readonly props: CanvasViewportProps) {}
  active(): boolean {
    const patch = this.props.textFormatting
    return patch?.calloutInsertStep !== undefined && patch.calloutInsertStep === this.props.selectedLayerId
      && patch.revision !== this.#dismissedRevision
  }
  finish(): void {
    this.#dismissedRevision = this.props.textFormatting?.revision ?? -1
  }
  keydown(
    event: KeyboardEvent,
    cancel: () => void,
  ): boolean {
    if (event.key !== 'Escape' || !this.active()) return false
    event.preventDefault()
    event.stopPropagation()
    cancel()
    return true
  }
}
