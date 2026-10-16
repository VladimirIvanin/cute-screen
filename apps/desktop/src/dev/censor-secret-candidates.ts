import { createCustomIcon } from '../../../../packages/editor-vue/src/shell/icons/create-custom-icon'
import type { IconGeometry } from '../../../../packages/editor-vue/src/shell/icons/geometry'

const passwordField = [
  ['rect', { x: 2.5, y: 6, width: 19, height: 12, rx: 2 }],
  ['path', { d: 'M6.5 10.5v3m-1.3-2.25 2.6 1.5m-2.6 0 2.6-1.5M12 10.5v3m-1.3-2.25 2.6 1.5m-2.6 0 2.6-1.5' }],
  ['path', { d: 'M17.5 10.5v3m-1.3-2.25 2.6 1.5m-2.6 0 2.6-1.5' }],
] as const satisfies IconGeometry

const passwordEye = [
  ['path', { d: 'M5 4h.1M12 4h.1M19 4h.1' }],
  ['path', { d: 'M9 10.5c4-1.5 8 .5 12 5.5a20 20 0 0 1-3 3M5.5 11.5 3 16c5 6 10 7 14 4' }],
  ['path', { d: 'm4 8 16 14m-10-8a3 3 0 0 0 4 4' }],
] as const satisfies IconGeometry

const lockedEye = [
  ['path', { d: 'M2.5 12c5-8 14-8 19 0-5 8-14 8-19 0Z' }],
  ['rect', { x: 9, y: 10.5, width: 6, height: 5.5, rx: 1 }],
  ['path', { d: 'M10 10.5V9a2 2 0 0 1 4 0v1.5' }],
] as const satisfies IconGeometry

const blockedSecret = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'm6 6 2.5 2.5m7 7L18 18M5.5 11l2.5 2.5m-2.5 0L8 11' }],
  ['path', { d: 'm10.5 10.5 3 3m-3 0 3-3m3 .5 2.5 2.5m-2.5 0L19 11' }],
] as const satisfies IconGeometry

const hiddenDocument = [
  ['path', { d: 'M15 8V3H4v18h8M7 7h4m-4 4h2' }],
  ['path', { d: 'M10 16c3-4 9-4 12 0-3 4-9 4-12 0Zm1-5 10 10' }],
] as const satisfies IconGeometry

const stoppedPassword = [
  ['path', { d: 'M10 18H3V4h18v5M6 8l3 3m-3 0 3-3m3 0 3 3m-3 0 3-3' }],
  ['path', { d: 'M15 12h4l3 3v4l-3 3h-4l-3-3v-4Zm0 5h4' }],
] as const satisfies IconGeometry

export const censorCandidates = [
  {
    id: 'password-field',
    name: '1. Пароль',
    description: 'Поле со звёздочками: значение заменено маской.',
    geometry: passwordField,
  },
  {
    id: 'password-eye',
    name: '2. Не показывать',
    description: 'Маскированные символы и перечёркнутый глаз.',
    geometry: passwordEye,
  },
  {
    id: 'locked-eye',
    name: '3. Глаз + замок',
    description: 'Закрыть просмотр: замок вместо зрачка.',
    geometry: lockedEye,
  },
  {
    id: 'blocked-secret',
    name: '4. Не читать',
    description: 'Скрытые символы и знак запрета.',
    geometry: blockedSecret,
  },
  {
    id: 'hidden-document',
    name: '5. Скрыть текст',
    description: 'Текстовый документ с перечёркнутым глазом.',
    geometry: hiddenDocument,
  },
  {
    id: 'stopped-password',
    name: '6. Стоп-поле',
    description: 'Поле с закрытыми символами и знаком «стоп».',
    geometry: stoppedPassword,
  },
].map((candidate) => ({
  ...candidate,
  component: createCustomIcon(`censor-${candidate.id}-proposal`, candidate.geometry),
}))
