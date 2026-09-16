"use client"

import { ArrowUpRightIcon } from "lucide-react"

import { useMessages } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { linkTargetProps, prototypeHref, type Prototype } from "@/lib/prototypes"

import { StatusChip } from "./status-chip"

/**
 * 非精选条目的紧凑索引行 —— 没有签名视觉的仓（还没有缩略图）落在这里。
 *
 * 和展板同一条规则：**有已核实地址才是链接**。没有地址的条目渲染成一行静态
 * 信息，右侧不出现「打开」箭头（那个箭头就是「可点」的承诺），改由状态标签
 * 说明「未部署 / 受保护」。
 */
export function PrototypeIndexRow({
  prototype,
  index,
}: {
  prototype: Prototype
  index: number
}) {
  const t = useMessages()
  const href = prototypeHref(prototype)

  const row = (
    <>
      <span
        aria-hidden
        className="font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint"
      >
        {String(index).padStart(2, "0")}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold tracking-tight text-ink">
          {href ? <span className="link-sweep">{prototype.name}</span> : prototype.name}
        </span>
        <span className="mt-1.5 block text-sm text-ink-soft">
          {prototype.description}
        </span>
      </span>

      <Badge variant="outline" className="shrink-0">
        {prototype.category}
      </Badge>
      <StatusChip
        availability={prototype.availability}
        label={prototype.statusLabel}
        fieldLabel={t.card.availabilityLabel}
        className="shrink-0"
      />
      {href ? (
        <>
          <ArrowUpRightIcon
            aria-hidden
            className="size-4 shrink-0 text-ink-mute transition-transform duration-300 ease-[var(--ease-out-expo)] group-hoverable:translate-x-0.5 group-hoverable:-translate-y-0.5"
          />
          <span className="sr-only">（{t.card.externalHint}）</span>
        </>
      ) : null}
    </>
  )

  const layout =
    "flex flex-wrap items-center gap-x-8 gap-y-4 px-1 py-6 sm:flex-nowrap sm:px-3"

  return (
    <li
      className="border-b border-hairline"
      data-prototype={prototype.slug}
      data-availability={prototype.availability}
      data-clickable={href ? "true" : "false"}
    >
      {href ? (
        <a
          href={href}
          {...linkTargetProps(href)}
          className={`group ${layout} transition-colors duration-200 ease-[var(--ease-out-expo)] hoverable:hover:bg-paper-raised`}
        >
          {row}
        </a>
      ) : (
        <div className={layout}>{row}</div>
      )}
    </li>
  )
}
