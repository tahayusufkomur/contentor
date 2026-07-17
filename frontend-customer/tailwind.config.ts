import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

const config: Config = {
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
        "marketing-accent": {
          DEFAULT: "var(--marketing-accent)",
          foreground: "var(--marketing-accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        brand: {
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          warm: "var(--brand-warm)",
          surface: "var(--brand-surface)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
    },
  },
  plugins: [typography],
};
export default config;
