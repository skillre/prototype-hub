"use client"

import { useSyncExternalStore } from "react"

/** 空订阅 —— 只借 useSyncExternalStore 拿「是否已水合」这一个布尔值。 */
const subscribe = () => () => {}

/**
 * SSR 与首次水合渲染返回 false，水合完成后返回 true。
 *
 * 用途：先让内容以「完全可见」的状态进入 HTML（无 JS、爬虫、截图工具都能
 * 拿到内容），水合完成后再武装入场动画。
 *
 * 不用 `useEffect` + `setState`：那会触发 react-hooks/set-state-in-effect，
 * 而且会把元素整棵换掉（remount），自动化工具会拿到已脱离 DOM 的节点。
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
