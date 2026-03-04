import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NexusAuto — QA Web Automation Platform',
  description:
    'Automated QA testing tool powered by Selenium WebDriver. Fills forms, clicks buttons, captures screenshots in real-time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${jetbrainsMono.variable} bg-slate-950 antialiased`}>
      <body className="min-h-screen font-[var(--font-inter)]">{children}</body>
    </html>
  );
}
