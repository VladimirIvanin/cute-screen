import {
  h,
  type FunctionalComponent,
} from 'vue'
import type { IconGeometry } from './geometry'

/** Internal renderer; shell consumers use the semantic UiIcon adapter. */
export function createCustomIcon(
  name: string,
  geometry: IconGeometry,
): FunctionalComponent {
  const component: FunctionalComponent = (_props, { attrs }) => h('svg', {
    ...attrs,
    xmlns: 'http://www.w3.org/2000/svg',
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: ['cs-custom-icon', `cs-icon-${name}`, attrs.class],
  }, geometry.map(([tag, attributes]) => h(tag, { ...attributes })))
  component.inheritAttrs = false
  return component
}
