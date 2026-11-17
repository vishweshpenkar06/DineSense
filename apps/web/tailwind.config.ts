import type { Config } from "tailwindcss";

const status = (name: string) => ({
  DEFAULT: `var(--status-${name}-bg)`,
  foreground: `var(--status-${name}-fg)`,
});

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Semantic UI tokens (light/dark via CSS variables). */
        background: "var(--bg)",
        foreground: "var(--text)",
        card: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
        },
        border: "var(--border)",
        "muted-foreground": "var(--muted)",
        brand: {
          DEFAULT: "var(--brand)",
          foreground: "var(--brand-fg)",
          text: "var(--brand-text)",
        },
        overlay: "var(--overlay)",
        status: {
          free: status("free"),
          occupied: status("occupied"),
          "needs-order": status("needs-order"),
          ordered: status("ordered"),
          "food-ready": status("food-ready"),
          dining: status("dining"),
          "bill-requested": status("bill-requested"),
          "needs-cleaning": status("needs-cleaning"),
        },

        /* Legacy screen tokens — removed as each screen migrates. */
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
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        control: "0.75rem",
        card: "1rem",
        sheet: "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgb(28 25 21 / 0.04)",
        float: "0 8px 24px rgb(28 25 21 / 0.12)",
        sheet: "0 40px 120px -30px rgba(0,0,0,0.85)",
        paper: "0 30px 80px -30px rgba(0,0,0,0.7)",
      },
    },
  },
  plugins: [],
};

export default config;
