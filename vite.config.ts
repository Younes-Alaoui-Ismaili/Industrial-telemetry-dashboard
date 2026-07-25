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
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
      reporter: ['text', 'text-summary'],
    },
  },
});
