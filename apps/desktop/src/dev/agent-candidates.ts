import {
  agentGeometry,
  type IconGeometry,
} from '../../../../packages/editor-vue/src/shell/icons/geometry'
import { createCustomIcon } from '../../../../packages/editor-vue/src/shell/icons/create-custom-icon'

// Keep the preferred face unchanged while comparing two tiny ear treatments.
const face = agentGeometry.slice(1)

const detachedDots = [
  ['path', {
    d: 'M8.7 3.5a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0ZM17.7 3.5a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z',
    fill: 'currentColor',
    stroke: 'none',
  }],
  ...face,
] as const satisfies IconGeometry

export const agentCandidates = [
  { id: 'dots-1', name: 'Точки отдельно', geometry: detachedDots },
  { id: 'dots-2', name: 'Принят · на корпусе', geometry: agentGeometry },
].map((candidate) => ({
  ...candidate,
  component: createCustomIcon(`agent-${candidate.id}`, candidate.geometry),
}))
