import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { WebSocketProvider } from '@/lib/WebSocketProvider';

export const metadata: Metadata = {
  title: 'InfraFlow AI — CI/CD Healing Dashboard',
  description: 'Autonomous CI/CD Healing Agent Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-infraflow-bg">
        <ThemeProvider>
          <nav className="border-b border-infraflow-border bg-infraflow-card px-6 py-4">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-infraflow-accent flex items-center justify-center text-white font-bold text-sm">
                  IF
                </div>
                <span className="text-lg font-semibold text-infraflow-text">
                  InfraFlow AI
                </span>
                <span className="text-xs text-infraflow-text-muted bg-infraflow-bg px-2 py-0.5 rounded">
                  MVP
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-infraflow-text-secondary">
                <Link href="/" className="hover:text-infraflow-text transition-colors">
                  Dashboard
                </Link>
                <Link href="/healing" className="hover:text-infraflow-text transition-colors">
                  Healing Sessions
                </Link>
                <ThemeToggle />
              </div>
            </div>
          </nav>
          <WebSocketProvider>
            <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
          </WebSocketProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
