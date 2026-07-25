/**
 * Colours mirror src/constants/theme.ts, which is the source of truth for code
 * that needs raw hex (chart strokes). src/constants/theme.test.ts asserts the two
 * stay in step, so they cannot drift.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hmi: {
          page: '#0d0d0d',
          panel: '#1a1a19',
          raised: '#232322',
          primary: '#ffffff',
          secondary: '#c3c2b7',
          muted: '#8f8d86',
          grid: '#2c2c2a',
          axis: '#383835',
          warning: '#fab219',
          alarm: '#d03b3b',
        },
      },
    },
  },
  plugins: [],
};
