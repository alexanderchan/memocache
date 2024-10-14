// @ts-check

import eslint from '@eslint/js'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import noOnlyTests from 'eslint-plugin-no-only-tests'

export const react = [
  // TS types are broken https://github.com/jsx-eslint/eslint-plugin-react/issues/3838
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
]

export const configs = {
  react,
}

export default tseslint.config(
  eslint.configs.recommended,
  // ...tseslint.configs.recommended, // less strict
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  //
  // ...configs.react, for react
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'no-only-tests': noOnlyTests,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-only-tests/no-only-tests': 'error',
      'no-console': [
        'error',
        {
          allow: ['warn', 'error', 'info'],
        },
      ],
    },
  },

  {
    files: ['**/*.stories.ts?', '**/example*'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/'],
  },
)
