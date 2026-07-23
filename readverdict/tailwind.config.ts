import type { Config } from 'tailwindcss';

/**
 * ReadVerdict design tokens — part of the Verdict product family.
 * Direction: premium, editorial, cinematic-but-for-books. Deep warm-obsidian
 * surfaces, ivory type, a brass "verdict" accent, and a restrained signal blue.
 * Not a library aesthetic; not a bookstore.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm near-black surface ramp.
        obsidian: {
          950: '#08080a',
          900: '#0d0d10',
          850: '#121319',
          800: '#181a22',
          700: '#22242f',
          600: '#2e313f',
          500: '#3d4152',
        },
        // Ivory / parchment type ramp.
        ivory: {
          50: '#fbfaf6',
          100: '#f3f1e9',
          200: '#e3e0d3',
          300: '#c9c5b4',
          400: '#a6a292',
        },
        // Brass — the editorial "Verdict" accent.
        brass: {
          50: '#fbf3df',
          100: '#f6e6ba',
          300: '#e6c877',
          400: '#d8b154',
          500: '#c6963a',
          600: '#a2792c',
          700: '#7c5d23',
        },
        // Restrained signal blue for interactive/link states.
        signal: {
          300: '#8fb8ff',
          400: '#5f93f5',
          500: '#3d73e0',
          600: '#2c58b8',
        },
        // Verdict tiers (working terminology).
        verdict: {
          must: '#3fb27f', // Must Read
          strong: '#79c06a', // Strong Yes
          worth: '#c6b24a', // Worth a Look
          maybe: '#d59440', // Maybe
          pass: '#c96f63', // Probably Pass
        },
      },
      fontFamily: {
        // Editorial display serif (system stack for now; Phase 2 may license a face).
        display: ['Georgia', 'Cambria', 'Times New Roman', 'ui-serif', 'serif'],
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
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 12px 40px -16px rgba(0,0,0,0.7)',
        ring: '0 0 0 1px rgba(255,255,255,0.05)',
        brass: '0 8px 30px -10px rgba(198,150,58,0.45)',
      },
      backgroundImage: {
        'verdict-radial':
          'radial-gradient(1200px 600px at 85% -10%, rgba(198,150,58,0.12), transparent), radial-gradient(900px 520px at 0% 0%, rgba(61,115,224,0.08), transparent)',
      },
      maxWidth: {
        content: '72rem',
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
