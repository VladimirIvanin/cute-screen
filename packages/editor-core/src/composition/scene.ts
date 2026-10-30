import type { EditorDocument } from '../document/types'
import type {
  RenderNode,
  RenderSceneSnapshot,
} from '../scene/contracts'
import { createRenderSceneSnapshot } from '../scene/snapshot'
import { resolveCompositionLayout } from './layout'
import { backgroundNodes } from './scene-background'
import { brandingGroup } from './scene-branding'
import { phoneScreenRadius } from './frame-catalog'
import { phoneOverlay } from './scene-phone'
import {
  frameNodes,
  frameRadius,
  hasWindowChrome,
} from './scene-frame'
import {
  cardShadow,
  visibleNode,
} from './scene-primitives'

export function composeDocumentScene(
  document: EditorDocument,
  content: RenderSceneSnapshot,
  cardNodes: readonly RenderNode[],
): RenderSceneSnapshot {
  const settings = document.presentation.composition
  if (!settings) return content
  const l = resolveCompositionLayout(document)
  if (
    l.width > 32768 ||
    l.height > 32768 ||
    l.width * l.height > 134217728
  ) throw new Error('Composition exceeds the image pixel budget')
  const bounds = { x: 0, y: 0, width: l.width, height: l.height }
  const windowChrome = hasWindowChrome(settings.frame)
  const nodes: RenderNode[] = [
    ...backgroundNodes('card:background', bounds, settings.background, content),
    ...backgroundNodes('card:header', l.header, settings.header.fill, content),
    ...backgroundNodes('card:footer', l.footer, settings.footer.fill, content),
    ...cardShadow(l.frame, frameRadius(settings, l), settings.shadow, settings.shadowOptions),
    ...frameNodes(settings, l),
    { ...visibleNode, id: 'card:content', kind: 'group', scene: content, destination: l.content,
      clip: l.viewport, cornerRadius: settings.frame.kind === 'phone'
        ? settings.frame.phoneContentMode === 'fullscreen' ? phoneScreenRadius(settings.frame, l.screen) : 0
        : windowChrome ? 0 : settings.radius,
      ...(settings.frame.kind !== 'none' ? { backdrop: settings.frame.screenColor } : {}),
      ...(windowChrome ? { outerClip: { bounds: l.frame, cornerRadius: frameRadius(settings, l) } }
        : settings.frame.kind === 'phone'
          ? { outerClip: { bounds: l.screen, cornerRadius: phoneScreenRadius(settings.frame, l.screen) } } : {}),
      blur: 0 },
    ...phoneOverlay(settings.frame, l.screen),
    ...cardNodes,
    ...settings.branding.map((b) => brandingGroup(b, l)),
  ]
  return createRenderSceneSnapshot({ width: l.width, height: l.height, nodes })
}
