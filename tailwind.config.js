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
          page: '#edf2f7',
          panel: '#ffffff',
          raised: '#e5ecf3',
          primary: '#18324b',
          secondary: '#344e65',
          muted: '#526578',
          grid: '#d6e0e9',
          axis: '#a6b6c5',
          warning: '#925600',
          alarm: '#b92727',
        },
      },
    },
  },
  plugins: [],
};
