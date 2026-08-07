import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@cute-screen/editor-vue': new URL(
        '../../packages/editor-vue/src/index.ts',
        import.meta.url,
      ).pathname,
      '@cute-screen/editor-vue/shell.css': new URL(
        '../../packages/editor-vue/src/shell/shell.css',
        import.meta.url,
      ).pathname,
    },
  },
  root: new URL('.', import.meta.url).pathname,
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
