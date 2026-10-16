import { createApp } from 'vue'
import IconPreview from './IconPreview.vue'
import tokens from '../../../../packages/editor-vue/src/shell/styles/tokens-primitives.css?inline'

// Separate Vite HTML entry; neither App nor the production entry imports this.
// Reuse the real theme values, scoped to the two side-by-side preview panels.
const themeStyle = document.createElement('style')
themeStyle.textContent = tokens.replaceAll(':root', '.icon-theme')
  .replaceAll("html[data-theme='dark']", ".icon-theme[data-theme='dark']")
document.head.append(themeStyle)
createApp(IconPreview).mount('#app')
