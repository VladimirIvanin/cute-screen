import { attachBrandEyes } from '../../../packages/editor-vue/src/shell/brand/brand-eyes'

const brand = document.querySelector<HTMLElement>('.brand')
if (brand) attachBrandEyes(brand)
