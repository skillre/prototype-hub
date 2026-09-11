import { cn } from "@/lib/utils"
import type { PrototypeStatus } from "@/lib/prototypes"

/** 状态 → 信号点颜色。新增状态时在这里补一行。 */
const DOT: Record<PrototypeStatus, string> = {
  Stable: "bg-vermilion",
  Beta: "bg-ink-soft",
  "In Progress": "bg-hairline-strong",
}

const TONE = {
  paper: "text-ink-soft",
  ink: "text-on-ink-soft",
} as const

export function StatusChip({
  status,
  label,
  tone = "paper",
  className,
}: {
  status: PrototypeStatus
  /** 词典里的字段名，供屏幕阅读器读出「状态: Stable」 */
  label: string
  tone?: keyof typeof TONE
  className?: string
}) {
  return (
    <span
      className={cn(
        "label-micro inline-flex items-center gap-2",
        TONE[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", DOT[status])}
      />
      <span className="sr-only">{label}:&nbsp;</span>
      {status}
    </span>
  )
}
