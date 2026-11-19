import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#080808",
        surface: "#111111",
        raised: "#1A1A1A",
        line: { DEFAULT: "#222222", strong: "#333333" },
        fg: "#F2F2F2",
        mute: "#9A9A9A",
        dim: "#6E6E6E",
        cobalt: { DEFAULT: "#2F5BFF", hover: "#4A72FF", ice: "#B7C7FF" },
        tally: "#FFB224",
        danger: "#FF6B6B",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        tally: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.25" } },
      },
      animation: { tally: "tally 1.2s steps(1) infinite" },
    },
  },
  plugins: [],
};
export default config;
