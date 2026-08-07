import { h, type FunctionalComponent } from 'vue'
import type { IconName } from './types'

const paths: Record<IconName, string[]> = {
  arrow: ['M4 18 19 5', 'm13 5 6 0 0 6'],
  camera: [
    'M5 7h3l1.5-2h5l1.5 2h3v12H5Z',
    'M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ],
  check: ['m5 12 4 4L19 6'],
  chevronDown: ['m7 10 5 5 5-5'],
  copy: ['M8 8h11v11H8Z', 'M16 8V5H5v11h3'],
  crop: ['M6 3v13a2 2 0 0 0 2 2h13', 'M3 6h13a2 2 0 0 1 2 2v13'],
  export: ['M12 3v12', 'm8 11 4 4 4-4', 'M5 18v2h14v-2'],
  hand: [
    'M8 12V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v6',
  ],
  image: ['M4 5h16v14H4Z', 'm5 16 4-4 3 3 2-2 5 5', 'M8 9h.01'],
  layers: ['m4 8 8-4 8 4-8 4Z', 'm4 12 8 4 8-4', 'm4 16 8 4 8-4'],
  lock: ['M6 10h12v10H6Z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  marker: ['m5 16 9-9 4 4-9 9H5Z', 'M4 20h16'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  pencil: ['m5 19 3.5-.8 9.7-9.7a2 2 0 0 0-2.8-2.8L5.7 15.4Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  privacy: ['M4 6h16v12H4Z', 'm6 16 3-8m1 8 3-8m1 8 3-8'],
  redo: ['m15 7 5 5-5 5', 'M19 12h-8a6 6 0 0 0-6 6'],
  select: ['m5 3 12 9-6 1-3 6Z'],
  shape: ['M5 5h14v14H5Z'],
  spotlight: [
    'M12 3v3m0 12v3M3 12h3m12 0h3',
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  ],
  text: ['M5 5h14M12 5v14M9 19h6'],
  undo: ['m9 7-5 5 5 5', 'M5 12h8a6 6 0 0 1 6 6'],
  unlock: ['M6 10h12v10H6Z', 'M8 10V7a4 4 0 0 1 7-2'],
  zoomIn: [
    'M10 7v6m-3-3h6',
    'm15 15 5 5',
    'M14 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  ],
  zoomOut: ['M7 10h6', 'm15 15 5 5', 'M14 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0'],
}

export const UiIcon: FunctionalComponent<{ name: IconName }> = ({ name }) =>
  h(
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    paths[name].map((d) => h('path', { d })),
  )
