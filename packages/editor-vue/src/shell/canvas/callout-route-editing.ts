import type { CanvasViewportProps } from './contracts'
import type { KeyboardController } from './keyboard-controller'
/** Pointer state only; insertion never changes the document before a completed drag. */
export class CalloutRouteEditing {
  altPressed = false
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
  #refreshRemovalPreview(invalidate: () => void): void {
    if (this.props.document?.layers.some((layer) => layer.kind === 'callout'
      && (layer.id === this.props.selectedLayerId || this.props.selectedLayerIds?.includes(layer.id)))) invalidate()
  }
  inputHandlers(
    keyboard: KeyboardController,
    cancel: () => void,
    invalidate: () => void,
  ) {
    return {
      onKeydown: (event: KeyboardEvent) => {
        if (event.key === 'Alt') {
          this.altPressed = true
        }
        if (!this.keydown(event, cancel)) keyboard.keydown(event)
        if (event.key === 'Alt') this.#refreshRemovalPreview(invalidate)
      },
      onKeyup: (event: KeyboardEvent) => {
        if (event.key === 'Alt') {
          this.altPressed = false
        }
        keyboard.keyup(event)
        if (event.key === 'Alt') this.#refreshRemovalPreview(invalidate)
      },
      onBlur: () => {
        this.altPressed = false
        keyboard.blur()
        this.#refreshRemovalPreview(invalidate)
      },
    }
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
