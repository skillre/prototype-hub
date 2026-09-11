import { ArrowDownIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { DEFAULT_LOCALE, getDictionary } from "@/lib/i18n"
import { prototypeCount } from "@/lib/prototypes"

import { AmbientField } from "./ambient-field"

/** 序号补零，保持画廊的「01」语汇。 */
const pad = (value: number) => String(value).padStart(2, "0")

/**
 * Hero —— 第一视觉是字标 "Prototype Lab"，不是仪表盘。
 *
 * 入场是纯 CSS（`.enter` / `.enter-1..3`）：四拍，小字 → 巨字 → 说明 → 底栏。
 * 不用 Motion 的原因写在 app/globals.css 里 —— CSS 版本在无 JS 时依然会播，
 * 因此首屏文案在 SSR 里就是可见的，不会出现「脚本没跑起来就一片空白」。
 *
 * 这个组件是 Server Component；唯一需要客户端的是环境光层。
 */
export function Hero() {
  const t = getDictionary(DEFAULT_LOCALE)

  return (
    <section id="top" className="relative isolate scroll-mt-20 overflow-hidden">
      <AmbientField className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <div className="mx-auto w-full max-w-shell px-6 sm:px-8 lg:px-12">
        <div className="pt-16 pb-12 sm:pt-24 lg:pt-28 lg:pb-14">
          <p className="label-micro enter text-ink-mute">{t.brand.eyebrow}</p>

          <h1 className="text-display enter enter-1 mt-4 text-balance text-ink">
            {t.hero.display}
          </h1>

          <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-12 lg:gap-12">
            <h2 className="text-headline enter enter-2 text-balance text-ink lg:col-span-7">
              {t.hero.lede}
            </h2>

            <div className="enter enter-3 flex flex-col items-start gap-7 lg:col-span-5">
              <p className="text-lede text-pretty text-ink-soft">
                {t.hero.body}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <a href="#registry" className={buttonVariants({ size: "lg" })}>
                  {t.hero.primaryCta}
                  <ArrowDownIcon aria-hidden className="size-4" />
                </a>
                <a
                  href="#about"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  {t.hero.secondaryCta}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="enter enter-3 flex flex-wrap items-center justify-between gap-x-10 gap-y-5 border-t border-hairline py-6">
          <dl className="flex flex-wrap items-center gap-x-10 gap-y-3">
            <div className="flex items-baseline gap-3">
              <dt className="label-micro text-ink-faint">
                {t.hero.facts.index.label}
              </dt>
              <dd className="text-sm text-ink-soft">
                {pad(prototypeCount)} {t.hero.facts.index.unit}
              </dd>
            </div>
            <div className="flex items-baseline gap-3">
              <dt className="label-micro text-ink-faint">
                {t.hero.facts.stack.label}
              </dt>
              <dd className="text-sm text-ink-soft">
                {t.hero.facts.stack.value}
              </dd>
            </div>
          </dl>

          <a
            href="#registry"
            className="link-sweep inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors duration-200 ease-[var(--ease-out-expo)] hoverable:hover:text-ink"
          >
            {t.hero.scrollCue}
            <ArrowDownIcon aria-hidden className="size-3.5" />
          </a>
        </div>
      </div>
    </section>
  )
}
