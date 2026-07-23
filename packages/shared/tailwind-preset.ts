import type { Config } from "tailwindcss";

// Loading/feedback motion shared by both apps. Decorative only — callers gate
// usage behind `motion-safe:` so reduced-motion users get static equivalents.
const preset: Partial<Config> = {
  theme: {
    extend: {
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s linear infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.2s ease-out both",
      },
    },
  },
};

export default preset;
