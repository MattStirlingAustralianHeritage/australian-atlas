import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AtlasAnalytics from "@/components/AtlasAnalytics";
import PageTracker from "@/components/PageTracker";
import { websiteJsonLd, organizationJsonLd } from "@/lib/jsonLd";
import GlobalErrorReporter from "@/components/GlobalErrorReporter";

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
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
  metadataBase: new URL("https://australianatlas.com.au"),
  openGraph: {
    title: "Australian Atlas — Discover Australia's best independent places",
    description:
      "The complete guide to independent Australia. Nine atlases covering craft producers, boutique stays, makers, galleries, natural places, specialty coffee, independent shops and food producers — verified, curated, and mapped.",
    url: "https://australianatlas.com.au",
    siteName: "Australian Atlas",
    locale: "en_AU",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Australian Atlas — Discover Australia's best independent places",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Australian Atlas — Discover Australia's best independent places",
    description:
      "The complete guide to independent Australia. Nine atlases covering craft producers, boutique stays, makers, galleries, natural places, specialty coffee, independent shops and food producers.",
    site: "@australianatlas",
    images: ["/og-image.png"],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(reg){reg.unregister()})})}
        ` }} />
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
        <AtlasAnalytics />
        <PageTracker vertical="portal" />
        <GlobalErrorReporter />
      </body>
    </html>
  );
}
