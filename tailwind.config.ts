// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0D2B5E',
          deep: '#071a3e',
          mid: '#1a3d72',
          light: '#2a5298',
        },
        gold: {
          DEFAULT: '#C9922E',
          light: '#e8b84b',
          pale: '#f5e6c8',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out forwards',
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'timer-tick': 'timer-tick 1s ease-in-out infinite',
        'reveal-glow': 'reveal-glow 1s ease-out',
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'timer-tick': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        'reveal-glow': {
          '0%': { boxShadow: '0 0 0 0 rgba(201, 146, 46, 0.4)' },
          '70%': { boxShadow: '0 0 0 20px rgba(201, 146, 46, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(201, 146, 46, 0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
