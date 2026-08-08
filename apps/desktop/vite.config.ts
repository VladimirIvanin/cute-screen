import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@cute-screen/editor-vue/m01-harness': fileURLToPath(
        new URL('../../packages/editor-vue/src/m01-harness.ts', import.meta.url),
      ),
      '@cute-screen/editor-vue': fileURLToPath(
        new URL('../../packages/editor-vue/src/index.ts', import.meta.url),
      ),
      '@cute-screen/editor-vue/shell.css': fileURLToPath(
        new URL('../../packages/editor-vue/src/shell/shell.css', import.meta.url),
      ),
    },
  },
  root,
  build: {
    emptyOutDir: true,
    outDir: 'dist',
  },
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
