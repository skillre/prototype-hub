import { cn } from "@/lib/utils"
import type { PrototypeAvailability } from "@/lib/prototypes"

/**
 * 部署可得性 → 信号点颜色。
 *
 * 以前这里映射的是手写的「成熟度」（Stable / Beta / In Progress）。那是一个
 * 无法从 catalog 证明的断言，而且它确实说过谎：AI Finance 的公开地址变成 404
 * 之后，首页仍然把它显示成 `Stable`。
 *
 * 现在显示的是 **catalog 事实**（生成物里的 `deployment.availability`）：
 *   - public      有已核实的公开地址 → 信号色
 *   - not-public  未部署，或受 SSO 保护而无法公开访问 → 墨色
 *   - unverified  catalog 里没有 deployment 段 → 浅色
 */
const DOT: Record<PrototypeAvailability, string> = {
  public: "bg-vermilion",
  "not-public": "bg-ink-soft",
  unverified: "bg-hairline-strong",
}

const TONE = {
  paper: "text-ink-soft",
  ink: "text-on-ink-soft",
} as const

export function StatusChip({
  availability,
  label,
  fieldLabel,
  tone = "paper",
  className,
}: {
  availability: PrototypeAvailability
  /** 展示标签，来自生成物（例如「未部署 / 受保护」） */
  label: string
  /** 词典里的字段名，供屏幕阅读器读出「部署: 未部署 / 受保护」 */
  fieldLabel: string
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
        className={cn("size-1.5 shrink-0 rounded-full", DOT[availability])}
      />
      <span className="sr-only">{fieldLabel}:&nbsp;</span>
      {label}
    </span>
  )
}
