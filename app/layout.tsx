import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { LocaleProvider } from "@/components/i18n/locale-provider"
import { SiteFooter } from "@/components/hub/site-footer"
import { SiteHeader } from "@/components/hub/site-header"
import { DEFAULT_LOCALE, getDictionary } from "@/lib/i18n"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

const t = getDictionary(DEFAULT_LOCALE)

export const metadata: Metadata = {
  title: { default: t.meta.title, template: t.meta.titleTemplate },
  description: t.meta.description,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      data-app-identity="prototype-hub"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="bg-paper text-ink">
        <LocaleProvider locale={DEFAULT_LOCALE}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[3px] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
          >
            {t.nav.skipToContent}
          </a>

          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </LocaleProvider>
      </body>
    </html>
  )
}
