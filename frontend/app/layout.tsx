import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

// Real font decision (blueprint §3.1): IBM Plex Sans self-hosted via next/font,
// 4 weights max, latin + latin-ext subsets. Exposed as --font-sans for Tailwind.
const plexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'PoultryOS',
  description: 'Poultry farm management for medium-scale Indian farmers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plexSans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
