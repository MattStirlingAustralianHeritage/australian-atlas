import { Newsreader, DM_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AtlasAnalytics from "@/components/AtlasAnalytics";
import PageTracker from "@/components/PageTracker";
import { websiteJsonLd, organizationJsonLd } from "@/lib/jsonLd";
import GlobalErrorReporter from "@/components/GlobalErrorReporter";
import LocationWrapper from "@/components/LocationWrapper";
import { createAuthServerClient } from "@/lib/supabase/auth-clients";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import LocaleUrlGuardian from "@/components/LocaleUrlGuardian";
import { ogLocale } from "@/lib/i18n/config";

// Newsreader — an editorial serif with true optical sizing (opsz 6–72):
// classical letterforms (a proper two-part f — Fraunces' curled f didn't
// land), beautiful true italics, and a full variable weight range. Chosen
// against Fraunces / Instrument Serif / Libre Caslon / Cormorant on a live
// specimen of the site's own headlines.
const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

// Mobile viewport + browser-chrome tint. Kept to the safe defaults (no
// viewport-fit:cover) so no page tucks content under a notch; themeColor
// matches the warm page ground so the status/URL bar blends in on phones.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#EFE7D8',
}

// Locale-aware document metadata: the default (English) title/description are
// byte-identical to before; each localized surface (/ko, /zh) gets its own
// title/description + matching OpenGraph locale. Pages with their own
// generateMetadata (place, region) override this; the home and any page without
// its own metadata inherit it.
export async function generateMetadata() {
  const locale = await getLocale()
  const title = {
    en: "Australian Atlas — Discover Australia's best independent places",
    ko: "Australian Atlas — 호주의 독립적인 명소를 발견하세요",
    zh: "Australian Atlas — 发现澳大利亚最好的独立场所",
  }[locale] || "Australian Atlas — Discover Australia's best independent places"
  const description = {
    en: "The curated guide to the best of independent Australia — specialty coffee, makers, distillers, galleries, boutique stays, and the natural places in between. Thousands of independent places, every one verified and mapped.",
    ko: "큐레이션한 독립 호주 가이드 — 스페셜티 커피, 메이커, 양조장, 갤러리, 부티크 숙소, 그리고 그 사이의 자연까지. 검증되고 지도에 표시된 수천 곳의 독립 명소.",
    zh: "精选的独立澳大利亚指南——精品咖啡、匠人、酿酒商、画廊、精品住宿，以及其间的自然秘境。数千处独立场所，每一处都经过核实并标注于地图。",
  }[locale] || "The curated guide to the best of independent Australia — specialty coffee, makers, distillers, galleries, boutique stays, and the natural places in between. Thousands of independent places, every one verified and mapped."
  return {
  title,
  description,
  metadataBase: new URL("https://australianatlas.com.au"),
  openGraph: {
    title,
    description,
    url: "https://australianatlas.com.au",
    siteName: "Australian Atlas",
    locale: ogLocale(locale),
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: title,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
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
  }
}

export default async function RootLayout({ children }) {
  // Try to load saved location from profile (logged-in users only)
  let savedLocation = null
  try {
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { getSupabaseAdmin } = await import('@/lib/supabase/clients')
      const sb = getSupabaseAdmin()
      const { data: profile } = await sb
        .from('profiles')
        .select('saved_latitude, saved_longitude, saved_location_name')
        .eq('id', user.id)
        .single()
      if (profile?.saved_latitude && profile?.saved_longitude) {
        savedLocation = {
          lat: profile.saved_latitude,
          lng: profile.saved_longitude,
          name: profile.saved_location_name,
        }
      }
    }
  } catch {}

  // Browsers honour preconnect hints from <body>; Mapbox tiles/statics and the
  // Supabase REST + image host are on every page's critical path.
  const supabaseOrigin = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin } catch { return null }
  })()

  // Locale resolved by next-intl from the middleware-set x-atlas-locale header.
  // Drives <html lang> and the client-side message provider. Defaults to 'en'.
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${newsreader.variable} ${dmSans.variable}`}>
      <body className="min-h-screen flex flex-col">
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
        {supabaseOrigin && <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />}
        <a href="#main-content" className="skip-link">Skip to content</a>
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocaleUrlGuardian />
          <LocationWrapper savedLocation={savedLocation}>
            <Nav />
            <main id="main-content" className="flex-1">{children}</main>
            <Footer />
          </LocationWrapper>
          <AtlasAnalytics />
          <PageTracker vertical="portal" />
          <GlobalErrorReporter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
