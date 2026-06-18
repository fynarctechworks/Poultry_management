import type { Metadata } from 'next';
import { Inter, EB_Garamond } from 'next/font/google';
import './globals.css';

// Font decision (DESIGN.md): body/UI = Inter (the family ElevenLabs uses); display
// = EB Garamond at weight 300 (open-source substitute for Waldenburg Light). Both
// self-hosted via next/font, latin + latin-ext subsets.
const inter = Inter({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
});

const ebGaramond = EB_Garamond({
  weight: ['400', '500'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'PoultryOS',
  description: 'Poultry farm management for medium-scale Indian farmers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${ebGaramond.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
