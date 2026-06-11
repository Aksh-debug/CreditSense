import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — warm "paper / ledger" rather than flat white
        paper: "#F7F5F0",
        surface: "#FFFFFF",
        // Ink — deep slate for trust & precision
        ink: {
          DEFAULT: "#1A2230",
          soft: "#3A4456",
          mute: "#6B7480",
        },
        line: "#E5E1D8",
        // Single confident brand accent (considered teal, not default acid-green)
        brand: {
          DEFAULT: "#0E7C66",
          dark: "#0A5E4D",
          tint: "#E6F2EE",
        },
        // Semantic decision states — these encode meaning, not decoration
        go: { DEFAULT: "#0E7C66", tint: "#E6F2EE" },
        review: { DEFAULT: "#B5791B", tint: "#FBF1DD" },
        decline: { DEFAULT: "#B23A3A", tint: "#FAE8E8" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,34,48,0.04), 0 4px 16px rgba(26,34,48,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
