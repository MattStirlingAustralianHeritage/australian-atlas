import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
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
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
