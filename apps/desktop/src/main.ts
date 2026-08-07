import { createApp } from 'vue'
import { createEditorShellPinia } from '@cute-screen/editor-vue'

import App from './App.vue'
import './styles.css'

if (import.meta.env.VITE_TEST_HARNESS === 'true') {
  await import('./test-harness')
}

const Root =
  import.meta.env.VITE_M01_HARNESS === 'true' &&
  new URLSearchParams(window.location.search).get('m01') === '1'
    ? (await import('./M01Harness.vue')).default
    : App

createApp(Root).use(createEditorShellPinia()).mount('#app')
