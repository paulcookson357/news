import type { Metadata } from 'next';
import { Inter, Newsreader, Playfair_Display } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'The Meridian — Independent Broadsheet & Multi-Source News',
  description:
    'A balanced, factual broadsheet newspaper aggregating verified free reporting from UK and international sources, with live multi-source deep-dive dispatches.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en-GB"
      className={`${playfair.variable} ${newsreader.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F7F4EE] text-[#141413] selection:bg-[#1D3557]/15 selection:text-[#141413]">
        {children}
      </body>
    </html>
  );
}
