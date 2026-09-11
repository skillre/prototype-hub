import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { DEFAULT_LOCALE, getDictionary } from "@/lib/i18n"

export default function NotFound() {
  const t = getDictionary(DEFAULT_LOCALE)

  return (
    <section className="mx-auto flex w-full max-w-shell flex-col justify-center px-6 py-28 sm:px-8 lg:px-12 lg:py-40">
      <p className="label-micro text-vermilion">{t.notFound.index}</p>
      <h1 className="mt-5 text-headline text-ink">{t.notFound.title}</h1>
      <p className="mt-4 max-w-md text-lede text-ink-soft">{t.notFound.body}</p>
      <div className="mt-9">
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          {t.notFound.cta}
        </Link>
      </div>
    </section>
  )
}
