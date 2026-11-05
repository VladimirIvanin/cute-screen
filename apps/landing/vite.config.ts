import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

import { readLandingCatalog } from '../../scripts/landing-release.mjs'
import { downloadsHTML } from './downloads-html'

export default defineConfig({
  base: '/cute-screen/',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@cute-screen/editor-vue': fileURLToPath(new URL('../../packages/editor-vue/src/index.ts', import.meta.url)), '@cute-screen/editor-renderer': fileURLToPath(new URL('../../packages/editor-renderer/src/index.ts', import.meta.url)), '@cute-screen/editor-core': fileURLToPath(new URL('../../packages/editor-core/src/index.ts', import.meta.url)) } },
  plugins: [vue(), {
    name: 'landing-downloads',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const catalog = await readLandingCatalog(fileURLToPath(new URL('./assets/release.json', import.meta.url)))
        return html.replace('<!-- downloads -->', downloadsHTML(catalog, /<html\s+lang="en"/u.test(html))).replace('<!-- update-version -->', catalog.tag.slice(1))
      },
    },
  }],
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        demo: fileURLToPath(new URL('./demo/index.html', import.meta.url)),
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
