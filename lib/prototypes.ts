/**
 * ═══════════════════════════════════════════════════════════════════════
 * Prototype Registry —— 整个门户的唯一数据源
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 新增一个原型 = 在 `prototypes` 里加一条 entry。页面、卡片、链接、
 * 计数、SEO 全部自动跟随，不需要改任何组件。
 *
 * 约定：
 * - `slug`   稳定且唯一，用于 anchor id 与测试定位（kebab-case）。
 * - `url`    指向真实部署（Vercel Preview / Production）；外部地址会
 *            自动用新标签页打开。
 * - `thumbnail` 放在 `public/` 下的静态资源路径（SVG / PNG / WebP 均可）。
 * - `thumbnailAlt` 必填：缩略图的可访问描述。
 * - `featured` 精选原型进入首页的编辑式主展示位；其余进入下方的索引列表。
 */

/** 原型成熟度。新增取值时同步更新视觉映射（components/hub/status.tsx）。 */
export type PrototypeStatus = "Stable" | "Beta" | "In Progress"

/** 原型分类。新增原型时按需扩展。 */
export type PrototypeCategory =
  | "Sales"
  | "Analytics"
  | "Finance"
  | "Workflow"
  | "Operations"

export interface Prototype {
  /** 展示名称，例如 "AI CRM" */
  name: string
  /** 唯一标识，kebab-case */
  slug: string
  /** 一句话说明，中文 */
  description: string
  /** 分类 */
  category: PrototypeCategory
  /** 成熟度 */
  status: PrototypeStatus
  /** 部署地址；外部域名会用新标签页打开 */
  url: string
  /** 缩略图 / 视觉预览，位于 public/ 下 */
  thumbnail: string
  /** 缩略图替代文本 */
  thumbnailAlt: string
  /** 是否进入首页主展示位 */
  featured: boolean
}

export const prototypes: Prototype[] = [
  {
    name: "AI CRM",
    slug: "ai-crm",
    description: "智能销售工作台",
    category: "Sales",
    status: "Stable",
    /**
     * prototype-starter 的 Vercel 生产别名 + AI CRM 路由。
     * 注意：该部署开启了 Vercel Deployment Protection（Access 由项目所有者控制），
     * 门户只负责链接，不做任何绕过。
     */
    url: "https://prototype-starter-skillres-projects.vercel.app/crm",
    thumbnail: "/thumbnails/ai-crm.svg",
    thumbnailAlt: "AI CRM 收入智能视图预览：月度收入读数、趋势曲线与关键客户排名",
    featured: true,
  },
]

/** 首页主展示位（编辑式大卡）。 */
export const featuredPrototypes: Prototype[] = prototypes.filter(
  (prototype) => prototype.featured,
)

/** 其余原型（紧凑索引列表）。第一条 entry 加入后即自动出现。 */
export const listedPrototypes: Prototype[] = prototypes.filter(
  (prototype) => !prototype.featured,
)

/** 按 slug 取单个原型。 */
export function getPrototype(slug: string): Prototype | undefined {
  return prototypes.find((prototype) => prototype.slug === slug)
}

export const prototypeCount = prototypes.length

/** 是否为站外地址——决定是否 target="_blank"。 */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** 站外链接统一带上安全属性；站内链接保持同标签页。 */
export function linkTargetProps(url: string) {
  return isExternalUrl(url)
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : ({ target: "_self", rel: undefined } as const)
}
