import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vitest config inline so apps/web `pnpm test` works without a separate vitest.config.ts.
// Reference: https://vitest.dev/config/
export default defineConfig({
  plugins: [
    // Order per Pitfall 8 + shadcn Vite installation guide:
    // TanStack router-plugin MUST come BEFORE @vitejs/plugin-react so route files are
    // transformed first; tailwindcss after react; VitePWA last.
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Maxytest',
        short_name: 'Maxytest',
        description: 'Remote UX research platform',
        theme_color: '#4F46E5',
        background_color: '#FFFFFF',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // PHASE 1: precache shell assets only. Runtime caching strategies (frame PNGs,
        // manifest network-first) ship in Phase 5 once Phase 2's content-hashed asset
        // URLs exist (Pitfall 15b).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
  },
  // @ts-expect-error — Vitest extends Vite config at runtime; type lives in vitest/config.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    // Plan 01-02 Task 5 adds the apps/web/tests/rls/ suite. Vitest's default
    // include glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) already matches both
    // src/**/*.test.ts and tests/**/*.test.ts; we declare the include
    // explicitly here so the route stays obvious in the config + survives
    // future tweaks to the default glob.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
  },
});
