import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const browserE2ePort = process.env.CUTE_SCREEN_BROWSER_E2E_PORT ?? '5173'
const appConfig = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig(({ mode }) => ({
  ...(mode === 'e2e' ? {
    cacheDir: fileURLToPath(new URL(`../../node_modules/.vite/cutescreen-e2e-${browserE2ePort}`, import.meta.url)),
  } : {}),
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appConfig.version),
  },
  resolve: {
    alias: {
      '@cute-screen/editor-core': fileURLToPath(new URL('../../packages/editor-core/src/index.ts', import.meta.url)),
      '@cute-screen/editor-renderer': fileURLToPath(new URL('../../packages/editor-renderer/src/index.ts', import.meta.url)),
      '@cute-screen/editor-vue/m01-harness': fileURLToPath(
        new URL('../../packages/editor-vue/src/m01-harness.ts', import.meta.url),
      ),
      '@cute-screen/editor-vue': fileURLToPath(new URL('../../packages/editor-vue/src/index.ts', import.meta.url)),
      '@cute-screen/editor-vue/shell.css': fileURLToPath(
        new URL('../../packages/editor-vue/src/shell/shell.css', import.meta.url),
      ),
    },
  },
  root,
  build: {
    emptyOutDir: true,
    outDir: process.env.CUTE_SCREEN_FRONTEND_DIST ?? 'dist',
  },
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: process.env.CUTE_SCREEN_E2E_DISABLE_WATCH === '1' ? null : {
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
}))
