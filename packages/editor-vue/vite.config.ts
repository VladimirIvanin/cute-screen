import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['vue', 'pinia', '@cute-screen/editor-renderer'],
      output: {
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith('.css')) ? 'shell.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
