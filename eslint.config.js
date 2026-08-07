import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/target/**',
      '**/coverage/**',
      '**/node_modules/**',
      'artifacts/**',
      'prototype-html/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['packages/editor-core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'vue',
                'vue/**',
                '@tauri-apps/**',
                '@cute-screen/editor-renderer',
                '@cute-screen/editor-vue',
              ],
              message:
                'editor-core must remain independent from Vue, Tauri, DOM, and upper layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/editor-renderer/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'vue',
                'vue/**',
                '@tauri-apps/**',
                '@cute-screen/editor-vue',
                '@cute-screen/desktop',
              ],
              message:
                'editor-renderer may depend on editor-core, not Vue, Tauri, or upper layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/editor-vue/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/**', '@cute-screen/desktop'],
              message:
                'editor-vue may depend on editor-renderer and Vue, not Tauri or desktop.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
