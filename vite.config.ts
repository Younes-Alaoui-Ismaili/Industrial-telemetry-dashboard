import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Relative base: emits ./assets/... so the build resolves under any subpath and
  // survives a repository rename. The app is a single page with no router, so
  // relative asset resolution is safe here.
  base: './',
  plugins: [react()],
  test: {
    globals: true,
    // Two projects, because the two halves of this repository run in different
    // places: the dashboard is browser code and needs jsdom, the bridge is a Node
    // process and must not have a DOM stubbed under it. One `npm test` runs both.
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: './src/test/setup.ts',
        },
      },
      {
        extends: true,
        test: {
          name: 'bridge',
          include: ['bridge/test/**/*.test.js'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
      reporter: ['text', 'text-summary'],
    },
  },
});
