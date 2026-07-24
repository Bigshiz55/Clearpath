import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b0f17",
        panel: "#111827",
        "panel-2": "#0f1623",
        edge: "#1f2937",
        ink: "#e5e7eb",
        muted: "#9ca3af",
        brand: "#6366f1",
        watch: "#38bdf8",
        read: "#f59e0b",
        good: "#22c55e",
        warn: "#eab308",
        bad: "#ef4444",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
