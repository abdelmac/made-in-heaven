import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import nextEnvironment from '@next/env';
import { loadMobilePublicEnvironment } from './scripts/mobile-public-env.mjs';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
nextEnvironment.loadEnvConfig(projectRoot);
loadMobilePublicEnvironment(projectRoot);

export default defineConfig(({ mode }) => ({
  root: resolve(projectRoot, 'mobile'),
  publicDir: resolve(projectRoot, 'public'),
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': resolve(projectRoot, 'src') } },
  // Only these public values enter the mobile bundle. Never expose process.env.
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env.NEXT_PUBLIC_SOLACE_MOBILE': JSON.stringify('true'),
    'process.env.NEXT_PUBLIC_MOBILE_API_ORIGIN': JSON.stringify(
      process.env.SOLACE_MOBILE_API_ORIGIN || 'https://www.solace-pomodoro.com',
    ),
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    ),
    'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
    ),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    ),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
}));
