import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  base: '/cute-screen/',
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        en: fileURLToPath(new URL('./en/index.html', import.meta.url)),
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
})
