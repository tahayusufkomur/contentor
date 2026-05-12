import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        brand: {
          primary: 'var(--brand-primary)',
          accent: 'var(--brand-accent)',
          warm: 'var(--brand-warm)',
          surface: 'var(--brand-surface)',
          deep: 'var(--brand-deep)',
        },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 6px)',
        sm: 'calc(var(--radius) - 10px)',
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'var(--font-display)',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          'system-ui',
          'serif',
        ],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glass-sm': '0 1px 1px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(8,15,89,0.12)',
        glass: '0 1px 0 rgba(255,255,255,0.06) inset, 0 30px 80px -32px rgba(8,15,89,0.22)',
        'glow-blue': '0 0 0 1px rgba(3,176,245,0.18), 0 0 40px -4px rgba(3,176,245,0.55)',
      },
      keyframes: {
        reveal: {
          from: { opacity: '0', transform: 'translate(var(--reveal-x, 0), var(--reveal-y, 24px))' },
          to: { opacity: '1', transform: 'translate(0, 0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'aurora-shift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) rotate(0deg)' },
          '33%': { transform: 'translate3d(2%,-1%,0) rotate(1deg)' },
          '66%': { transform: 'translate3d(-1%,1%,0) rotate(-1deg)' },
        },
      },
      animation: {
        reveal: 'reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        marquee: 'marquee 30s linear infinite',
        'scale-in': 'scale-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        aurora: 'aurora-shift 22s ease-in-out infinite',
      },
      backdropBlur: {
        xs: '4px',
        '4xl': '72px',
      },
    },
  },
  plugins: [],
}
export default config
