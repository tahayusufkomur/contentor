import type { Config } from "tailwindcss";

// Loading/feedback motion shared by both apps. Decorative only — callers gate
// usage behind `motion-safe:` so reduced-motion users get static equivalents.
const preset: Partial<Config> = {
  theme: {
    extend: {
      // Apple-scale type (spec 5.1). Fluid between phone and desktop so one
      // utility serves both; weight and tracking ride along.
      fontSize: {
        display: ["clamp(56px, 4.2vw + 24px, 80px)", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "600" }],
        "display-2": ["clamp(40px, 3.1vw + 12px, 56px)", { lineHeight: "1.07", letterSpacing: "-0.028em", fontWeight: "600" }],
        title: ["clamp(32px, 1.4vw + 20px, 40px)", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "title-2": ["clamp(24px, 0.7vw + 18px, 28px)", { lineHeight: "1.14", letterSpacing: "-0.015em", fontWeight: "600" }],
        "body-lg": ["clamp(19px, 0.5vw + 14px, 21px)", { lineHeight: "1.4", letterSpacing: "-0.01em" }],
        body: ["17px", { lineHeight: "1.47", letterSpacing: "-0.01em" }],
        caption: ["14px", { lineHeight: "1.43" }],
      },
      maxWidth: { text: "980px", media: "1440px" },
      transitionTimingFunction: { expo: "cubic-bezier(0.22, 1, 0.36, 1)" },
      borderRadius: { tile: "18px" },
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
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s linear infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.2s ease-out both",
        "progress-indeterminate":
          "progress-indeterminate 1.1s ease-in-out infinite",
      },
    },
  },
};

export default preset;
