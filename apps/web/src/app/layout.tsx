import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Persist v0.4 — Planning Runtime',
  description: 'Planning Execution Runtime — Plan, Tool, Synthesis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 24 }}>
        {children}
      </body>
    </html>
  );
}
