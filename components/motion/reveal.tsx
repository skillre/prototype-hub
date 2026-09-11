"use client"

import { motion, useInView, useReducedMotion } from "motion/react"
import { useRef, type ReactNode } from "react"

import { EASE_OUT_EXPO } from "@/lib/motion-presets"

import { useHydrated } from "./use-hydrated"

/**
 * 滚动入场。只动 opacity + transform，进入视口一次即停。
 * 只用于首屏以下的区块；首屏元素交给 Hero 的入场动画。
 *
 * 三条不能改的约束：
 *
 * 1. **内容绝不能「因为动画没触发」而看不见。**
 *    始终渲染同一个 motion.div，靠 variant 切换：`!hydrated` 时为 visible，
 *    所以 SSR 输出与无 JS 场景下内容都是可见的；水合后才切到 hidden 起手。
 *    不用「div → motion.div」的条件渲染——那会 remount DOM 子树，
 *    自动化工具会拿到已脱离文档的节点。
 *
 * 2. **隐藏必须瞬时，揭示才带动画。**
 *    水合那一刻若元素在视口外，用 duration 0 立刻藏起来，用户看不到跳变；
 *    滚进视口时再用 0.7s 播放入场。
 *
 * 3. **`viewport` 保持默认阈值。**
 *    实测 motion@13.2.0：数值型 `amount`（如 0.2）与负 `margin`
 *    （如 "-120px"）都会让 `whileInView` / `useInView` 静默失效，
 *    元素永远停在 opacity 0。不要改回去。
 */
export function Reveal({
  children,
  delay = 0,
  distance = 16,
  className,
}: {
  children: ReactNode
  delay?: number
  distance?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const hydrated = useHydrated()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })

  const revealed = !hydrated || inView

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={revealed ? "visible" : "hidden"}
      variants={{
        visible: { opacity: 1, transform: "translate3d(0, 0, 0)" },
        hidden: {
          opacity: 0,
          transform: reduce ? "none" : `translate3d(0, ${distance}px, 0)`,
        },
      }}
      transition={{
        duration: revealed ? 0.7 : 0,
        delay: revealed ? delay : 0,
        ease: EASE_OUT_EXPO,
      }}
    >
      {children}
    </motion.div>
  )
}
