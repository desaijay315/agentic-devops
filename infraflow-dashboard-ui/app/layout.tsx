import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en">
      <body className="min-h-screen bg-infraflow-bg">
        <nav className="border-b border-infraflow-border bg-infraflow-card px-6 py-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-infraflow-accent flex items-center justify-center text-white font-bold text-sm">
                IF
              </div>
              <span className="text-lg font-semibold text-white">
                InfraFlow AI
              </span>
              <span className="text-xs text-gray-500 bg-infraflow-bg px-2 py-0.5 rounded">
                MVP
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <a href="/" className="hover:text-white transition-colors">
                Dashboard
              </a>
              <a href="/healing" className="hover:text-white transition-colors">
                Healing Sessions
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
