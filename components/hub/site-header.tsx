"use client"

import { useMotionValueEvent, useScroll } from "motion/react"
import { useState } from "react"

import { useMessages } from "@/components/i18n/locale-provider"
import { cn } from "@/lib/utils"

/**
 * 顶部导航：滚过首屏才落下分隔线。
 * 使用不透明纸色背景——玻璃拟态不在这个设计语言里。
 */
export function SiteHeader() {
  const t = useMessages()
  const { scrollY } = useScroll()
  const [lifted, setLifted] = useState(false)

  useMotionValueEvent(scrollY, "change", (value) => {
    setLifted(value > 8)
  })

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-paper",
        "transition-[border-color] duration-300 ease-[var(--ease-out-expo)]",
        lifted ? "border-hairline" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-shell items-center justify-between px-6 sm:px-8 lg:h-18 lg:px-12">
        <a
          href="#top"
          className="inline-flex items-baseline gap-2 text-ink no-underline"
        >
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            {t.brand.company}
          </span>
          <span aria-hidden className="text-ink-faint">
            ·
          </span>
          <span className="label-micro text-ink-mute">{t.brand.product}</span>
        </a>

        <nav aria-label={t.nav.label}>
          <ul className="flex items-center gap-6 sm:gap-9">
            <li>
              <a
                href="#registry"
                className="link-sweep text-sm text-ink-soft transition-colors duration-200 ease-[var(--ease-out-expo)] hoverable:hover:text-ink"
              >
                {t.nav.registry}
              </a>
            </li>
            <li>
              <a
                href="#about"
                className="link-sweep text-sm text-ink-soft transition-colors duration-200 ease-[var(--ease-out-expo)] hoverable:hover:text-ink"
              >
                {t.nav.about}
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
