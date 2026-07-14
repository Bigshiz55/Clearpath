import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07090f',
          900: '#0b0e17',
          850: '#0f1320',
          800: '#141a2b',
          700: '#1c2438',
          600: '#28324c',
          500: '#3a4660',
        },
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          300: '#7aa8ff',
          400: '#4f86ff',
          500: '#2f6bff',
          600: '#1f52e6',
          700: '#1a41b4',
        },
        gold: {
          400: '#f5c65a',
          500: '#e6ad33',
        },
        verdict: {
          must: '#22c55e',
          strong: '#4ade80',
          worth: '#a3e635',
          possible: '#facc15',
          low: '#fb923c',
          skip: '#f87171',
        },
      },
      fontFamily: {
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
        glow: '0 0 0 1px rgba(255,255,255,0.04), 0 20px 60px -20px rgba(47,107,255,0.35)',
        card: '0 10px 40px -12px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'cinema-radial':
          'radial-gradient(1200px 600px at 80% -10%, rgba(47,107,255,0.18), transparent), radial-gradient(900px 500px at 0% 0%, rgba(230,173,51,0.08), transparent)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
