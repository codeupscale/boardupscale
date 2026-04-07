// @ts-check
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      globals: { node: true, jest: true },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // Unused vars — warn, ignore underscore-prefixed
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Explicit any — warn only (NestJS uses it internally)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Floating promises are silent bugs in async NestJS code
      '@typescript-eslint/no-floating-promises': 'error',
      // No eval
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
];
