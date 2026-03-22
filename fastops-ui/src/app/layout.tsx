import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FastOps OS',
  description: 'AI SEAL Team — Multi-Model Orchestration Engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        {children}
      </body>
    </html>
  );
}
