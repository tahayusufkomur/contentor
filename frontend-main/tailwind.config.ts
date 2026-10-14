import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

import sharedPreset from "../packages/shared/tailwind-preset";

const config: Config = {
  presets: [sharedPreset],
  darkMode: "class",
  // Include the shared admin-kit package (imported via the `@shared/*` path
  // alias) so its Tailwind classes actually get generated — classes used
  // ONLY there (never coincidentally reused in this app's own src/) were
  // silently dropped otherwise (e.g. `max-h-32` on the gallery JSON modal's
  // image preview, which left the uploaded image unconstrained and pushed
  // the Save/Delete buttons off-screen).
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../packages/shared/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        "marketing-accent": {
          DEFAULT: "var(--marketing-accent)",
          foreground: "var(--marketing-accent-foreground)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
        },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 12px)",
        "4xl": "calc(var(--radius) + 16px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        // No serif in the house system — `display` aliases to the sans stack
        // so legacy `.text-display`/`font-display` usages stay on-brand.
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        reveal: {
          from: {
            opacity: "0",
            transform: "translate(var(--reveal-x, 0), var(--reveal-y, 24px))",
          },
          to: { opacity: "1", transform: "translate(0, 0)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        reveal: "reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) both",
        marquee: "marquee 30s linear infinite",
        "scale-in": "scale-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
      backdropBlur: {
        xs: "4px",
        "4xl": "72px",
      },
    },
  },
  plugins: [typography],
};
export default config;
