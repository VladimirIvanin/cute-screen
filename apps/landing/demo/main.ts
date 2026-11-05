import { createApp } from 'vue'
import { createEditorShellPinia } from '@cute-screen/editor-vue'
import App from './App.vue'
import './demo.css'

createApp(App).use(createEditorShellPinia()).mount('#app')
