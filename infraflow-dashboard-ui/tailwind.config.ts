import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        infraflow: {
          bg: 'var(--bg)',
          card: 'var(--card)',
          border: 'var(--border)',
          accent: '#6366f1',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          healing: '#8b5cf6',
          text: 'var(--text)',
          'text-secondary': 'var(--text-secondary)',
          'text-muted': 'var(--text-muted)',
          'skeleton': 'var(--skeleton)',
          'skeleton-light': 'var(--skeleton-light)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
