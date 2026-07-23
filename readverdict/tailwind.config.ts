import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm "reading room" palette — paper, ink, and a bookmark accent.
        paper: {
          50: '#fbf7ef',
          100: '#f4ecdd',
          200: '#e8dbc2',
        },
        ink: {
          950: '#0c0a07',
          900: '#14110b',
          850: '#1b1710',
          800: '#241f16',
          700: '#332b1f',
          600: '#4a3f2e',
          500: '#6b5c44',
        },
        accent: {
          50: '#fff5ec',
          100: '#ffe6d1',
          200: '#f9c9a3',
          300: '#f6b587',
          400: '#ef944f',
          500: '#e2762a',
          600: '#c15d18',
          700: '#974714',
        },
        leaf: {
          400: '#7cba6b',
          500: '#57a24a',
        },
        verdict: {
          must: '#3fa34d',
          strong: '#6bbf59',
          worth: '#a8c256',
          possible: '#e0b83c',
          low: '#e08a3c',
          skip: '#d1685c',
        },
      },
      fontFamily: {
        serif: [
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'serif',
        ],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        book: '0 10px 40px -12px rgba(0,0,0,0.55)',
        spine: 'inset 3px 0 6px -3px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'reading-radial':
          'radial-gradient(1100px 560px at 82% -12%, rgba(226,118,42,0.14), transparent), radial-gradient(820px 460px at 0% 0%, rgba(87,162,74,0.08), transparent)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
