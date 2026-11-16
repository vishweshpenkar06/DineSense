import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0B0A08",
        surface: "#14110D",
        raised: "#1C1813",
        line: "#2E2822",
        ink: "#F4EFE4",
        muted: "#A79D8E",
        faint: "#776E60",
        accent: "#E5B14C",
        accentSoft: "#3A2E1B",
        jade: "#67C39B",
        coral: "#F0795F",
        iris: "#B79BE5",
        clay: "#E39A63",
        slate: {
          50: "#F8F4EB",
          100: "#F0EADF",
          200: "#E0D8C9",
          300: "#C9BFAD",
          400: "#A79D8E",
          500: "#8D8374",
          600: "#6F6659",
          700: "#544C42",
          800: "#332D26",
          900: "#1D1A15",
          950: "#100E0B",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        sheet: "0 40px 120px -30px rgba(0,0,0,0.85)",
        paper: "0 30px 80px -30px rgba(0,0,0,0.7)",
      },
    },
  },
  plugins: [],
};

export default config;
