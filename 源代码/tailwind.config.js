/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        cyan: "rgb(var(--color-cyan) / <alpha-value>)",
        amber: "rgb(var(--color-amber) / <alpha-value>)",
        violet: "rgb(var(--color-violet) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
      },
      boxShadow: {
        panel: "0 14px 42px rgba(0,0,0,0.22)",
      },
    },
  },
  plugins: [],
};
