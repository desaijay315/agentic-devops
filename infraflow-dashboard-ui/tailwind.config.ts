import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        infraflow: {
          bg: '#0a0a0f',
          card: '#12121a',
          border: '#1e1e2e',
          accent: '#6366f1',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          healing: '#8b5cf6',
        },
      },
    },
  },
  plugins: [],
};

export default config;
