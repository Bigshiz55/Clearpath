import type { Config } from 'tailwindcss';

/**
 * ReadVerdict design tokens — part of the Verdict product family, but with its
 * own literary identity: a private library, a first-edition book, a judicial
 * chamber. Deep library green + dark ink surfaces, warm parchment type,
 * burnished copper and evidence gold accents, oxblood for objections.
 *
 * Legacy token names from the Phase 2 shell (obsidian/ivory/brass/signal) are
 * preserved as aliases pointing at the new palette, so existing components adopt
 * the new identity without markup changes. New courtroom surfaces use the
 * semantic names (library/parchment/copper/gold/oxblood/sage/stone).
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep Library Green — the brand primary.
        library: {
          700: '#0c2b23',
          600: '#0f342b',
          500: '#123C32',
          400: '#1c5446',
          300: '#2f7a66',
        },
        // Dark Ink neutral surface ramp (dark mode base).
        ink: {
          950: '#0b100e',
          900: '#0e1512',
          850: '#121a16',
          800: '#17201D',
          700: '#212c27',
          600: '#2c3832',
          500: '#3c4a43',
        },
        // Warm parchment / paper / stone (light surfaces & type on dark).
        parchment: {
          50: '#FBF8F1', // soft paper
          100: '#F5EFE3', // warm parchment
          200: '#ede4d2',
          300: '#D7D0C5', // neutral stone
          400: '#b7ae9f',
          500: '#8f8677',
        },
        copper: {
          50: '#f7ead9',
          100: '#eed4b8',
          300: '#d59a6a',
          400: '#c07a44',
          500: '#B56F3B', // burnished copper
          600: '#97592d',
          700: '#734425',
        },
        gold: {
          50: '#f7eccf',
          100: '#eed8a3',
          300: '#d8b968',
          400: '#C69A45', // evidence gold
          500: '#ac8231',
          600: '#876527',
        },
        oxblood: {
          400: '#9a3a49',
          500: '#7C2938', // oxblood accent
          600: '#651f2c',
        },
        sage: {
          300: '#b3c4b0',
          400: '#9CAF9B', // muted sage
          500: '#7e947d',
          600: '#63795f',
        },
        stone: '#D7D0C5',

        // ---- Legacy aliases (Phase 2 components) → new palette ----
        obsidian: {
          950: '#0b100e',
          900: '#0e1512',
          850: '#121a16',
          800: '#17201D',
          700: '#212c27',
          600: '#2c3832',
          500: '#3c4a43',
        },
        ivory: {
          50: '#FBF8F1',
          100: '#F5EFE3',
          200: '#ede4d2',
          300: '#cfc7b6',
          400: '#a49c8b',
        },
        brass: {
          50: '#f7ead9',
          100: '#eed4b8',
          300: '#d59a6a',
          400: '#c07a44',
          500: '#B56F3B',
          600: '#97592d',
          700: '#734425',
        },
        signal: {
          300: '#b3c4b0',
          400: '#9CAF9B',
          500: '#7e947d',
          600: '#63795f',
        },
        // Verdict tiers, re-hued for the literary identity.
        verdict: {
          must: '#3f9e6f', // READ IT / Must Read — library green
          strong: '#6a9e52', // Strong Yes — sage-green
          worth: '#C69A45', // Worth a Look — evidence gold
          maybe: '#c07a44', // Maybe — copper
          pass: '#9a3a49', // Skip / Probably Pass — oxblood
        },
      },
      fontFamily: {
        // Editorial display serif (system stack; a licensed face can drop in later).
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
      fontSize: {
        // Fluid editorial display scale (clamped so it never overflows mobile).
        'display-sm': ['clamp(1.85rem, 1.4rem + 2.2vw, 2.6rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        'display-md': ['clamp(2.3rem, 1.6rem + 3.4vw, 3.4rem)', { lineHeight: '1.06', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2.8rem, 1.6rem + 5.4vw, 4.6rem)', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 12px 40px -16px rgba(0,0,0,0.6)',
        ring: '0 0 0 1px rgba(245,239,227,0.06)',
        brass: '0 8px 30px -10px rgba(181,111,59,0.45)',
        copper: '0 8px 30px -10px rgba(181,111,59,0.45)',
        seal: '0 0 0 1px rgba(198,154,69,0.35), 0 6px 20px -8px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        // Library-green + copper chamber glow (dark).
        'verdict-radial':
          'radial-gradient(1200px 600px at 85% -12%, rgba(181,111,59,0.12), transparent), radial-gradient(1000px 560px at 0% 0%, rgba(18,60,50,0.35), transparent)',
        // Warm parchment glow (light).
        'verdict-radial-light':
          'radial-gradient(1200px 600px at 85% -12%, rgba(181,111,59,0.10), transparent), radial-gradient(1000px 560px at 0% 0%, rgba(156,175,155,0.18), transparent)',
      },
      maxWidth: {
        content: '72rem',
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
