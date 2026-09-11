/**
 * 共享动效预设（只给 Motion 用的部分）。
 *
 * 原则（克制）：
 * - 自定义缓动曲线，不用内置 ease-in（起步迟钝、显得卡）。
 * - UI 交互 < 300ms；滚动入场 0.7–0.9s，因为它只发生一次。
 * - 只动 transform / opacity / clip-path。
 *
 * Hero 入场不走这里 —— 它是纯 CSS 关键帧，见 app/globals.css 的 `.enter`。
 */

/** 强 ease-out：进入、悬停、反馈。 */
export const EASE_OUT_EXPO: [number, number, number, number] = [0.23, 1, 0.32, 1]

/** 强 ease-in-out：屏幕内的位移与形变。 */
export const EASE_IN_OUT_QUINT: [number, number, number, number] = [
  0.77, 0, 0.175, 1,
]
