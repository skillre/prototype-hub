import { DEFAULT_LOCALE, getDictionary } from "@/lib/i18n"
import { catalogSource } from "@/lib/prototypes"

export function SiteFooter() {
  const t = getDictionary(DEFAULT_LOCALE)
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex w-full max-w-shell flex-col gap-8 px-6 py-12 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:py-16">
        <div>
          <p className="flex items-baseline gap-2 text-ink">
            <span className="text-[0.9375rem] font-semibold tracking-tight">
              {t.brand.company}
            </span>
            <span aria-hidden className="text-ink-faint">
              ·
            </span>
            <span className="label-micro text-ink-mute">
              {t.brand.product}
            </span>
          </p>
          <p className="mt-3 text-sm text-ink-soft">{t.footer.tagline}</p>
          <p className="mt-2 text-xs text-ink-faint">
            {t.footer.catalogNote}
            {catalogSource.catalogGeneratedAt
              ? ` · ${t.footer.catalogSnapshot} ${catalogSource.catalogGeneratedAt}`
              : null}
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <a
            href="#top"
            className="link-sweep self-start text-sm text-ink-soft transition-colors duration-200 ease-[var(--ease-out-expo)] hoverable:hover:text-ink lg:self-end"
          >
            {t.footer.backToTop}
          </a>
          <p className="text-xs text-ink-faint">
            © {year} {t.brand.company} · {t.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  )
}
