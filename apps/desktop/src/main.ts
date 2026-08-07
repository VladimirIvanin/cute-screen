import { createApp } from 'vue'

import App from './App.vue'
import './styles.css'

if (import.meta.env.VITE_TEST_HARNESS === 'true') {
  await import('./test-harness')
}

createApp(App).mount('#app')
