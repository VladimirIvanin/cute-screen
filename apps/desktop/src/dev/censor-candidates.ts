import { createCustomIcon } from '../../../../packages/editor-vue/src/shell/icons/create-custom-icon'
import type { IconGeometry } from '../../../../packages/editor-vue/src/shell/icons/geometry'

// A coarse, irregular mosaic keeps negative spaces at toolbar scale.
const pixels = [
  [0, 0], [2, 0], [3, 0],
  [1, 1], [2, 1],
  [0, 2], [1, 2], [3, 2],
  [0, 3], [2, 3],
].map(([column, row]) => {
  const x = 3.75 + column! * 4.5
  const y = 3.75 + row! * 4.5
  return `M${x} ${y}h3v3h-3Z`
}).join(' ')

const mosaic = [
  ['path', { d: pixels, fill: 'currentColor', stroke: 'none' }],
] as const satisfies IconGeometry

const redaction = [
  ['path', { d: 'M4 6h9m4 0h3M4 18h5m4 0h7' }],
  ['path', { d: 'M3 9h18v6H3Z', fill: 'currentColor', stroke: 'none' }],
] as const satisfies IconGeometry

const blur = [
  ['path', { d: 'M3 7V4h4m10 0h4v3M3 17v3h4m10 0h4v-3' }],
  ['path', { d: 'M6 8c2-2 4 2 6 0s4-2 6 0M6 12c2-2 4 2 6 0s4-2 6 0M6 16c2-2 4 2 6 0s4-2 6 0' }],
] as const satisfies IconGeometry

export const censorCandidates = [
  {
    id: 'mosaic',
    name: '1. Мозаика',
    description: 'Крупные пиксели по вашему референсу: скрытая детализация.',
    component: createCustomIcon('censor-mosaic-proposal', mosaic),
  },
  {
    id: 'redaction',
    name: '2. Плашка',
    description: 'Сплошная полоса закрывает фрагмент текста.',
    component: createCustomIcon('censor-redaction-proposal', redaction),
  },
  {
    id: 'blur',
    name: '3. Размытие',
    description: 'Границы области и потерявшие чёткость строки.',
    component: createCustomIcon('censor-blur-proposal', blur),
  },
]
