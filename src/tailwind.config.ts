import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#5f4a8c',
        accent: '#fefacd',
        'background-light': '#f7f6f7',
        'background-dark': '#18161c',
        'panel-dark': '#1c1a22',
        'neutral-dark': '#232129',
        'neutral-border': '#2f2e33',
      },
      fontFamily: {
        display: ['var(--font-manrope)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
}

export default config
