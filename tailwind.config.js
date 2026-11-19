/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand palette (NearGFix): Primary Teal #035C6C · Navy #1C3053 ·
        // Bright Blue #0788C9 · Green #609138 · Orange #FAA700 · Red #F32C26 ·
        // White #FFFFFF · Light Gray #F3F4F6 · Black #111111. Shade scales are
        // tints / shades of the brand teal.
        primary: {
          DEFAULT: '#035C6C',
          light: '#E5F3F5',
          dark: '#024A57',
          50: '#E5F3F5',
          100: '#CCE7EB',
          200: '#99CFD8',
          300: '#66B7C4',
          400: '#339FB1',
          500: '#0A7B8E',
          600: '#035C6C',
          700: '#024A57',
          800: '#023942',
          900: '#01272E',
        },
        // Links, secondary buttons and interactive icons.
        secondary: {
          DEFAULT: '#0788C9',
          light: '#E6F3FA',
          dark: '#06699B',
        },
        navy: '#1C3053',
        background: '#FFFFFF',
        card: '#FFFFFF',
        surface: '#F3F4F6',
        text: {
          DEFAULT: '#111111',
          muted: '#6B7280',
        },
        border: '#E5E7EB',
        success: '#609138',
        warning: '#FAA700',
        danger: '#F32C26',
        error: '#F32C26',
        info: '#0788C9',
      },
      fontFamily: {
        sans: ['System'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '28px',
      },
    },
  },
  plugins: [],
};
