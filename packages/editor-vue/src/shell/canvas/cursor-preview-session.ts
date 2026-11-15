import { useBrushCursorPreview } from './brush-cursor-preview'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'
import { useNumberedMarkerPreview } from './numbered-marker-preview'
import type { EyedropperController } from './eyedropper-controller'
import { createPointerLeaveHandler } from './workspace-interaction-contexts'

/** Marker and brush cursors share one pointer, one overlay pass and one space cursor. */
export function useCursorPreviews(
  props: CanvasViewportProps,
  invalidate: () => void,
  markerSuspended: () => boolean,
  brushSuspended: () => boolean,
) {
  const marker = useNumberedMarkerPreview(props, invalidate, markerSuspended)
  const brush = useBrushCursorPreview(props, invalidate, brushSuspended)
  return {
    move(point: CanvasPoint | undefined) {
      marker.move(point)
      brush.move(point)
    },
    draw(context: CanvasRenderingContext2D) {
      marker.draw(context)
      brush.draw(context)
    },
    onLeave(
      eyedropper: EyedropperController,
      invalidateOverlay: () => void,
    ) {
      return createPointerLeaveHandler([marker, brush], eyedropper, invalidateOverlay)
    },
    syncSpaceCursor(
      pressed: boolean,
      setCursor: (cursor: string) => void,
    ) {
      marker.refresh()
      brush.refresh()
      const tool = props.activeTool
      if (
        tool !== 'numberedMarker' &&
        tool !== 'pencil' &&
        tool !== 'marker'
      ) return
      const hidden = Boolean(props.markerPreviewBlocked || props.readOnly)
      setCursor(pressed ? 'grab' : hidden ? 'default' : 'none')
    },
  }
}
