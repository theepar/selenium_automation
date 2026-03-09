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

const APP_URL = 'https://scrutiny.com';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Scrutiny — Web QA Automation',
    template: '%s | Scrutiny',
  },
  description:
    'Scrutiny is a web QA automation platform powered by Selenium WebDriver. Crawls every page, fills forms, clicks buttons, captures screenshots, and records the full browser session in real-time.',
  keywords: [
    'web automation', 'QA testing', 'Selenium', 'form testing',
    'screenshot capture', 'session recording', 'web crawler', 'end-to-end testing',
  ],
  authors: [{ name: 'Socialvit' }],
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    type: 'website',
    url: APP_URL,
    title: 'Scrutiny — Web QA Automation',
    description:
      'Crawl every page, fill all forms, click every button, and record the full browser session — automated.',
    siteName: 'Scrutiny',
  },
  twitter: {
    card: 'summary',
    title: 'Scrutiny — Web QA Automation',
    description:
      'Crawl every page, fill all forms, click every button, and record the full browser session — automated.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
      <body className="min-h-screen font-(--font-inter)">{children}</body>
    </html>
  );
}

