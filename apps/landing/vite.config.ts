import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

import { readLandingCatalog } from '../../scripts/landing-release.mjs'
import { downloadsHTML } from './downloads-html'

export default defineConfig({
  base: '/cute-screen/',
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [{
    name: 'landing-downloads',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const catalog = await readLandingCatalog(fileURLToPath(new URL('./assets/release.json', import.meta.url)))
        return html.replace('<!-- downloads -->', downloadsHTML(catalog, /<html\s+lang="en"/u.test(html)))
      },
    },
  }],
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
