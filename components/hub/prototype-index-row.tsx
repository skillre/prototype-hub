"use client"

import { ArrowUpRightIcon } from "lucide-react"

import { useMessages } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { linkTargetProps, type Prototype } from "@/lib/prototypes"

import { StatusChip } from "./status-chip"

/**
 * 非精选原型的紧凑索引行 —— registry 增长后自动出现在精选展板下方。
 * 当前只有 AI CRM（featured），所以这一层是空的，但布局已就位。
 */
export function PrototypeIndexRow({
  prototype,
  index,
}: {
  prototype: Prototype
  index: number
}) {
  const t = useMessages()

  return (
    <li className="border-b border-hairline">
      <a
        href={prototype.url}
        {...linkTargetProps(prototype.url)}
        className="group flex flex-wrap items-center gap-x-8 gap-y-4 px-1 py-6 transition-colors duration-200 ease-[var(--ease-out-expo)] hoverable:hover:bg-paper-raised sm:flex-nowrap sm:px-3"
      >
        <span
          aria-hidden
          className="font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint"
        >
          {String(index).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold tracking-tight text-ink">
            <span className="link-sweep">{prototype.name}</span>
          </span>
          <span className="mt-1.5 block text-sm text-ink-soft">
            {prototype.description}
          </span>
        </span>

        <Badge variant="outline" className="shrink-0">
          {prototype.category}
        </Badge>
        <StatusChip
          status={prototype.status}
          label={t.card.statusLabel}
          className="shrink-0"
        />
        <ArrowUpRightIcon
          aria-hidden
          className="size-4 shrink-0 text-ink-mute transition-transform duration-300 ease-[var(--ease-out-expo)] group-hoverable:translate-x-0.5 group-hoverable:-translate-y-0.5"
        />
        <span className="sr-only">（{t.card.externalHint}）</span>
      </a>
    </li>
  )
}
