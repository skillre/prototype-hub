"use client"

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react"
import { useEffect, useRef } from "react"

const GRID_ID = "hub-grid"
/** 环境光扫过量：光标位移的一部分，让它「漂」过去而不是贴上去。 */
const DRIFT = 0.5

/**
 * 背景层：细网格 + 一点跟随光标的环境光。
 *
 * 约束：不使用玻璃拟态、不做满屏渐变。
 * 光是一个很小的径向渐变，位移只写 transform（合成层），
 * 且只在有真实指针的设备上跟随；触屏与 reduced-motion 下保持静止。
 */
export function AmbientField({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 55, damping: 22, mass: 0.7 })
  const springY = useSpring(y, { stiffness: 55, damping: 22, mass: 0.7 })
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduce) return
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return

    const onPointerMove = (event: PointerEvent) => {
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!anchor) return
      const centerX = anchor.left + anchor.width / 2
      const centerY = anchor.top + anchor.height / 2
      x.set((event.clientX - centerX) * DRIFT)
      y.set((event.clientY - centerY) * DRIFT)
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => window.removeEventListener("pointermove", onPointerMove)
  }, [reduce, x, y])

  return (
    <div aria-hidden className={className}>
      {/* 细网格，向下渐隐 */}
      <svg className="absolute inset-0 size-full text-ink">
        <defs>
          <pattern
            id={GRID_ID}
            width="88"
            height="88"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M88 0H0V88"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.06"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient id={`${GRID_ID}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`${GRID_ID}-mask`}>
            <rect width="100%" height="100%" fill={`url(#${GRID_ID}-fade)`} />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={`url(#${GRID_ID})`}
          mask={`url(#${GRID_ID}-mask)`}
        />
      </svg>

      {/* 环境光：外层负责定位，内层只吃光标位移 */}
      <div
        ref={anchorRef}
        className="absolute top-[24%] left-[64%] size-[46rem] -translate-x-1/2 -translate-y-1/2"
      >
        <motion.div
          className="size-full rounded-full"
          style={{
            x: springX,
            y: springY,
            background:
              "radial-gradient(closest-side, rgba(200,104,72,0.16), rgba(200,104,72,0.06) 46%, rgba(200,104,72,0.015) 68%, transparent 80%)",
          }}
        />
      </div>
    </div>
  )
}
