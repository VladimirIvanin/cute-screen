import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: ['packages/editor-core/src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'vue',
          environment: 'jsdom',
          include: ['tests/unit/vue/**/*.test.ts'],
          setupFiles: ['tests/unit/vue/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'fixtures',
          environment: 'node',
          include: ['tests/fixtures/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'fake-platform',
          environment: 'node',
          include: ['tests/fake-platform/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'boundaries',
          environment: 'node',
          include: ['tests/boundaries/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'render-harness',
          environment: 'node',
          include: ['tests/harness/render/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'perf-harness',
          environment: 'node',
          include: ['tests/harness/perf/**/*.test.ts'],
        },
      },
    ],
  },
})
