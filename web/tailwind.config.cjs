/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Values live in src/index.css as CSS variables - see docs/theme.md.
      // Never inline colours in components; use these semantic names.
      colors: {
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
          soft: "rgb(var(--color-primary-soft) / <alpha-value>)",
          contrast: "rgb(var(--color-primary-contrast) / <alpha-value>)",
          bg: "rgb(var(--color-primary-soft-bg) / <alpha-value>)",
        },
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          raised: "rgb(var(--color-surface-raised) / <alpha-value>)",
          sunken: "rgb(var(--color-surface-sunken) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          soft: "rgb(var(--color-ink-soft) / <alpha-value>)",
        },
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        faint: "rgb(var(--color-faint) / <alpha-value>)",
        line: {
          DEFAULT: "rgb(var(--color-line) / <alpha-value>)",
          strong: "rgb(var(--color-line-strong) / <alpha-value>)",
        },
        income: {
          DEFAULT: "rgb(var(--color-income) / <alpha-value>)",
          soft: "rgb(var(--color-income-soft) / <alpha-value>)",
        },
        expense: {
          DEFAULT: "rgb(var(--color-expense) / <alpha-value>)",
          soft: "rgb(var(--color-expense-soft) / <alpha-value>)",
        },
        transfer: {
          DEFAULT: "rgb(var(--color-transfer) / <alpha-value>)",
          soft: "rgb(var(--color-transfer-soft) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
          soft: "rgb(var(--color-warning-soft) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--color-info) / <alpha-value>)",
          soft: "rgb(var(--color-info-soft) / <alpha-value>)",
        },
        overlay: "rgb(var(--color-overlay) / <alpha-value>)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        // Financial display type: totals must dominate secondary metadata.
        "display-sm": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em", fontWeight: "600" }],
        display: ["2rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em", fontWeight: "650" }],
        "display-lg": ["2.75rem", { lineHeight: "3rem", letterSpacing: "-0.03em", fontWeight: "650" }],
        title: ["1.125rem", { lineHeight: "1.625rem", fontWeight: "600" }],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      spacing: {
        "safe-b": "env(safe-area-inset-bottom, 0px)",
      },
      maxWidth: {
        app: "80rem",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "rise": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-left": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        rise: "rise 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-up": "slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-left": "slide-left 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        "spin-slow": "spin-slow 1.4s linear infinite",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};