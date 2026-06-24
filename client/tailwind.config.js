/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1A1D1B",
        paper: "#FBF9F4",
        moss: {
          50: "#F2F5EE",
          100: "#E3EAD9",
          300: "#B4C79E",
          500: "#6B8552",
          600: "#54693F",
          700: "#3F4F2F",
        },
        rust: {
          400: "#C97B5C",
          500: "#B5603F",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
