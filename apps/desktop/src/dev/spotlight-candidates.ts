import { createCustomIcon } from '../../../../packages/editor-vue/src/shell/icons/create-custom-icon'
import {
  spotlightGeometry,
  type IconGeometry,
} from '../../../../packages/editor-vue/src/shell/icons/geometry'

// One field of parallel lines: x + y = offset. The window only occludes it;
// the surviving pieces always stay aligned with their counterparts.
function hatchGeometry(
  clearance: number,
): IconGeometry {
  const segments: string[] = []
  for (const offset of [10, 17, 24, 31, 38]) {
    const start = Math.max(2.5, offset - 21.5)
    const end = Math.min(21.5, offset - 2.5)
    const hiddenStart = Math.max(6 - clearance, offset - 15 - clearance)
    const hiddenEnd = Math.min(18 + clearance, offset - 9 + clearance)
    const intervals = hiddenStart < hiddenEnd
      ? [[start, Math.min(end, hiddenStart)], [Math.max(start, hiddenEnd), end]]
      : [[start, end]]
    for (const [from, to] of intervals) {
      if (
        from === undefined ||
        to === undefined ||
        to - from < 0.1
      ) continue
      segments.push(`M${from} ${offset - from}L${to} ${offset - to}`)
    }
  }
  return [
    ['path', { d: segments.join(' ') }],
    ['rect', { x: 6, y: 9, width: 12, height: 6, rx: 0.75 }],
  ]
}

export const spotlightCandidates = [
  {
    id: 'uniform',
    name: '1. С зазором',
    description: 'Предыдущий вариант: штрихи не касаются контура.',
    component: createCustomIcon('spotlight-uniform-proposal', hatchGeometry(1.8)),
  },
  {
    id: 'joined',
    name: '2. Принят',
    description: 'Встык: используется в интерфейсе для инструмента «Фонарь».',
    component: createCustomIcon('spotlight', spotlightGeometry),
  },
]
