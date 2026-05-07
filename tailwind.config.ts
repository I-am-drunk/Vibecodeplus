import type { Config } from 'tailwindcss'

export default {
  content: ['./client/src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        accent: '#0a84ff',
        'accent-hover': '#409cff',
        success: '#30d158',
        warning: '#ff9f0a',
        destructive: '#ff453a',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        apple: '10px',
        'apple-lg': '14px',
        'apple-xl': '20px',
      },
      animation: {
        'spin-slow': 'spin 1s linear infinite',
        'fade-in': 'fadeIn 0.15s ease',
        'slide-in': 'slideIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
      },
    },
  },
  plugins: [],
} satisfies Config
