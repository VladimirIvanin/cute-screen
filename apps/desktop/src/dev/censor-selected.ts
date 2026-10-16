import { h } from 'vue'
import { UiIcon } from '../../../../packages/editor-vue/src/shell/icon'

export const censorCandidates = [
  {
    id: 'checkerboard',
    name: 'Принята',
    description: 'Шахматная мозаика с полутонами: инструмент «Скрыть данные».',
    component: () => h(UiIcon, { name: 'privacy' }),
  },
]
