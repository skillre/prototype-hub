"use client"

import { createContext, useContext, type ReactNode } from "react"
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@/lib/i18n"

/**
 * 只传 locale 字符串跨 Server → Client 边界；词典由客户端自己解析，
 * 因此不需要序列化整棵文案树。
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({
  locale = DEFAULT_LOCALE,
  children,
}: {
  locale?: Locale
  children: ReactNode
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** 组件里取文案的唯一入口：const t = useMessages()。 */
export function useMessages() {
  return getDictionary(useLocale())
}
