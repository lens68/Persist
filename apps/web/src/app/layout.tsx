import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Persist',
  description: 'Stateful Chat Runtime — UI shell',
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
