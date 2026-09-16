import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.local/**',
    '.vercel/**',
    'node_modules/**',
    'test-results/**',
    'playwright-report/**',
    'coverage/**',
    'public/sw.js',
    'next-env.d.ts',
  ]),
]);
