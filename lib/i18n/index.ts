import { zhCN, type Dictionary } from "./dictionaries/zh-CN"

/**
 * 轻量 i18n —— 不引入 i18n 框架，不引入路由前缀。
 * 当前只有 zh-CN；新增语言 = 加一个词典文件 + 在这里注册。
 */
export const LOCALES = ["zh-CN"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "zh-CN"

const DICTIONARIES: Record<Locale, Dictionary> = {
  "zh-CN": zhCN,
}

/** 取词典。未知 locale 回落到默认语言，永不返回 undefined。 */
export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
}

export type { Dictionary }
