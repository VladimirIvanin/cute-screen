import { h } from 'vue'
import { UiIcon } from '../../../../packages/editor-vue/src/shell/icon'
import { createCustomIcon } from '../../../../packages/editor-vue/src/shell/icons/create-custom-icon'
import type { IconGeometry } from '../../../../packages/editor-vue/src/shell/icons/geometry'

const redactedDocument = [
  ['path', { d: 'M5 3h10l4 4v14H5ZM15 3v4h4M8 18h5' }],
  ['path', { d: 'M3 9h18v6H3Z', fill: 'currentColor', stroke: 'none' }],
] as const satisfies IconGeometry

const lockedData = [
  ['path', { d: 'M3 5h8M3 10h4M3 15h3' }],
  ['rect', { x: 10, y: 12, width: 11, height: 9, rx: 2 }],
  ['path', { d: 'M12 12V9a3.5 3.5 0 0 1 7 0v3m-3.5 4v1.5' }],
] as const satisfies IconGeometry

export const censorCandidates = [
  {
    id: 'concealed-eye',
    name: '1. Не видно',
    description: 'Перечёркнутый глаз: содержимое скрыто от просмотра.',
    // Reuse the existing semantic catalog instead of redrawing Tabler EyeOff.
    component: () => h(UiIcon, { name: 'eyeOff' }),
  },
  {
    id: 'redacted-document',
    name: '2. Документ',
    description: 'Документ с закрытыми строками: скрыть конкретные данные.',
    component: createCustomIcon('censor-document-proposal', redactedDocument),
  },
  {
    id: 'locked-data',
    name: '3. Под замком',
    description: 'Строки данных и замок: закрытое содержимое.',
    component: createCustomIcon('censor-locked-data-proposal', lockedData),
  },
]
