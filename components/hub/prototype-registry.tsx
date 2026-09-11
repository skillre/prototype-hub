import { Reveal } from "@/components/motion/reveal"
import { DEFAULT_LOCALE, getDictionary } from "@/lib/i18n"
import {
  featuredPrototypes,
  listedPrototypes,
  prototypeCount,
} from "@/lib/prototypes"

import { FeaturedPrototypeCard } from "./featured-prototype-card"
import { PrototypeIndexRow } from "./prototype-index-row"

/**
 * Prototype Registry 区块。
 *
 * 布局为「精选展板（通栏）+ 索引行（紧凑列表）」两层：
 * 第一版只有 AI CRM，占据精选位；后续原型按 `featured` 自动分流，
 * 不需要改这里的任何代码。
 */
export function PrototypeRegistry() {
  const t = getDictionary(DEFAULT_LOCALE)

  return (
    <section
      id="registry"
      aria-labelledby="registry-title"
      className="scroll-mt-20 border-t border-hairline"
    >
      <div className="mx-auto w-full max-w-shell px-6 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div>
            <p className="label-micro text-vermilion">{t.registry.index}</p>
            <h2 id="registry-title" className="mt-4 text-headline text-ink">
              {t.registry.title}
            </h2>
          </div>

          <div className="lg:max-w-md lg:text-right">
            <p className="label-micro text-ink-faint">
              {t.registry.countPrefix} {String(prototypeCount).padStart(2, "0")}{" "}
              {t.registry.countUnit}
            </p>
            <p className="mt-4 text-lede text-ink-soft text-pretty">
              {t.registry.description}
            </p>
          </div>
        </div>

        <div className="mt-14 space-y-12 lg:mt-16">
          {featuredPrototypes.map((prototype, index) => (
            <Reveal key={prototype.slug} distance={24}>
              <FeaturedPrototypeCard prototype={prototype} index={index + 1} />
            </Reveal>
          ))}
        </div>

        {listedPrototypes.length > 0 ? (
          <div className="mt-20">
            <h3 className="label-micro text-ink-faint">
              {t.registry.indexListTitle}
            </h3>
            <ul className="mt-6 border-t border-hairline">
              {listedPrototypes.map((prototype, index) => (
                <PrototypeIndexRow
                  key={prototype.slug}
                  prototype={prototype}
                  index={index + 1}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}
