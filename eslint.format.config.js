import stylistic from '@stylistic/eslint-plugin'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import readability from './scripts/eslint-readability.mjs'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/target/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/generated/**',
      'src-tauri/gen/**',
      'artifacts/**',
      'prototype-html/**',
      'screenshots/**',
    ],
  },
  ...vue.configs['flat/base'],
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    plugins: { '@stylistic': stylistic, readability },
    rules: {
      '@stylistic/array-bracket-spacing': ['error', 'never'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/arrow-spacing': 'error',
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': 'error',
      '@stylistic/comma-style': ['error', 'last'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/indent': ['error', 2, {
        SwitchCase: 1, offsetTernaryExpressions: true, ignoredNodes: ['TSInterfaceHeritage'],
      }],
      '@stylistic/indent-binary-ops': ['error', 2],
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/linebreak-style': ['error', 'unix'],
      'readability/structural-lines': 'error',
      '@stylistic/max-len': [
        'error',
        {
          code: 120,
          tabWidth: 2,
          ignoreComments: true,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: { delimiter: 'none' },
          singleline: { delimiter: 'semi', requireLast: false },
        },
      ],
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/rest-spread-spacing': ['error', 'never'],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/space-before-function-paren': [
        'error',
        {
          named: 'never',
          anonymous: 'always',
          asyncArrow: 'always',
        },
      ],
      '@stylistic/space-in-parens': ['error', 'never'],
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/type-annotation-spacing': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      '@stylistic/max-len': 'off',
      'vue/max-len': ['error', {
        code: 120,
        template: 120,
        tabWidth: 2,
        ignoreComments: true,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        ignoreHTMLAttributeValues: true,
        ignoreHTMLTextContents: true,
      }],
      'vue/first-attribute-linebreak': ['error', { singleline: 'ignore', multiline: 'below' }],
      'vue/html-indent': ['error', 2],
      'vue/html-closing-bracket-newline': ['error', { singleline: 'never', multiline: 'always' }],
      'vue/max-attributes-per-line': ['error', { singleline: 2, multiline: 1 }],
      'vue/multiline-html-element-content-newline': 'error',
    },
  },
]
