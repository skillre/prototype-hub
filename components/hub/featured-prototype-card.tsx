"use client"

import { ArrowUpRightIcon } from "lucide-react"
import { motion, useInView, useReducedMotion } from "motion/react"
import Image from "next/image"
import { useRef } from "react"

import { useMessages } from "@/components/i18n/locale-provider"
import { useHydrated } from "@/components/motion/use-hydrated"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { EASE_IN_OUT_QUINT } from "@/lib/motion-presets"
import { linkTargetProps, type Prototype } from "@/lib/prototypes"
import { cn } from "@/lib/utils"

import { StatusChip } from "./status-chip"

/**
 * 精选原型展示位 —— 一块编辑式的「展板」，不是卡片网格里的一格：
 * 元信息行 / 名称与说明 / 大幅视觉预览，自上而下占据通栏。
 * 整块是一个链接（站外地址自动新标签页打开），键盘只需一次 Tab。
 *
 * 缩略图入场与 Reveal 同一套约束：SSR 即可见（无 JS 也看得到静帧），
 * 水合后才武装 clip-path 揭开动画；viewport 保持默认阈值，因为
 * motion@13.2.0 上数值型 amount / 负 rootMargin 会静默失效。
 */
export function FeaturedPrototypeCard({
  prototype,
  index,
}: {
  prototype: Prototype
  index: number
}) {
  const t = useMessages()
  const reduce = useReducedMotion()
  const hydrated = useHydrated()
  const panelRef = useRef<HTMLDivElement>(null)
  const panelInView = useInView(panelRef, { once: true })

  const ordinal = String(index).padStart(2, "0")
  const revealed = !hydrated || panelInView

  return (
    <article>
      <a
        href={prototype.url}
        {...linkTargetProps(prototype.url)}
        className={cn(
          "group block border border-hairline bg-paper-raised",
          "transition-[border-color] duration-300 ease-[var(--ease-out-expo)]",
          "hoverable:hover:border-hairline-strong",
        )}
      >
        {/* 元信息行 */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-hairline px-5 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="font-mono text-[0.6875rem] tracking-[0.16em] text-vermilion"
            >
              {ordinal}
            </span>
            <Badge variant="outline">{prototype.category}</Badge>
          </div>
          <StatusChip status={prototype.status} label={t.card.statusLabel} />
        </div>

        {/* 名称、说明与 CTA */}
        <div className="flex flex-col gap-7 px-5 pt-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12 lg:pt-11">
          <div className="max-w-2xl">
            <h3 className="text-title text-ink">
              <span className="link-sweep">{prototype.name}</span>
            </h3>
            <p className="mt-3 text-lede text-ink-soft">
              {prototype.description}
            </p>
          </div>

          <span
            className={cn(
              buttonVariants({ size: "lg" }),
              "shrink-0 self-start active:scale-[0.97] lg:self-end",
            )}
          >
            {t.card.cta}
            <ArrowUpRightIcon
              aria-hidden
              className="size-4 transition-transform duration-300 ease-[var(--ease-out-expo)] group-hoverable:translate-x-0.5 group-hoverable:-translate-y-0.5"
            />
            <span className="sr-only">（{t.card.externalHint}）</span>
          </span>
        </div>

        {/* 视觉预览 */}
        <div className="px-5 pt-7 pb-5 sm:px-8 sm:pb-8">
          <motion.div
            ref={panelRef}
            className="relative aspect-[16/10] overflow-hidden bg-ink-panel"
            initial={false}
            animate={revealed ? "visible" : "hidden"}
            variants={{
              visible: {
                opacity: 1,
                clipPath: "inset(0 0 0% 0)",
              },
              hidden: {
                opacity: 0,
                // reduced-motion：只淡入，不做裁切位移
                clipPath: reduce ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
              },
            }}
            transition={{
              duration: revealed ? 0.9 : 0,
              ease: EASE_IN_OUT_QUINT,
            }}
          >
            <Image
              src={prototype.thumbnail}
              alt={prototype.thumbnailAlt}
              fill
              unoptimized
              sizes="(min-width: 1024px) 64rem, 100vw"
              className="object-cover transition-transform duration-700 ease-[var(--ease-out-expo)] group-hoverable:scale-[1.02]"
            />
          </motion.div>
        </div>
      </a>
    </article>
  )
}
