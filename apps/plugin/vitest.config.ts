// apps/plugin/vitest.config.ts — Phase 02.2 Plan 01 scaffold.
//
// Minimal Vitest configuration per PATTERNS §16. Plugin unit tests are
// pure-logic (sha256_16, flow detection, BFS, payload shaping) and run in
// the Node environment — no jsdom needed (no DOM-coupled tests until UI
// integration in Plan 07+).
//
// Test files land in src/__tests__/ in Plan 06 (pure-libs phase). For Plan 01
// scaffold, running this config with zero test files exits 0 cleanly.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
