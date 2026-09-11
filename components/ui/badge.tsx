import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1",
    "font-mono text-[0.625rem] leading-none tracking-[0.14em] uppercase",
  ],
  {
    variants: {
      variant: {
        /** 分类：安静的描边标签 */
        outline: "border border-hairline-strong text-ink-soft",
        /** 承载于深色面板之上 */
        onInk: "border border-hairline-on-ink text-on-ink-soft",
        /** 状态：带信号点 */
        status: "text-ink-soft",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
)

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
