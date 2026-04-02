import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata = {
  title: "Australian Atlas — Discover Australia's best independent places",
  description:
    "The complete guide to independent Australia. Nine atlases covering craft producers, boutique stays, makers, galleries, natural places, specialty coffee, independent shops and food producers — verified, curated, and mapped.",
  openGraph: {
    title: "Australian Atlas",
    description: "Discover Australia's best independent places",
    url: "https://australianatlas.com.au",
    siteName: "Australian Atlas",
    locale: "en_AU",
    type: "website",
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-192.png', sizes: '192x192' },
      { url: '/favicon-512.png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable}`}>
      <body className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
