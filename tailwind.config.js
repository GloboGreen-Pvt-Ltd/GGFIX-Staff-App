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
        primary: {
          DEFAULT: '#035C6C',
          light: '#035C6C',
          dark: '#024A57',
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        secondary: {
          DEFAULT: '#035C6C',
          light: '#3B82F6',
          dark: '#1D4ED8',
        },
        background: '#FFFFFF',
        card: '#FFFFFF',
        text: {
          DEFAULT: '#111111',
          muted: '#6B7280',
        },
        border: '#E5E7EB',
        success: '#609138',
        warning: '#F59E0B',
        danger: '#EF4444',
        error: '#EF4444',
        info: '#0EA5E9',
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
