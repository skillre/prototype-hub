import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * shadcn/ui 风格的 Button 原语。
 * 需要把按钮渲染成链接时用 `buttonVariants()` 取类名（见 Hero / Card），
 * 避免为单个场景引入 Slot 依赖。
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none cursor-pointer",
    "transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out-expo)]",
    "active:scale-[0.97]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hoverable:hover:bg-ink-panel-raised",
        outline:
          "border border-hairline-strong text-ink hoverable:hover:border-ink hoverable:hover:bg-paper-raised",
        ghost: "text-ink-soft hoverable:hover:text-ink",
      },
      size: {
        sm: "h-8 rounded-[3px] px-3 text-[0.8125rem]",
        default: "h-10 rounded-[3px] px-4 text-sm",
        lg: "h-12 rounded-[3px] px-6 text-[0.9375rem]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
)

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
