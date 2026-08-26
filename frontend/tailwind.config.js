/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fef2f2",
          100: "#fde3e3",
          200: "#fbc9c9",
          300: "#f7a3a3",
          400: "#f16f6f",
          500: "#e63946",
          600: "#d12630",
          700: "#af1c25",
          800: "#8f1a21",
          900: "#771a20",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};
