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
import {
  linkTargetProps,
  prototypeHref,
  type FeaturedPrototype,
} from "@/lib/prototypes"
import { cn } from "@/lib/utils"

import { LifecycleChip, StatusChip } from "./status-chip"

/**
 * 精选原型展示位 —— 一块编辑式的「展板」，不是卡片网格里的一格：
 * 元信息行 / 名称与说明 / 大幅视觉预览，自上而下占据通栏。
 *
 * **整块是一个链接，或者整块都不是。** 只有 catalog 记录了一个已核实的公开
 * 地址时（`prototypeHref` 非 null）才渲染成 `<a>`；没有地址的条目渲染成一块
 * 静态展板，CTA 变成不可点击的「暂无公开地址」，并且不显示任何 hover 交互
 * 暗示。死链接和「看起来能点、点了没反应」是同一个错误的两种写法。
 *
 * 缩略图入场与 Reveal 同一套约束：SSR 即可见（无 JS 也看得到静帧），
 * 水合后才武装 clip-path 揭开动画；viewport 保持默认阈值，因为
 * motion@13.2.0 上数值型 amount / 负 rootMargin 会静默失效。
 */
export function FeaturedPrototypeCard({
  prototype,
  index,
}: {
  prototype: FeaturedPrototype
  index: number
}) {
  const t = useMessages()
  const reduce = useReducedMotion()
  const hydrated = useHydrated()
  const panelRef = useRef<HTMLDivElement>(null)
  const panelInView = useInView(panelRef, { once: true })

  const ordinal = String(index).padStart(2, "0")
  const revealed = !hydrated || panelInView
  const href = prototypeHref(prototype)
  const clickable = href !== null

  const panel = (
    <>
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
        <StatusChip
          availability={prototype.availability}
          label={prototype.statusLabel}
          fieldLabel={t.card.availabilityLabel}
        />
        <LifecycleChip
          status={prototype.status}
          label={prototype.lifecycleLabel}
          fieldLabel={t.card.lifecycleLabel}
        />
      </div>

      {/* 名称、说明与 CTA */}
      <div className="flex flex-col gap-7 px-5 pt-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12 lg:pt-11">
        <div className="max-w-2xl">
          <h3 className="text-title text-ink">
            {clickable ? (
              <span className="link-sweep">{prototype.name}</span>
            ) : (
              prototype.name
            )}
          </h3>
          <p className="mt-3 text-lede text-ink-soft">{prototype.description}</p>
        </div>

        {clickable ? (
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
        ) : (
          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "pointer-events-none shrink-0 self-start text-ink-mute lg:self-end",
            )}
          >
            {t.card.unavailableCta}
          </span>
        )}
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
            className={cn(
              "object-cover transition-transform duration-700 ease-[var(--ease-out-expo)]",
              clickable && "group-hoverable:scale-[1.02]",
            )}
          />
        </motion.div>
      </div>
    </>
  )

  const shell = cn(
    "block border border-hairline bg-paper-raised",
    "transition-[border-color] duration-300 ease-[var(--ease-out-expo)]",
  )

  return (
    <article
      data-prototype={prototype.slug}
      data-availability={prototype.availability}
      data-clickable={clickable ? "true" : "false"}
    >
      {clickable ? (
        <a
          href={href}
          {...linkTargetProps(href)}
          className={cn(shell, "group", "hoverable:hover:border-hairline-strong")}
        >
          {panel}
        </a>
      ) : (
        <div className={cn(shell, "cursor-default")}>{panel}</div>
      )}
    </article>
  )
}
