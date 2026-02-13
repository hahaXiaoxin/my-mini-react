import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['scripts/**/*.{js,cjs}'],
    languageOptions: { globals: globals.node }
  },
  tseslint.configs.recommended,
  {
    // 测试文件特殊配置（必须在 tseslint.configs.recommended 之后以覆盖其规则）
    files: ['**/__tests__/**/*.{js,ts,jsx,tsx}', '**/*.test.{js,ts,jsx,tsx}', '**/*.spec.{js,ts,jsx,tsx}'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      // 允许测试文件中使用 require()，因为 jest.resetModules() 后需要动态导入
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  eslintPluginPrettier
]);
